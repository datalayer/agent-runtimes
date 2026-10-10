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

**A Preview is held to the same grants** (LOOP R-25, decided 2026-10-06):
though it runs as the person trying it, it reaches only the Spaces its
application is granted. As its session opens, and on each of its requests,
the runtime asks ai-agents with the person's token for a token of theirs
narrowed to the Spaces the Appspec it runs grants
(`POST /apps/{app_uid}/preview-token`, minted by IAM) — none when it grants
none — keeps it here beside the principals' and asks again before it runs
out, the same way (`ensure_preview_token`). Its runs carry that token in
place of the person's (`sessions.LiveSession.forward`); its model calls do
not change.
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from typing import Any, Awaitable, Callable, Mapping, Optional

logger = logging.getLogger(__name__)

__all__ = [
    "REFRESH_MARGIN_SECONDS",
    "PrincipalTokenMissing",
    "api_key_for",
    "deployment_of",
    "ensure_preview_token",
    "ensure_principal_token",
    "forget_principal_token",
    "gateway_toolsets_of_the_run",
    "give_principal_token",
    "holds_principal_token",
    "preview_key",
    "preview_token",
    "preview_token_refusal",
    "principal_token",
    "principal_token_refusal",
    "principal_uid_of",
    "renew_principal_token",
    "use_preview_asker",
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


def holds_principal_token(deployment_uid: str) -> bool:
    """Whether an agent here was made for a deployment: its principal's token held, expired or not."""
    return deployment_uid in _HELD


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


def principal_uid_of(deployment_uid: str) -> str:
    """The uid of the principal a deployment's agent acts as, or ``""`` when it holds none."""
    return str((_HELD.get(deployment_uid) or {}).get("principal_uid") or "")


def principal_token(deployment_uid: str) -> Optional[str]:
    """The principal's token for a deployment, or ``None`` when it has none it may use."""
    if principal_token_refusal(deployment_uid):
        return None
    return str(_HELD[deployment_uid]["token"])


async def _ask_ai_agents(deployment_uid: str, bearer: str) -> dict[str, Any]:
    import httpx
    from datalayer_core.utils.urls import DatalayerURLs

    from agent_runtimes.loop.apps.opening import page_origin_headers

    url = getattr(DatalayerURLs.from_environment(), "ai_agents_url", "") or ""
    if not url:
        raise PrincipalTokenMissing(
            f"The principal of deployment {deployment_uid} cannot be asked for: no ai-agents is configured."
        )
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                f"{url.rstrip('/')}/api/ai-agents/v1/apps/deployments/{deployment_uid}/principal-token",
                # An embed's page, which ai-agents checks against the
                # sites its owner allows it on (LOOP D-12).
                headers={"Authorization": f"Bearer {bearer}", **page_origin_headers()},
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


async def _ensure_held(
    key: str,
    bearer: Optional[str],
    ask: Callable[[str], Awaitable[dict[str, Any]]],
    refusal: Callable[[], Optional[str]],
    what: str,
) -> dict[str, Any]:
    """A token held under ``key``, asked for with ``bearer`` when none is held
    or it runs out: what a deployment's principal and a Preview share.

    Returns what ai-agents answered when it was asked now, else ``{}``.
    """
    held = _HELD.get(key)
    fresh = (
        held is not None and held["expires_at"] - time.time() > REFRESH_MARGIN_SECONDS
    )
    if fresh:
        return {}
    if bearer:
        try:
            answer = await ask(bearer)
        except PrincipalTokenMissing:
            if not refusal():
                # Still good for a few minutes: the next request asks again.
                return {}
            raise
        token = str(answer.get("access_token") or "")
        if not token:
            raise PrincipalTokenMissing(f"ai-agents answered {what} no token.")
        give_principal_token(
            key,
            token,
            expires_in=int(answer.get("expires_in") or 0),
            principal_uid=str(answer.get("principal_uid") or ""),
        )
        return answer
    said = refusal()
    if said:
        raise PrincipalTokenMissing(said)
    return {}


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
    answer = await _ensure_held(
        deployment_uid,
        bearer,
        lambda asking: _asker["ask"](deployment_uid, asking),
        lambda: principal_token_refusal(deployment_uid),
        f"deployment {deployment_uid}",
    )
    if answer:
        logger.info(
            "Deployment %s acts as its principal %s.",
            deployment_uid,
            answer.get("principal_uid") or "?",
        )
    return str(_HELD[deployment_uid]["token"])


async def renew_principal_token(deployment_uid: str, bearer: str) -> float:
    """
    Ask for a deployment's principal's token now, whatever is held: what keeps
    a deployment kept always on acting (STUDIO A-08).

    A kept deployment is asked mostly by callers whose token is no reason to
    ask for its principal's — a visitor's over A2A, a key granted to its
    route — so the token its agent was made with runs out an hour later and
    nothing asks again. ai-agents, which keeps it on, renews it before then
    with a key of its owner IAM mints for the runtime.

    Parameters
    ----------
    deployment_uid : str
        The deployment an agent on this runtime serves.
    bearer : str
        The token to ask ai-agents with: its owner's key for the kept runtime.

    Returns
    -------
    float
        When the new token runs out (epoch seconds).

    Raises
    ------
    PrincipalTokenMissing
        When no agent here serves that deployment, or ai-agents gave no token:
        what is held is left as it is.
    """
    if not holds_principal_token(deployment_uid):
        raise PrincipalTokenMissing(
            f"No agent on this runtime serves deployment {deployment_uid}: its principal is not asked for here."
        )
    answer = await _asker["ask"](deployment_uid, bearer)
    token = str(answer.get("access_token") or "")
    if not token:
        raise PrincipalTokenMissing(
            f"ai-agents answered deployment {deployment_uid} no token."
        )
    give_principal_token(
        deployment_uid,
        token,
        expires_in=int(answer.get("expires_in") or 0),
        principal_uid=str(answer.get("principal_uid") or ""),
    )
    logger.info(
        "Deployment %s's principal token renewed by its keeper.", deployment_uid
    )
    return float(_HELD[deployment_uid]["expires_at"])


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


async def gateway_toolsets_of_the_run(
    agent_id: Optional[str], toolsets: list[Any], bearer: Optional[str]
) -> list[Any]:
    """
    An application's run reaches the Datalayer MCP gateway as the application, never with the runtime's key.

    A deployment's run with its principal's token (LOOP I-03) — its servers in
    each user's name with the token of the person talking to it (I-04) — and
    a Preview's with the token its run carries, the person's narrowed to the
    Spaces its application is granted (R-25): the gateway holds each to those
    Spaces. Any other agent's toolsets are left as they are.

    Parameters
    ----------
    agent_id : str | None
        The agent running.
    toolsets : list[Any]
        Its toolsets, as the process holds them.
    bearer : str | None
        The token the run's request carries.

    Returns
    -------
    list[Any]
        The toolsets, the gateway's reached with the application's token.
    """
    from agent_runtimes.mcp.datalayer_gateway import toolsets_for_the_run
    from agent_runtimes.models.models import app_instance_of

    instance = app_instance_of(agent_id)
    if not instance or not str(instance.get("app_uid") or "").strip():
        return toolsets
    deployment = deployment_of(instance)
    if not deployment:
        # A Preview: its session's run carries the person's token narrowed to
        # the granted Spaces (`sessions.LiveSession.run_token`); without one,
        # the gateway is reached with none and refuses.
        return toolsets_for_the_run(toolsets, bearer or "")
    from agent_runtimes.loop.apps.acting import acting_token, servers_in_users_name

    in_users_name = servers_in_users_name(agent_id)
    return toolsets_for_the_run(
        toolsets,
        principal_token(deployment) or "",
        in_users_name=in_users_name,
        users_token=(await acting_token(deployment, bearer) if in_users_name else ""),
    )


# --- a Preview, held to its application's Space grants (LOOP R-25) ----------


def preview_key(app_uid: str, person_uid: str, permissions: Mapping[str, Any]) -> str:
    """Where a Preview's token is held: by application, the person trying it,
    and the Spaces its Appspec grants now — a list changed is a token asked
    again, never one narrowed to the list before.
    """
    spaces = sorted(
        (str(grant.get("space") or ""), str(grant.get("access") or "read"))
        for grant in permissions.get("spaces") or []
    )
    digest = hashlib.sha256(json.dumps(spaces).encode("utf-8")).hexdigest()[:16]
    return f"preview:{app_uid}:{person_uid}:{digest}"


def preview_token_refusal(
    app_uid: str, person_uid: str, permissions: Mapping[str, Any]
) -> Optional[str]:
    """Why a Preview of an application cannot reach anything now, or ``None`` when it can."""
    held = _HELD.get(preview_key(app_uid, person_uid, permissions))
    if not held:
        return (
            f"The Preview of {app_uid} holds no token narrowed to the Spaces its "
            "application is granted: it reaches nothing."
        )
    if held["expires_at"] <= time.time():
        return (
            f"The token of the Preview of {app_uid} expired: it reaches nothing more. "
            "Send a message again."
        )
    return None


def preview_token(
    app_uid: str, person_uid: str, permissions: Mapping[str, Any]
) -> Optional[str]:
    """A Preview's token, or ``None`` when it has none it may use."""
    if preview_token_refusal(app_uid, person_uid, permissions):
        return None
    return str(_HELD[preview_key(app_uid, person_uid, permissions)]["token"])


async def _ask_ai_agents_for_a_preview(
    app_uid: str, permissions: Mapping[str, Any], bearer: str
) -> dict[str, Any]:
    import httpx
    from datalayer_core.utils.urls import DatalayerURLs

    url = getattr(DatalayerURLs.from_environment(), "ai_agents_url", "") or ""
    if not url:
        raise PrincipalTokenMissing(
            f"The Preview of {app_uid} cannot be held to its grants: no ai-agents is configured."
        )
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                f"{url.rstrip('/')}/api/ai-agents/v1/apps/{app_uid}/preview-token",
                json={"permissions": dict(permissions)},
                headers={"Authorization": f"Bearer {bearer}"},
            )
    except httpx.HTTPError as error:
        raise PrincipalTokenMissing(
            f"ai-agents could not be asked for the Preview of {app_uid}: {error}."
        ) from error
    if response.status_code >= 300:
        detail = ""
        try:
            detail = str((response.json() or {}).get("detail") or "")
        except ValueError:
            detail = response.text[:200]
        raise PrincipalTokenMissing(
            f"ai-agents gave the Preview of {app_uid} no token "
            f"({response.status_code}){': ' + detail if detail else ''}."
        )
    return dict(response.json() or {})


#: Who answers a Preview's token; replaced by a test.
_preview_asker: dict[
    str, Callable[[str, Mapping[str, Any], str], Awaitable[dict[str, Any]]]
] = {"ask": _ask_ai_agents_for_a_preview}


def use_preview_asker(
    asker: Optional[Callable[[str, Mapping[str, Any], str], Awaitable[dict[str, Any]]]],
) -> None:
    """Who answers a Preview's token: ai-agents, or a test; ``None`` for ai-agents."""
    _preview_asker["ask"] = asker or _ask_ai_agents_for_a_preview


async def ensure_preview_token(
    app_uid: str,
    person_uid: str,
    permissions: Mapping[str, Any],
    bearer: Optional[str],
) -> str:
    """
    The token a Preview runs with, asked for when none is held or it runs out (LOOP R-25).

    The person's own, narrowed by ai-agents and IAM to the Spaces the Appspec
    the Preview runs grants (``permissions.spaces``) — none when it grants
    none — asked for with the person's token, as a deployment's principal's
    is with its opener's, and kept in memory.

    Parameters
    ----------
    app_uid : str
        The application tried, as Datalayer knows it.
    person_uid : str
        Who is trying it.
    permissions : Mapping[str, Any]
        The ``permissions`` of the Appspec the Preview runs.
    bearer : str | None
        The person's token, from the request.

    Returns
    -------
    str
        The token.

    Raises
    ------
    PrincipalTokenMissing
        When none is held and none could be had: the Preview runs nothing.
    """
    if not app_uid:
        raise PrincipalTokenMissing(
            "A Preview reaches the Spaces its application is granted on Datalayer, "
            "and this one is not there: save it first."
        )
    key = preview_key(app_uid, person_uid, permissions)
    answer = await _ensure_held(
        key,
        bearer,
        lambda asking: _preview_asker["ask"](app_uid, permissions, asking),
        lambda: preview_token_refusal(app_uid, person_uid, permissions),
        f"the Preview of {app_uid}",
    )
    if answer:
        logger.info(
            "The Preview of %s for %s reaches %d Space(s).",
            app_uid,
            person_uid,
            len(answer.get("spaces") or []),
        )
    return str(_HELD[key]["token"])
