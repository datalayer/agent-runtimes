# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Who may hold a session of a deployment (plans/LOOP.md, D-02).

A hosted deployment says who may open it — only its owner, the people they
invite, their organization, anyone with the link, everyone — and ai-agents
decides it. A runtime asks before it opens or serves a session of a
deployment, with the caller's own token
(`GET /apps/deployments/{uid}/opens`), and refuses in ai-agents' sentence
whoever it does not let in: the principal's token the runtime already holds
for the deployment is no reason to let anybody else talk to it.

An answer is remembered for a minute, per deployment and caller, so a
conversation costs one call and a level narrowed reaches a session within a
minute. A caller not signed in holds no session of a deployment: signed-out
sessions are R-30's, and not built. The machine itself is not asked about.
"""

from __future__ import annotations

import time
from typing import Any, Awaitable, Callable, Dict, Optional, Tuple

__all__ = [
    "REMEMBERED_SECONDS",
    "SIGNED_OUT",
    "NotLetIn",
    "ensure_may_open",
    "forget_openings",
    "use_opener",
]

#: How long an answer is trusted.
REMEMBERED_SECONDS = 60.0

#: Said to a caller with no account, whatever the level (R-30 is not built).
SIGNED_OUT = (
    "A conversation with it needs a Datalayer account for now: sign in to use it. "
    "Conversations without an account are not built yet."
)


class NotLetIn(Exception):
    """A caller the deployment does not let in: the status to answer, and why."""

    def __init__(self, status: int, reason: str):
        """Keep the status to answer and the sentence that says why."""
        self.status = status
        self.reason = reason
        super().__init__(reason)


#: (deployment uid, caller uid) -> (refusal or None, until).
_ANSWERS: Dict[Tuple[str, str], Tuple[Optional[NotLetIn], float]] = {}


def forget_openings() -> None:
    """Forget every answer (a test)."""
    _ANSWERS.clear()


async def _ask_ai_agents(deployment_uid: str, bearer: str) -> Tuple[int, str]:
    """What ai-agents answers the caller: its status, and its sentence when it refuses."""
    import httpx
    from datalayer_core.utils.urls import DatalayerURLs

    url = getattr(DatalayerURLs.from_environment(), "ai_agents_url", "") or ""
    if not url:
        return 503, "Who may open it cannot be asked: no ai-agents is configured."
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{url.rstrip('/')}/api/ai-agents/v1/apps/deployments/{deployment_uid}/opens",
                headers={"Authorization": f"Bearer {bearer}"},
            )
    except httpx.HTTPError as error:
        return 503, f"ai-agents could not be asked who may open it: {error}."
    detail = ""
    if response.status_code >= 300:
        try:
            detail = str((response.json() or {}).get("detail") or "")
        except ValueError:
            detail = response.text[:200]
    return response.status_code, detail


#: Who answers; replaced by a test.
_opener: Dict[str, Callable[[str, str], Awaitable[Tuple[int, str]]]] = {
    "ask": _ask_ai_agents
}


def use_opener(
    opener: Optional[Callable[[str, str], Awaitable[Tuple[int, str]]]],
) -> None:
    """Who answers who may open a deployment: ai-agents, or a test; ``None`` for ai-agents."""
    _opener["ask"] = opener or _ask_ai_agents
    forget_openings()


async def ensure_may_open(deployment_uid: str, caller: Any, bearer: str) -> None:
    """
    Let the caller hold a session of the deployment, or refuse them.

    Parameters
    ----------
    deployment_uid : str
        The deployment the session is of.
    caller : Caller
        Who called (`agent_runtimes.loop.apps.callers`).
    bearer : str
        The caller's token.

    Raises
    ------
    NotLetIn
        When the deployment does not let them in, in ai-agents' sentence.
    """
    kind = getattr(caller, "kind", "")
    if kind == "local":
        return
    if kind == "anonymous" or not bearer:
        raise NotLetIn(401, SIGNED_OUT)
    key = (deployment_uid, str(getattr(caller, "uid", "") or bearer))
    remembered = _ANSWERS.get(key)
    if remembered and remembered[1] > time.monotonic():
        if remembered[0] is not None:
            raise remembered[0]
        return
    status, detail = await _opener["ask"](deployment_uid, bearer)
    if status == 200:
        _ANSWERS[key] = (None, time.monotonic() + REMEMBERED_SECONDS)
        return
    refusal = NotLetIn(
        status if status in (401, 403, 404) else 503,
        detail or f"ai-agents did not say who may open it ({status}).",
    )
    if refusal.status != 503:
        _ANSWERS[key] = (refusal, time.monotonic() + REMEMBERED_SECONDS)
    raise refusal
