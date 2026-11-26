# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Publish one of the runtime owner's artifacts in the public Library.

Skill scripts call this route over the pod loopback. The owner's credential
stays in agent-runtimes and is forwarded only to the configured Library
service; the sandbox receives neither it nor a service URL.
"""

from __future__ import annotations

import os
from typing import Any, Optional
from urllib.parse import quote

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from agent_runtimes.apps.callers import refuse_unless_a_skill
from agent_runtimes.routes.spaces import owner_token

router = APIRouter(prefix="/library", tags=["library"])

ARTIFACT_TYPES = frozenset(
    {
        "notebook",
        "document",
        "deck",
        "spreadsheet",
        "cell",
        "lesson",
        "exercise",
        "assignment",
        "course",
        "evalset",
        "dataset",
        "agent",
        "dataserver",
        "environment",
        "report",
        "investigation",
        "evaluator",
        "app",
    }
)

PUBLIC_SEGMENTS = {"evalset": "evals"}


class PublishItem(BaseModel):
    """The explicit publication decision and the Library metadata."""

    item_type: str = Field(min_length=1)
    confirm: bool = False
    tags: Optional[list[str]] = None
    description: Optional[str] = None
    video: bool = False


def library_url() -> str:
    """The configured Library service root."""
    value = (os.environ.get("DATALAYER_LIBRARY_URL") or "").strip().rstrip("/")
    if not value:
        raise HTTPException(503, "This runtime does not know where the Library is.")
    return value


async def _publish(url: str, token: str, payload: dict[str, Any]) -> httpx.Response:
    async with httpx.AsyncClient(timeout=30.0) as client:
        return await client.patch(
            url,
            headers={"Authorization": f"Bearer {token}"},
            json=payload,
        )


@router.post("/items/{item_uid}/publish")
async def publish_item(
    item_uid: str, body: PublishItem, request: Request
) -> dict[str, Any]:
    """Publish an owned artifact, after an explicit confirmation."""
    # A skill's script on the pod's loopback, never a browser's page there
    # (`callers.refuse_unless_a_skill`).
    refuse_unless_a_skill(
        request, "Only a skill in this runtime's pod may publish its owner's work."
    )
    # Where a publication may be made is one predicate, read by the gate and
    # by the skill's readiness too: enforced here as well, since the pod's
    # loopback is answered whole on a runtime that holds no pod secret.
    from agent_runtimes.routes.owner import publication_place_refusal

    not_here = publication_place_refusal()
    if not_here:
        raise HTTPException(403, not_here)
    if not body.confirm:
        raise HTTPException(
            409,
            "Publishing makes the item visible to everyone. Ask the person and pass confirm=true only after they approve.",
        )
    item_type = body.item_type.strip().lower()
    if item_type not in ARTIFACT_TYPES:
        raise HTTPException(
            422,
            f"{body.item_type!r} is not a Library item type. Choose one of: {', '.join(sorted(ARTIFACT_TYPES))}.",
        )
    token = owner_token()
    if not token:
        raise HTTPException(
            409, "This runtime holds no identity of its owner to publish with."
        )
    # One path segment of a known shape: `..` or an escaped dot would turn the
    # call, made with the owner's token, to another resource of the Library.
    from agent_runtimes.routes.owner import path_id

    uid = item_uid.strip()
    if not uid:
        raise HTTPException(422, "The item uid is empty.")
    path_id(uid, "an item uid")
    payload: dict[str, Any] = {"is_public": True, "video": body.video}
    if body.tags is not None:
        payload["tags"] = body.tags
    if body.description is not None:
        payload["description"] = body.description
    url = f"{library_url()}/api/library/v1/items/{quote(uid, safe='')}/public"
    try:
        answer = await _publish(url, token, payload)
    except (httpx.HTTPError, OSError) as error:
        raise HTTPException(
            502, f"The Library could not be reached: {type(error).__name__}."
        ) from error
    if answer.status_code >= 400:
        try:
            detail = answer.json().get("detail") or answer.json().get("message")
            if isinstance(detail, dict):
                detail = detail.get("message") or str(detail)
        except ValueError:
            detail = answer.text.strip()
        raise HTTPException(
            answer.status_code, detail or "The Library refused the publication."
        )
    segment = PUBLIC_SEGMENTS.get(item_type, f"{item_type}s")
    ui = (
        os.environ.get("DATALAYER_UI_URL") or os.environ.get("DATALAYER_RUN_URL") or ""
    ).rstrip("/")
    path = f"/public/{segment}/{quote(uid, safe='')}"
    return {
        "published": True,
        "item_uid": uid,
        "item_type": item_type,
        "public_url": f"{ui}{path}" if ui else path,
    }
