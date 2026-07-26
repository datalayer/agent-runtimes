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
    set_collaboration_notebook_uid,
)

logger = logging.getLogger(__name__)

_SPACER_API_PREFIX = "/api/spacer/v1"
_LIBRARY_SPACE_HANDLE = "library"


def _spacer_base_url() -> str:
    """Resolve the spacer base URL from env, falling back to the Datalayer URL."""
    for name in ("DATALAYER_SPACER_URL", "DATALAYER_URL"):
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


async def ensure_collaboration_room(node_id: str | None = None) -> str | None:
    """Ensure this node has a spacer notebook room, provisioning it if needed.

    Returns the collaboration notebook uid, or ``None`` when it could not be
    provisioned (missing credentials/spacer URL, or a spacer error). Idempotent:
    a uid already present in the configuration is returned without any network
    call so repeated sync ticks are cheap.
    """
    existing = get_agent_node_configuration().collaboration_notebook_uid
    if existing:
        return existing

    base_url = _spacer_base_url()
    token = _auth_token()
    if not base_url or not token:
        logger.debug(
            "Skipping collaboration room provisioning "
            "(spacer_url=%s, has_token=%s)",
            bool(base_url),
            bool(token),
        )
        return None

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    }
    name = f"Agent Node {node_id}" if node_id else "Agent Node Notebook"
    try:
        async with httpx.AsyncClient(
            base_url=base_url,
            headers=headers,
            timeout=httpx.Timeout(20.0),
        ) as client:
            space_uid = await _resolve_library_space_uid(client)
            if not space_uid:
                logger.warning(
                    "Could not resolve a library space for collaboration room"
                )
                return None
            notebook_uid = await _create_notebook(client, space_uid, name)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to provision collaboration room: %s", exc)
        return None

    if not notebook_uid:
        logger.warning("Spacer did not return a notebook uid for collaboration room")
        return None

    set_collaboration_notebook_uid(notebook_uid)
    logger.info("Provisioned collaboration notebook room %s", notebook_uid)
    return notebook_uid
