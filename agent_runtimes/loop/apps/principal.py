# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A deployment's agent acts as its application's principal (plans/LOOP.md, I-03).

A deployed application is somebody of its own on the platform: a service
principal, whose token names it, its owner, the deployment it acts for, and
exactly what that deployment was granted (`authorization_details`, checked
live by every service reading it). Its agent on a runtime acts with that
token and with nothing else — not the runtime's inference token, not the
token of the person who launched the runtime.

How the token gets here: the agent of a deployment is made on a runtime by
whoever opens its session — the scheduler on a tick, the hosted page — with
`app_instance.deployment_uid` and their own token. With that token the
runtime asks ai-agents for the principal's
(`POST /apps/deployments/{uid}/principal-token`), keeps it in memory, by
deployment, and asks again with the token of the latest request when less
than :data:`REFRESH_MARGIN_SECONDS` are left. Without it the agent is not
made; once it has expired the agent calls nothing, and says so.

What it is used for: model calls through ai-inference (metered on the owner,
naming the principal), the Datalayer MCP gateway (as a run with an identity
of its own), and the session's record in ai-agents.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Awaitable, Callable, Mapping, Optional

logger = logging.getLogger(__name__)

__all__ = [
    "REFRESH_MARGIN_SECONDS",
    "PrincipalTokenMissing",
    "api_key_for",
    "deployment_of",
    "ensure_principal_token",
    "forget_principal_token",
    "give_principal_token",
    "principal_token",
    "principal_token_refusal",
]

#: Asked again when less than this is left: a session in progress never meets
#: an expired token while somebody is still talking to it.
REFRESH_MARGIN_SECONDS = 300

#: deployment uid -> {"token", "expires_at", "principal_uid"}. Process memory only.
_HELD: dict[str, dict[str, Any]] = {}


class PrincipalTokenMissing(RuntimeError):
    """A deployment's agent with no principal's token it may use, in a sentence."""


def deployment_of(app_instance: Optional[Mapping[str, Any]]) -> str:
    """The deployment an agent serves, or ``""`` for a Preview, a test or no application."""
    if not app_instance:
        return ""
    return str(app_instance.get("deployment_uid") or "").strip()


def give_principal_token(
    deployment_uid: str, token: str, *, expires_in: int, principal_uid: str = ""
) -> None:
    """Keep the principal's token for a deployment, for ``expires_in`` seconds."""
    _HELD[deployment_uid] = {
        "token": token,
        "expires_at": time.time() + max(0, int(expires_in)),
        "principal_uid": principal_uid,
    }


def forget_principal_token(deployment_uid: str) -> None:
    """Forget a deployment's token (its agent deleted, a test)."""
    _HELD.pop(deployment_uid, None)


def principal_token_refusal(deployment_uid: str) -> Optional[str]:
    """Why the deployment's agent cannot act now, or ``None`` when it can."""
    held = _HELD.get(deployment_uid)
    if not held:
        return (
            f"The agent of deployment {deployment_uid} holds no token of its "
            "application's principal: it acts in nobody's name, and calls nothing."
        )
    if held["expires_at"] <= time.time():
        when = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime(held["expires_at"]))
        return (
            f"The token of deployment {deployment_uid}'s principal expired at {when}: "
            "it calls nothing more. Open a new session."
        )
    return None


def principal_token(deployment_uid: str) -> Optional[str]:
    """The principal's token for a deployment, or ``None`` when it has none it may use."""
    if principal_token_refusal(deployment_uid):
        return None
    return str(_HELD[deployment_uid]["token"])


async def _ask_ai_agents(deployment_uid: str, bearer: str) -> dict[str, Any]:
    import httpx
    from datalayer_core.utils.urls import DatalayerURLs

    url = getattr(DatalayerURLs.from_environment(), "ai_agents_url", "") or ""
    if not url:
        raise PrincipalTokenMissing(
            f"The principal of deployment {deployment_uid} cannot be asked for: no ai-agents is configured."
        )
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                f"{url.rstrip('/')}/api/ai-agents/v1/apps/deployments/{deployment_uid}/principal-token",
                headers={"Authorization": f"Bearer {bearer}"},
            )
    except httpx.HTTPError as error:
        raise PrincipalTokenMissing(
            f"ai-agents could not be asked for the principal of deployment {deployment_uid}: {error}."
        ) from error
    if response.status_code >= 300:
        detail = ""
        try:
            detail = str((response.json() or {}).get("detail") or "")
        except ValueError:
            detail = response.text[:200]
        raise PrincipalTokenMissing(
            f"ai-agents gave deployment {deployment_uid} no principal's token "
            f"({response.status_code}){': ' + detail if detail else ''}."
        )
    return dict(response.json() or {})


#: Who is asked; replaced by a test.
_asker: dict[str, Callable[[str, str], Awaitable[dict[str, Any]]]] = {
    "ask": _ask_ai_agents
}


def use_asker(asker: Optional[Callable[[str, str], Awaitable[dict[str, Any]]]]) -> None:
    """Who answers the principal's token: ai-agents, or a test; ``None`` for ai-agents."""
    _asker["ask"] = asker or _ask_ai_agents


async def ensure_principal_token(deployment_uid: str, bearer: Optional[str]) -> str:
    """
    The principal's token for a deployment, asked for when none is held or it runs out.

    Parameters
    ----------
    deployment_uid : str
        The deployment the agent serves.
    bearer : str | None
        The token of whoever opened the session or sent the request.

    Returns
    -------
    str
        The token.

    Raises
    ------
    PrincipalTokenMissing
        When none is held and none could be had: the agent is not made, or
        calls nothing.
    """
    held = _HELD.get(deployment_uid)
    fresh = (
        held is not None and held["expires_at"] - time.time() > REFRESH_MARGIN_SECONDS
    )
    if fresh:
        return str(held["token"])  # type: ignore[index]
    if bearer:
        try:
            answer = await _asker["ask"](deployment_uid, bearer)
        except PrincipalTokenMissing:
            if principal_token(deployment_uid):
                # Still good for a few minutes: the next request asks again.
                return str(_HELD[deployment_uid]["token"])
            raise
        token = str(answer.get("access_token") or "")
        if not token:
            raise PrincipalTokenMissing(
                f"ai-agents answered deployment {deployment_uid} no principal's token."
            )
        give_principal_token(
            deployment_uid,
            token,
            expires_in=int(answer.get("expires_in") or 0),
            principal_uid=str(answer.get("principal_uid") or ""),
        )
        logger.info(
            "Deployment %s acts as its principal %s.",
            deployment_uid,
            answer.get("principal_uid") or "?",
        )
        return token
    refusal = principal_token_refusal(deployment_uid)
    if refusal:
        raise PrincipalTokenMissing(refusal)
    return str(_HELD[deployment_uid]["token"])


def api_key_for(deployment_uid: str) -> Callable[[], Awaitable[str]]:
    """
    The API key a deployment's model calls ai-inference with: its principal's token.

    Read as each call is made, as the runtime's inference token is, and never
    that token in its place.

    Parameters
    ----------
    deployment_uid : str
        The deployment.

    Returns
    -------
    Callable[[], Awaitable[str]]
        What the OpenAI client asks before each request.
    """

    async def api_key() -> str:
        from agent_runtimes.models.offered import InferenceTokenMissing

        refusal = principal_token_refusal(deployment_uid)
        if refusal:
            raise InferenceTokenMissing(refusal)
        return str(_HELD[deployment_uid]["token"])

    return api_key
