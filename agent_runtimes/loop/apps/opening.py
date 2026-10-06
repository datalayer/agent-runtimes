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
minute. A visitor without an account (R-30, on the visitors' runtime) is
asked about with no token: ai-agents lets them talk to an application anyone
with the link or everyone may open when it needs nothing a visitor nobody
knows may not be given, and says why not otherwise. An embed token is asked
about with itself: ai-agents lets it into a live embedded deployment of the
one application it names, of the owner who was issued it (LOOP R-20), and
only for a page of a site its owner allows it on (D-12): the runtime says
the page's origin, as the visitor's browser sent it (`PAGE_ORIGIN`). A
caller with no token who is not a visitor holds no session. The machine
itself is not asked about.
"""

from __future__ import annotations

import time
from contextvars import ContextVar
from typing import Any, Awaitable, Callable, Dict, Optional, Tuple

__all__ = [
    "PAGE_ORIGIN",
    "REMEMBERED_SECONDS",
    "SIGNED_OUT",
    "NotLetIn",
    "ensure_may_open",
    "forget_openings",
    "use_opener",
]

#: The origin of the page an embed's visitor is on, for this request: what
#: the visitor's browser sent, said to ai-agents (LOOP D-12).
PAGE_ORIGIN: ContextVar[str] = ContextVar("loop_embed_page_origin", default="")

#: The header ai-agents reads it in.
PAGE_ORIGIN_HEADER = "X-Datalayer-Embed-Origin"


def page_origin_headers() -> Dict[str, str]:
    """The page's origin as a header, when an embed's visitor is calling."""
    origin = PAGE_ORIGIN.get()
    return {PAGE_ORIGIN_HEADER: origin} if origin else {}


#: How long an answer is trusted.
REMEMBERED_SECONDS = 60.0

#: Said to a caller who sent no token.
SIGNED_OUT = (
    "Who is calling is not said: sign in, or open it as a visitor from its page."
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
                # A visitor is asked about as nobody: ai-agents does not take their token.
                headers={
                    **({"Authorization": f"Bearer {bearer}"} if bearer else {}),
                    **page_origin_headers(),
                },
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
    if kind == "visitor":
        # Every visitor nobody knows is let in, or not, alike (R-30).
        bearer = ""
    elif not bearer:
        raise NotLetIn(401, SIGNED_OUT)
    key = (
        deployment_uid,
        ""
        if kind == "visitor"
        # An embed's visit on the page it is on, apart from its owner's own
        # answer (LOOP R-20, D-12).
        else f"embed:{getattr(caller, 'visit', '')}@{PAGE_ORIGIN.get()}"
        if kind == "embed"
        else str(getattr(caller, "uid", "") or bearer),
    )
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
