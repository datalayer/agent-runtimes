# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What an application learns: skills its conversations propose, used once its owner approved them (LOOP R-26).

An application saved on Datalayer is given two tools:

- ``propose_skill``: what was just done, written so that it can be done
  again — a name, a line saying when it serves, and its instructions. It is
  sent to ai-agents (`/api/ai-agents/v1/apps/skills/proposals`), where it
  queues for the application's owner, who reviews it on the application's
  page in the Studio (decided 2026-10-06). Proposing changes nothing: the
  application does not use it.
- ``use_learned_skill``: the skills its owner **approved**, listed, and one
  of them read in full to follow it. Read from ai-agents each time
  (`/api/ai-agents/v1/apps/skills/approved`), so that a skill declined stops
  being used at once — and only the approved ones: **an unreviewed skill is
  never loaded**, whatever a conversation proposed.

Both write and read with the token of the run, as its record is written
(`record.token_for`): a deployment's application principal, to its owner's
queue; a Preview's person, to their own. Neither touches anything outside
the platform — the owner decides — so both are reading to its rules
(`LEARNING_CLASSES`). A visitor without an account proposes nothing: nothing
is kept of a conversation without an account (R-30).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, List, Mapping, Optional

from pydantic_ai.capabilities import AbstractCapability

from agent_runtimes.types import AppSpec

logger = logging.getLogger(__name__)

#: The tools its agent is given.
PROPOSE_TOOL = "propose_skill"
USE_TOOL = "use_learned_skill"

#: What they do, to its rules: neither acts outside the platform.
LEARNING_CLASSES: Mapping[str, List[str]] = {
    PROPOSE_TOOL: ["read"],
    USE_TOOL: ["read"],
}

#: How long ai-agents is waited for, in seconds.
TIMEOUT = 15.0

#: What asks ai-agents: the path under `/api/ai-agents/v1/apps`, the body,
#: and the token; answers the status and the body.
Ask = Callable[[str, Dict[str, Any], str], Awaitable[tuple[int, Dict[str, Any]]]]


class NotLearned(RuntimeError):
    """Why a skill could not be proposed or read, in a sentence."""


async def ask_ai_agents(
    path: str, body: Dict[str, Any], token: str
) -> tuple[int, Dict[str, Any]]:
    """POST to ai-agents' applications routes with the token of the run."""
    import httpx
    from datalayer_core.utils.urls import DatalayerURLs

    url = getattr(DatalayerURLs.from_environment(), "ai_agents_url", "") or ""
    if not url:
        raise NotLearned("no ai-agents is configured")
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.post(
                f"{url.rstrip('/')}/api/ai-agents/v1/apps{path}",
                json=body,
                headers={"Authorization": f"Bearer {token}"},
            )
    except httpx.HTTPError as error:
        raise NotLearned(f"ai-agents could not be reached: {error}") from error
    try:
        answered = response.json() if response.content else {}
    except ValueError:
        answered = {"detail": response.text[:200]}
    return response.status_code, answered if isinstance(answered, dict) else {}


def skill_in_words(skill: Mapping[str, Any]) -> str:
    """An approved skill, as the agent reads it to follow it."""
    return (
        f"# {skill.get('name')}\n\n"
        f"When: {skill.get('description')}\n\n"
        f"{skill.get('instructions')}"
    )


@dataclass
class AppLearningCapability(AbstractCapability[Any]):
    """Gives an application's agent what it learned, and a way to propose more."""

    app: AppSpec
    """The application."""

    app_uid: str = ""
    """The application on Datalayer: what its skills are kept under."""

    deployment_uid: str = ""
    """Its deployment, when it runs as one: then it asks as its principal."""

    ask: Optional[Ask] = None
    """How ai-agents is asked; over HTTP, with the token of the run, when unsaid."""

    async def _post(self, path: str, body: Dict[str, Any]) -> Dict[str, Any]:
        from agent_runtimes.loop.apps.record import token_for

        token, refusal = token_for(self.deployment_uid)
        if not token:
            raise NotLearned(f"there is no token to ask with: {refusal}")
        status, answered = await (self.ask or ask_ai_agents)(path, body, token)
        if status >= 300:
            raise NotLearned(
                str(answered.get("detail") or f"ai-agents answered {status}")
            )
        return answered

    async def approved(self) -> List[Dict[str, Any]]:
        """The skills its owner approved, read now; `NotLearned` when they cannot be."""
        answered = await self._post(
            "/skills/approved",
            {"app_uid": self.app_uid, "deployment_uid": self.deployment_uid},
        )
        return [s for s in answered.get("skills") or [] if isinstance(s, dict)]

    async def propose_skill(
        self, name: str, description: str, instructions: str
    ) -> str:
        """Propose a reusable skill from what was just done, for your owner to review.

        Use it when the conversation worked out how to do something that will
        be asked again — a procedure, a format, the steps that got it right —
        written so that it can be done again without this conversation. It is
        not used until your owner approves it in the Studio: say so, and go on.

        Args:
            name: Lower-case words joined by dashes, e.g. `weekly-digest`.
            description: One line saying when the skill serves.
            instructions: What to do, step by step, in markdown.
        """
        from agent_runtimes.loop.apps.record import current_session
        from agent_runtimes.loop.apps.visitors import in_visitor_turn, visitors_runtime

        if visitors_runtime() or in_visitor_turn():
            return (
                "Nothing is kept of a conversation without an account: no skill is "
                "proposed from it. Go on without it."
            )
        if not self.app_uid:
            return (
                "Skills are proposed for an application saved on Datalayer, and "
                "this one is run from its file: say that nothing was proposed."
            )
        try:
            answered = await self._post(
                "/skills/proposals",
                {
                    "app_uid": self.app_uid,
                    "deployment_uid": self.deployment_uid,
                    "session_uid": current_session(),
                    "name": str(name or "").strip(),
                    "description": str(description or "").strip(),
                    "instructions": str(instructions or "").strip(),
                },
            )
        except NotLearned as error:
            logger.info("%s did not propose %r: %s", self.app.id, name, error)
            return f"The skill was not proposed: {error}"
        skill = answered.get("skill") or {}
        return (
            f"Proposed “{skill.get('name') or name}” for your owner to review: it "
            "is not used until they approve it on your page in the Studio."
        )

    async def use_learned_skill(self, name: str = "") -> str:
        """The skills your owner approved: listed, or one read in full to follow it.

        Call it with no name to list them, each with when it serves; with a
        name, to read its instructions and follow them. Only skills your owner
        approved are here.

        Args:
            name: The skill to read; none to list them.
        """
        if not self.app_uid:
            return "No skill was learned here: it is run from its file."
        try:
            approved = await self.approved()
        except NotLearned as error:
            return f"Its skills could not be read: {error} Go on without them."
        wanted = str(name or "").strip()
        if not wanted:
            if not approved:
                return "Your owner has approved no skill yet."
            return "\n".join(
                f"- {skill.get('name')}: {skill.get('description')}"
                for skill in approved
            )
        found = next((s for s in approved if s.get("name") == wanted), None)
        if found is None:
            return (
                f"No approved skill is called {wanted}: "
                f"{', '.join(str(s.get('name')) for s in approved) or 'none is approved'}."
            )
        return skill_in_words(found)

    def get_toolset(self) -> Any:
        """The two tools."""
        from pydantic_ai.toolsets import FunctionToolset

        return FunctionToolset(
            [self.propose_skill, self.use_learned_skill], id="learning"
        )


__all__ = [
    "AppLearningCapability",
    "LEARNING_CLASSES",
    "NotLearned",
    "PROPOSE_TOOL",
    "USE_TOOL",
    "skill_in_words",
]
