# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
ACP sessions that outlive the runtime (ORCHESTRATOR.md, O1-11).

A session is a record of the runtime's protocol state store, and so is each
turn of its conversation, so ``session/load`` on a restarted runtime finds the
session a client names and replays its conversation — what the ACP schema
asks of an agent that declares ``loadSession``. What cannot be kept, the open
connection, a running prompt and the transport of a connection, is made
again for the connection that loads it.
"""

from __future__ import annotations

import time
from typing import Any

from ..adapters.base import AgentContext
from ..transports.acp import ACPSession
from .store import ProtocolStateStore, protocol_state_store

#: The kinds of record kept here.
SESSION = "acp.session"
TURN = "acp.turn"


def _target(store: ProtocolStateStore | None) -> ProtocolStateStore:
    return store if store is not None else protocol_state_store()


def session_record(session: ACPSession) -> dict[str, Any]:
    """
    Return a session as it is kept.

    Parameters
    ----------
    session : ACPSession
        The session.

    Returns
    -------
    dict[str, Any]
        What of it survives a restart.
    """
    return {
        "id": session.id,
        "createdAt": session.created_at,
        "cwd": session.cwd,
        "mcpServers": list(session.mcp_servers),
        "currentMode": session.current_mode,
        "agentId": session.agent_id,
        "status": session.status,
        "metadata": dict(session.metadata),
        "userId": session.context.user_id if session.context is not None else None,
    }


def session_of(record: dict[str, Any]) -> ACPSession:
    """
    Return the session a kept record describes.

    Parameters
    ----------
    record : dict[str, Any]
        The record.

    Returns
    -------
    ACPSession
        The session, with a context made again for it.
    """
    return ACPSession(
        id=record["id"],
        created_at=float(record.get("createdAt") or time.time()),
        cwd=record.get("cwd") or ".",
        context=AgentContext(
            session_id=record["id"], user_id=record.get("userId") or "default"
        ),
        mcp_servers=list(record.get("mcpServers") or []),
        current_mode=record.get("currentMode"),
        agent_id=record.get("agentId") or "unknown",
        status=record.get("status") or "active",
        metadata=dict(record.get("metadata") or {}),
    )


async def save_session(
    session: ACPSession, store: ProtocolStateStore | None = None
) -> None:
    """Keep a session, replacing what was kept of it."""
    await _target(store).put(SESSION, session.id, session_record(session))


async def load_session(
    session_id: str, store: ProtocolStateStore | None = None
) -> ACPSession | None:
    """Return the session kept under an id, or ``None``."""
    record = await _target(store).get(SESSION, session_id)
    return None if record is None else session_of(record)


async def list_sessions(store: ProtocolStateStore | None = None) -> list[ACPSession]:
    """Return every kept session, the least recently changed first."""
    return [session_of(record) for record in await _target(store).list(SESSION)]


async def set_session_status(
    session_id: str, status: str, store: ProtocolStateStore | None = None
) -> ACPSession | None:
    """Record a session's status; ``None`` when there is no such session."""
    session = await load_session(session_id, store)
    if session is None:
        return None
    session.status = status
    await save_session(session, store)
    return session


async def close_session(
    session_id: str, store: ProtocolStateStore | None = None
) -> bool:
    """Forget a session and its conversation; ``False`` when there was none."""
    target = _target(store)
    if await target.get(SESSION, session_id) is None:
        return False
    for turn in await target.list(TURN, prefix=f"{session_id}/"):
        await target.delete(TURN, _turn_key(session_id, int(turn["sequence"])))
    await target.delete(SESSION, session_id)
    return True


def _turn_key(session_id: str, sequence: int) -> str:
    return f"{session_id}/{sequence:08d}"


async def append_turn(
    session_id: str, role: str, text: str, store: ProtocolStateStore | None = None
) -> None:
    """
    Keep one turn of a session's conversation.

    Parameters
    ----------
    session_id : str
        The session.
    role : str
        ``user`` or ``agent``.
    text : str
        What was said.
    store : ProtocolStateStore | None
        The store; this process's when omitted.
    """
    target = _target(store)
    sequence = len(await target.list(TURN, prefix=f"{session_id}/")) + 1
    await target.put(
        TURN,
        _turn_key(session_id, sequence),
        {"sequence": sequence, "role": role, "text": text, "at": time.time()},
    )


async def turns(
    session_id: str, store: ProtocolStateStore | None = None
) -> list[dict[str, Any]]:
    """Return a session's conversation, in the order it was had."""
    kept = await _target(store).list(TURN, prefix=f"{session_id}/")
    return sorted(kept, key=lambda turn: int(turn["sequence"]))
