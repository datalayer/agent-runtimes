# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The harness catalogue over HTTP (VSCODE VS-03, META_HARNESS MH-F02).

``GET /api/v1/harnesses`` answers what ``loop harnesses`` prints: each
harness the ``harness`` contribution point accepts — the catalogue's and a
third party's, an organization's own left out as the command leaves them
out — with its terms, its register entry (the adapter pinned, the
credential it takes, the binaries it needs), its capabilities table and its
ACP launch. ``GET /api/v1/harnesses/{id}`` answers one; a harness of the
register's listed tier, or none at all, is refused in a sentence (404).
An editor reads it before it starts a coding agent on a local runtime,
instead of parsing the command's table.
"""

from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/harnesses", tags=["harnesses"])


def _described(contribution: Any) -> Dict[str, Any]:
    """One harness as the route says it: the spec whole, and who contributed it."""
    spec = contribution.value.spec
    described = spec.model_dump(mode="json")
    described["contributed_by"] = str(contribution.plugin or "")
    return described


def served_harnesses() -> List[Dict[str, Any]]:
    """The harnesses served to everybody, in the point's order (what ``loop harnesses`` prints)."""
    from agent_runtimes.plugins.host import accepted, session_platform
    from agent_runtimes.plugins.points import HARNESSES

    listed = []
    for contribution in accepted(session_platform(), HARNESSES):
        value = contribution.value
        if value.spec.acp is None or value.organization:
            continue
        listed.append(_described(contribution))
    return listed


@router.get("")
async def list_harnesses() -> Dict[str, Any]:
    """The harness catalogue: id, name, terms, register entry, capabilities, ACP launch."""
    return {"harnesses": served_harnesses()}


@router.get("/{harness_id}")
async def get_harness(harness_id: str) -> Dict[str, Any]:
    """One harness of the catalogue; a listed one, or none, refused in a sentence."""
    for harness in served_harnesses():
        if harness["id"] == harness_id:
            return harness
    from agentspecs.harnesses import listed_refusal

    detail = listed_refusal(harness_id) or (
        f"There is no harness named {harness_id!r} on this runtime: "
        "GET /api/v1/harnesses lists them."
    )
    raise HTTPException(status_code=404, detail=detail)
