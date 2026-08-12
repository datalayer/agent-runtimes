# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Provision the shared RTC collaboration room for an Agent Node.

Option B architecture: once the node has registered and the user has signed
in, the node creates a single spacer *notebook* document. Its uid becomes the
collaboration room id shared by the node-local UI and the SaaS gallery view,
so the ephemeral notebook state transits over RTC (pycrdt) instead of the
tunnel. The uid is persisted in the node configuration and mirrored to the
central runtimes service via the heartbeat so the SaaS UI can discover it.
"""

from __future__ import annotations

import logging
import os

import httpx

from ..routes.agent_node import (
    get_agent_node_configuration,
    get_runtime_credentials,
    set_collaboration_document_uid,
    set_collaboration_notebook_uid,
)

logger = logging.getLogger(__name__)

_SPACER_API_PREFIX = "/api/spacer/v1"
_LIBRARY_SPACE_HANDLE = "library"


def _spacer_base_url() -> str:
    """Resolve the spacer base URL from env, falling back to the Datalayer URL."""
    for name in ("DATALAYER_SPACER_URL",):
        value = (os.environ.get(name) or "").strip().rstrip("/")
        if value:
            return value
    # Last resort: the UI-supplied runtimes URL shares the same ingress host.
    return (get_runtime_credentials().get("runtimes_url") or "").strip().rstrip("/")


def _auth_token() -> str:
    """Resolve the auth token (env first, then UI-supplied credentials)."""
    env_token = (os.environ.get("DATALAYER_API_KEY") or "").strip()
    if env_token:
        return env_token
    return (get_runtime_credentials().get("token") or "").strip()


async def _resolve_library_space_uid(
    client: httpx.AsyncClient,
) -> str | None:
    """Return the user's private library space uid via the spacer API."""
    response = await client.get(f"{_SPACER_API_PREFIX}/spaces/users/me")
    response.raise_for_status()
    body = response.json()
    spaces = body.get("spaces") if isinstance(body, dict) else None
    if not isinstance(spaces, list) or not spaces:
        return None
    # Prefer the seeded "library" space; otherwise fall back to the first space.
    for space in spaces:
        if not isinstance(space, dict):
            continue
        handle = str(space.get("handle_s") or space.get("handle") or "").strip()
        if handle == _LIBRARY_SPACE_HANDLE:
            uid = str(space.get("uid") or "").strip()
            if uid:
                return uid
    for space in spaces:
        if isinstance(space, dict):
            uid = str(space.get("uid") or "").strip()
            if uid:
                return uid
    return None


async def _create_notebook(
    client: httpx.AsyncClient,
    space_uid: str,
    name: str,
) -> str | None:
    """Create a spacer notebook in the given space and return its uid."""
    response = await client.post(
        f"{_SPACER_API_PREFIX}/notebooks",
        data={
            "name": name,
            "description": "Agent Node collaborative notebook.",
            "spaceId": space_uid,
            "notebookType": "notebook",
        },
    )
    response.raise_for_status()
    body = response.json()
    notebook = body.get("notebook") if isinstance(body, dict) else None
    if isinstance(notebook, dict):
        uid = str(notebook.get("uid") or "").strip()
        return uid or None
    return None


async def _create_lexical(
    client: httpx.AsyncClient,
    space_uid: str,
    name: str,
) -> str | None:
    """Create a spacer lexical document in the given space and return its uid."""
    response = await client.post(
        f"{_SPACER_API_PREFIX}/lexicals",
        data={
            "name": name,
            "description": "Agent Node collaborative document.",
            "spaceId": space_uid,
            "documentType": "lexical",
        },
    )
    response.raise_for_status()
    body = response.json()
    document = body.get("document") if isinstance(body, dict) else None
    if isinstance(document, dict):
        uid = str(document.get("uid") or "").strip()
        return uid or None
    return None


async def ensure_collaboration_room(node_id: str | None = None) -> str | None:
    """Ensure this node has its spacer collaboration rooms, provisioning if needed.

    Provisions two shared rooms in the user's library space: a *notebook* room
    (for the ephemeral notebook, pycrdt) and a *lexical* room (for the ephemeral
    document, Loro). Returns the collaboration notebook uid, or ``None`` when it
    could not be provisioned (missing credentials/spacer URL, or a spacer error).

    Idempotent: each room is only created when its uid is absent, so once both
    are persisted repeated sync ticks make no network call. A partially
    provisioned node (only one uid present) provisions just the missing room.
    """
    config = get_agent_node_configuration()
    notebook_uid = config.collaboration_notebook_uid
    document_uid = config.collaboration_document_uid
    if notebook_uid and document_uid:
        return notebook_uid

    base_url = _spacer_base_url()
    token = _auth_token()
    if not base_url or not token:
        logger.debug(
            "Skipping collaboration room provisioning "
            "(spacer_url=%s, has_token=%s)",
            bool(base_url),
            bool(token),
        )
        return notebook_uid

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    }
    name = f"Agent Node {node_id}" if node_id else "Agent Node"
    try:
        async with httpx.AsyncClient(
            base_url=base_url,
            headers=headers,
            timeout=httpx.Timeout(20.0),
        ) as client:
            space_uid = await _resolve_library_space_uid(client)
            if not space_uid:
                logger.warning(
                    "Could not resolve a library space for collaboration rooms"
                )
                return notebook_uid
            if not notebook_uid:
                notebook_uid = await _create_notebook(client, space_uid, name)
                if notebook_uid:
                    set_collaboration_notebook_uid(notebook_uid)
                    logger.info(
                        "Provisioned collaboration notebook room %s", notebook_uid
                    )
                else:
                    logger.warning(
                        "Spacer did not return a notebook uid for collaboration room"
                    )
            if not document_uid:
                document_uid = await _create_lexical(client, space_uid, name)
                if document_uid:
                    set_collaboration_document_uid(document_uid)
                    logger.info(
                        "Provisioned collaboration document room %s", document_uid
                    )
                else:
                    logger.warning(
                        "Spacer did not return a lexical uid for collaboration room"
                    )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to provision collaboration room: %s", exc)
        return notebook_uid

    return notebook_uid
