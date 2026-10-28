# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A local session's folder on its list row (DESKTOP DK-26, META_HARNESS MH-02).

A harness session runs in a folder: ``acp_agent.py``'s ``_keep_session``
keeps ``workspace`` in the harness's row of the protocol state store, one
row per (session, agent) under ``<agentspec>:<uid>`` (MH-04).
``GET /sessions/{uid}`` answers that row as ``harness_session`` for a session
the runtime's agent holds; the list's rows did not say it, so a desktop
could not say *on this machine · <folder>* nor resume a paused session on
the right folder's runtime without a file of its own. Here each row of
``GET /sessions`` whose session names a harness gets ``workspace`` from its
harness row; a model agent's row gets nothing.
"""

from __future__ import annotations

from typing import Any, Dict, List

#: The kind under which a harness keeps its row (``acp_agent.HARNESS_SESSION_KIND``).
HARNESS_SESSION_KIND = "harness_session"


async def workspace_of(uid: str, agent: str) -> str:
    """The folder a harness session runs in, from its harness row; empty when the row names none."""
    from agent_runtimes.protocol_state.store import protocol_state_store

    row = await protocol_state_store().get(HARNESS_SESSION_KIND, f"{agent}:{uid}")
    return str(row.get("workspace") or "") if row else ""


async def with_workspaces(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """The rows with ``workspace`` on each harness session's, read from its harness row.

    A row without a ``harness`` (a model agent's) is left as it is; a harness
    session whose row names no folder says ``""``.
    """
    listed: List[Dict[str, Any]] = []
    for row in rows:
        if row.get("harness") and row.get("uid") and row.get("agent"):
            listed.append(
                {
                    **row,
                    "workspace": await workspace_of(str(row["uid"]), str(row["agent"])),
                }
            )
        else:
            listed.append(row)
    return listed
