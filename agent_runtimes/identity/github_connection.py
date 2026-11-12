# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The person's GitHub token on a Datalayer runtime, from the grant Datalayer IAM holds.

The person connects GitHub once (in Settings, or from the chat when a tool
first needs it); IAM keeps the grant and answers the access token per call
(``POST /api/iam/v1/oauth2/github-connection/token``), asked with the run's
platform token — the person talking to the runtime — and naming the
runtime's owner (``DATALAYER_USER_UID``, set when the runtime was assigned):
IAM hands a person's GitHub to a runtime of theirs only.

When the person has not connected GitHub (or revoked it at GitHub, or
connected it below what the tool needs), IAM says so (409, ``reason:
not_connected``), and the start link of GitHub's consent is asked of IAM
with the same token (``GET …/consent``): the URL shown to the person.
"""

from __future__ import annotations

import os
from typing import Any, Callable, Mapping, Optional, Sequence

import httpx

from agent_runtimes.plugins.points import IdentityRefused

#: The provider's name, as agentspecs and tools name it.
GITHUB_PROVIDER = "github"

#: IAM's GitHub connection, under its base URL.
CONNECTION_PATH = "/api/iam/v1/oauth2/github-connection"

#: What IAM says when the person has to connect (again).
NOT_CONNECTED = "not_connected"

#: How long IAM is waited for, in seconds.
TIMEOUT = 20.0


class NotConnected(IdentityRefused):
    """The person has not connected GitHub (or not as far as asked): IAM's sentence."""


def level_of(scopes: Sequence[str]) -> str:
    """The connection's level a tool's scopes need: ``private`` when they name ``repo``."""
    return "private" if "repo" in set(scopes) else "public"


def _iam_url() -> str:
    from datalayer_core.utils.urls import DatalayerURLs

    url = str(getattr(DatalayerURLs.from_environment(), "iam_url", "") or "").rstrip(
        "/"
    )
    if not url:
        raise IdentityRefused(
            "No IAM is configured here: GitHub is reached through it."
        )
    return url


def _detail(response: httpx.Response) -> tuple[str, str]:
    try:
        body = response.json() or {}
    except ValueError:
        body = {}
    if not isinstance(body, dict):
        body = {}
    return str(body.get("detail") or ""), str(body.get("reason") or "")


def _bearer(context: Mapping[str, Any]) -> str:
    bearer = str(context.get("bearer") or "").strip()
    if not bearer:
        raise IdentityRefused(
            "No token of the person: GitHub is reached for the person talking to this runtime, "
            "and nobody signed in is."
        )
    return bearer


def _owner() -> str:
    owner = os.environ.get("DATALAYER_USER_UID", "").strip()
    if not owner:
        raise IdentityRefused(
            "This runtime is assigned to nobody yet (no DATALAYER_USER_UID): a person's GitHub "
            "is handed to a runtime of theirs only."
        )
    return owner


async def ask_token(
    context: Mapping[str, Any],
    scopes: Sequence[str],
    *,
    client: Optional[Callable[[], httpx.AsyncClient]] = None,
) -> str:
    """Return the person's GitHub access token from IAM, or raise.

    Raises
    ------
    NotConnected
        The person has to connect GitHub (again, or further).
    IdentityRefused
        Anything else IAM refused, or no person, runtime owner or IAM.
    """
    bearer = _bearer(context)
    owner = _owner()
    make = client or (lambda: httpx.AsyncClient(timeout=TIMEOUT))
    try:
        async with make() as http:
            response = await http.post(
                f"{_iam_url()}{CONNECTION_PATH}/token",
                json={
                    "level": level_of(scopes),
                    "runtime_owner_uid": owner,
                    "runtime_uid": os.environ.get("DATALAYER_RUNTIME_ID", ""),
                },
                headers={"Authorization": f"Bearer {bearer}"},
            )
    except httpx.HTTPError as error:
        raise IdentityRefused(
            f"Datalayer IAM could not be asked for a GitHub token: {type(error).__name__}."
        ) from None
    if response.status_code == 200:
        token = str((response.json() or {}).get("access_token") or "")
        if not token:
            raise IdentityRefused("Datalayer IAM answered no GitHub access token.")
        from agent_runtimes.guardrails.credentials import hold

        # Withheld wherever it would be shown, should a tool ever echo it.
        hold(token)
        return token
    detail, reason = _detail(response)
    if reason == NOT_CONNECTED:
        raise NotConnected(detail or "GitHub is not connected.")
    raise IdentityRefused(
        detail or f"Datalayer IAM gave no GitHub access token ({response.status_code})."
    )


async def connect_url(
    context: Mapping[str, Any],
    scopes: Sequence[str],
    *,
    client: Optional[Callable[[], httpx.AsyncClient]] = None,
) -> str:
    """Return IAM's start link of GitHub's consent for the person, at the level the scopes need."""
    bearer = _bearer(context)
    make = client or (lambda: httpx.AsyncClient(timeout=TIMEOUT))
    try:
        async with make() as http:
            response = await http.get(
                f"{_iam_url()}{CONNECTION_PATH}/consent",
                params={"level": level_of(scopes)},
                headers={"Authorization": f"Bearer {bearer}"},
            )
    except httpx.HTTPError as error:
        raise IdentityRefused(
            f"Datalayer IAM could not be asked where to connect GitHub: {type(error).__name__}."
        ) from None
    url = ""
    if response.status_code == 200:
        url = str((response.json() or {}).get("authorization_url") or "")
    if not url:
        detail, _ = _detail(response)
        raise IdentityRefused(
            f"Datalayer IAM gave no address to connect GitHub ({response.status_code}): "
            f"{detail or response.text[:200]}"
        )
    return url


__all__ = [
    "CONNECTION_PATH",
    "GITHUB_PROVIDER",
    "NotConnected",
    "ask_token",
    "connect_url",
    "level_of",
]
