# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What an application learns (LOOP R-26, decided 2026-10-06).

A conversation proposes a skill, which queues for its owner; the agent reads
and follows only the skills its owner approved, read from ai-agents each
time; a visitor without an account proposes nothing; both tools are reading
to its rules.
"""

import asyncio
from typing import Any, Dict, List, Tuple

import pytest

from agent_runtimes.loop.apps import record
from agent_runtimes.loop.apps.learning import (
    LEARNING_CLASSES,
    PROPOSE_TOOL,
    USE_TOOL,
    AppLearningCapability,
)
from agent_runtimes.loop.apps.loading import load_app
from agent_runtimes.loop.apps.plugins import rules_for

SPEC = {
    "schema": "loop.app/v1",
    "id": "desk",
    "name": "Desk",
    "kind": "chat",
    "agent": "cog-crawler:0.0.1",
}


class AiAgents:
    """ai-agents' skills routes, as the runtime asks them."""

    def __init__(self) -> None:
        self.asked: List[Tuple[str, Dict[str, Any], str]] = []
        self.proposed: List[Dict[str, Any]] = []
        self.approved: List[Dict[str, Any]] = []

    async def __call__(
        self, path: str, body: Dict[str, Any], token: str
    ) -> Tuple[int, Dict[str, Any]]:
        self.asked.append((path, body, token))
        if path == "/skills/proposals":
            if any(s["name"] == body["name"] for s in self.proposed):
                return 409, {
                    "detail": f"A skill called {body['name']} is already proposed."
                }
            self.proposed.append(body)
            return 200, {"skill": {**body, "state": "proposed"}}
        if path == "/skills/approved":
            return 200, {"skills": list(self.approved)}
        return 404, {}


@pytest.fixture()
def learning(monkeypatch: pytest.MonkeyPatch) -> Tuple[AppLearningCapability, AiAgents]:
    monkeypatch.setattr(record, "token_for", lambda deployment: ("the-token", ""))
    service = AiAgents()
    return (
        AppLearningCapability(
            app=load_app(SPEC), app_uid="app-1", deployment_uid="dep-1", ask=service
        ),
        service,
    )


def test_a_proposal_queues_for_its_owner_and_is_not_used(learning) -> None:
    capability, service = learning
    said = asyncio.run(
        capability.propose_skill(
            "weekly-digest", "When asked for the digest.", "1. Read.\n2. Write."
        )
    )
    assert "not used until they approve it" in said
    path, body, token = service.asked[0]
    assert (path, body["app_uid"], body["deployment_uid"], token) == (
        "/skills/proposals",
        "app-1",
        "dep-1",
        "the-token",
    )
    # Proposed, not approved: nothing to follow.
    assert (
        asyncio.run(capability.use_learned_skill())
        == "Your owner has approved no skill yet."
    )
    assert "No approved skill is called weekly-digest" in asyncio.run(
        capability.use_learned_skill("weekly-digest")
    )
    # A refusal is said in ai-agents' words.
    again = asyncio.run(capability.propose_skill("weekly-digest", "Again.", "1."))
    assert (
        again
        == "The skill was not proposed: A skill called weekly-digest is already proposed."
    )


def test_only_approved_skills_are_listed_and_followed(learning) -> None:
    capability, service = learning
    service.approved = [
        {
            "name": "weekly-digest",
            "description": "When asked for the digest.",
            "instructions": "1. Read.\n2. Write.",
        }
    ]
    assert (
        asyncio.run(capability.use_learned_skill())
        == "- weekly-digest: When asked for the digest."
    )
    followed = asyncio.run(capability.use_learned_skill("weekly-digest"))
    assert followed.startswith("# weekly-digest") and "1. Read." in followed
    # Read again each time: declined, it is gone.
    service.approved = []
    assert (
        asyncio.run(capability.use_learned_skill())
        == "Your owner has approved no skill yet."
    )


def test_a_visitor_without_an_account_proposes_nothing(
    learning, monkeypatch: pytest.MonkeyPatch
) -> None:
    from agent_runtimes.loop.apps import visitors

    capability, service = learning
    monkeypatch.setattr(visitors, "visitors_runtime", lambda: True)
    said = asyncio.run(capability.propose_skill("x", "y", "z"))
    assert said.startswith("Nothing is kept of a conversation without an account")
    assert service.asked == []


def test_an_application_run_from_its_file_learns_nothing() -> None:
    capability = AppLearningCapability(app=load_app(SPEC))
    assert "run from its file" in asyncio.run(capability.propose_skill("x", "y", "z"))
    assert "run from its file" in asyncio.run(capability.use_learned_skill())


def test_both_tools_are_reading_to_its_rules() -> None:
    rules = rules_for(load_app(SPEC))
    assert set(LEARNING_CLASSES) == {PROPOSE_TOOL, USE_TOOL}
    for tool in (PROPOSE_TOOL, USE_TOOL):
        assert rules.decide(tool, {}).decision.behaviour == "do_it"
