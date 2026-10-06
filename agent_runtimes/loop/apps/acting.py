# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A deployment's connections in the name of who uses it (plans/LOOP.md, I-04).

An application's connection may act in the name of each person who uses it
(`as: user`) rather than its owner's. Its principal's token never reaches such
a connection to the Datalayer MCP gateway: the gateway refuses it, saying so.
What reaches it is a token of **the person** naming the application, which IAM
mints from what that person let the application do in their name — given at
its address, listed and ended in their settings.

How it gets here: on each request of a deployment's agent, with the token of
the person talking to it, the runtime asks IAM for what they let this
deployment do (`GET /oauth/task-grants/acting`) and, when one stands, a token
from it (`POST /oauth/task-grants/acting/{uid}/token`), kept in memory by
person and deployment until less than :data:`REFRESH_MARGIN_SECONDS` are left.
The gateway's servers in the person's name are reached with it, the others
with the principal's. When the person has not let it act in their name, those
servers are reached with no token of theirs: the gateway refuses, in its
sentence, and the agent says so.
"""

from __future__ import annotations

import hashlib
import logging
import time
from typing import Any, Awaitable, Callable, Iterable, Optional

logger = logging.getLogger(__name__)

__all__ = [
    "REFRESH_MARGIN_SECONDS",
    "acting_token",
    "forget_acting",
    "remember_servers_in_users_name",
    "servers_in_users_name",
    "use_iam",
]

#: Asked again when less than this is left.
REFRESH_MARGIN_SECONDS = 120

#: agent id -> the gateway's servers its application reaches in each user's name.
_IN_USERS_NAME: dict[str, frozenset[str]] = {}

#: (person's token digest, deployment) -> {"token", "expires_at"}. Process memory only.
_HELD: dict[tuple[str, str], dict[str, Any]] = {}


def _id_of(ref: str) -> str:
    base, _, version = str(ref).rpartition(":")
    return base if base and "." in version else str(ref)


def remember_servers_in_users_name(
    agent_id: str, connections: Iterable[Any] | None
) -> None:
    """Keep which of an agent's connections reach the gateway in each user's name; none forgets."""
    from agent_runtimes.mcp.datalayer_gateway import gateway_query

    servers = frozenset(
        _id_of(connection.server)
        for connection in connections or ()
        if getattr(connection, "acts_as", "owner") == "user"
        and gateway_query(_id_of(connection.server)) is not None
    )
    if servers:
        _IN_USERS_NAME[agent_id] = servers
    else:
        _IN_USERS_NAME.pop(agent_id, None)


def servers_in_users_name(agent_id: str | None) -> frozenset[str]:
    """The gateway's servers an agent's application reaches in each user's name."""
    return _IN_USERS_NAME.get(agent_id or "", frozenset())


def forget_acting() -> None:
    """Forget every token held: a test, or a runtime told to."""
    _HELD.clear()


async def _ask_iam(deployment_uid: str, bearer: str) -> Optional[dict[str, Any]]:
    """The person's token for this deployment from IAM, or ``None`` when they have not let it act in their name."""
    import httpx
    from datalayer_core.utils.urls import DatalayerURLs

    url = str(getattr(DatalayerURLs.from_environment(), "iam_url", "") or "").rstrip(
        "/"
    )
    if not url:
        logger.warning(
            "No IAM is configured: deployment %s acts in nobody's name.", deployment_uid
        )
        return None
    acting = f"{url}/api/iam/v1/oauth/task-grants/acting"
    headers = {"Authorization": f"Bearer {bearer}"}
    async with httpx.AsyncClient(timeout=20.0) as client:
        listed = await client.get(acting, headers=headers)
        if listed.status_code >= 300:
            logger.info(
                "IAM did not list what this person lets applications do (%s).",
                listed.status_code,
            )
            return None
        standing = [
            item
            for item in (listed.json() or {}).get("acting") or []
            if item.get("deployment_uid") == deployment_uid
            and item.get("state") == "standing"
        ]
        if not standing:
            return None
        minted = await client.post(
            f"{acting}/{standing[0]['uid']}/token", headers=headers
        )
        if minted.status_code >= 300:
            logger.info(
                "IAM minted no token in this person's name (%s).", minted.status_code
            )
            return None
        return dict(minted.json() or {})


#: Who is asked; replaced by a test.
_iam: dict[str, Callable[[str, str], Awaitable[Optional[dict[str, Any]]]]] = {
    "ask": _ask_iam
}


def use_iam(
    asker: Optional[Callable[[str, str], Awaitable[Optional[dict[str, Any]]]]],
) -> None:
    """Who answers the person's token: IAM, or a test; ``None`` for IAM."""
    _iam["ask"] = asker or _ask_iam


async def acting_token(deployment_uid: str, bearer: Optional[str]) -> str:
    """
    The token of the person talking to a deployment, naming its application, or ``""``.

    Parameters
    ----------
    deployment_uid : str
        The deployment the agent serves.
    bearer : str | None
        The person's own token, as their request carries it.

    Returns
    -------
    str
        ``""`` when nobody signed in is talking to it, or they have not let it
        act in their name, or IAM could not be asked: the gateway then refuses
        the servers in their name, in its sentence.
    """
    if not deployment_uid or not bearer:
        return ""
    key = (hashlib.sha256(bearer.encode()).hexdigest(), deployment_uid)
    held = _HELD.get(key)
    if held is not None and held["expires_at"] - time.time() > REFRESH_MARGIN_SECONDS:
        return str(held["token"])
    try:
        answer = await _iam["ask"](deployment_uid, bearer)
    except Exception as error:  # noqa: BLE001 - said, and nothing is reached in their name
        logger.warning(
            "IAM could not be asked for a token in this person's name: %s", error
        )
        answer = None
    token = str((answer or {}).get("access_token") or "")
    if not token:
        _HELD.pop(key, None)
        return ""
    _HELD[key] = {
        "token": token,
        "expires_at": time.time() + int((answer or {}).get("expires_in") or 0),
    }
    return token
