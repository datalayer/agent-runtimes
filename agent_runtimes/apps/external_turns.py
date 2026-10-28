# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Idempotent external turns.

A host delivers what its users say at least once: Slack retries an event it
thinks was not received, a worker that crashed takes its job again. The
session API takes each turn once. A turn that starts a session (`POST
/sessions`) or sends a message (`POST /sessions/{uid}/messages`) may name
the host's own id for it — ``external_event_id``, such as a Slack event id —
and an ``Idempotency-Key`` header; the key, or else the external event id,
names the turn **for its caller**:

- the first time, the turn runs, and its stream says which turn it is — a
  ``loop.turn`` custom event right after ``loop.session``: ``{turn,
  external_event_id, replayed: false, state}``;
- again, with the same request, nothing runs: the stream says the original
  session and turn — ``loop.session`` when the runtime still holds it, and
  ``loop.turn`` with ``replayed: true`` and where the turn stands
  (``running``, ``finished``, ``failed``) — and the host reads what the turn
  said from the session (`GET /sessions/{uid}/messages`);
- again with another request under the same key: ``409``, said.

Kept for a day, at most :data:`HELD` turns, in the runtime's protocol state
store (kind :data:`KIND`: the agent-memories PostgreSQL on Kubernetes, a
SQLite file elsewhere), so a retry after the runtime restarted is answered
the original turn too (DC-205); a turn that was running when its process went
is answered ``failed``. The turns of one caller never answer another's.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
import uuid
from dataclasses import asdict, dataclass
from typing import Any, AsyncIterator, Dict, Optional, Set, Tuple

#: How long a turn is remembered, in seconds: longer than any host retries.
TTL_SECONDS = 24 * 3600

#: The most turns remembered at once; the oldest go first.
HELD = 5000

#: The longest key or external event id taken.
KEY_LIMIT = 255

#: The custom event that says which turn a stream is.
TURN_EVENT = "loop.turn"

#: The kind of the protocol state records a turn is kept under, by its key.
KIND = "loop.external_turn"

#: How often, in seconds, the stale records are removed from the store; a
#: stale record is never answered, removed or not.
PRUNE_EVERY = 60.0


@dataclass
class ExternalTurn:
    """One external turn, as the runtime remembers it."""

    session_uid: str
    turn: str
    external_event_id: str
    fingerprint: str
    at: float
    state: str = "running"


class TurnConflict(Exception):
    """The same key, another request: the HTTP status and why."""

    status = 409

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


#: The turns this process knows, by key: what it claimed, and what it read
#: back from the store.
_TURNS: Dict[str, ExternalTurn] = {}

#: The turns this process runs: a turn the store says is running and this
#: process does not run ran in a process that went.
_RUNNING: Set[str] = set()

_pruned_at = 0.0


def forget() -> None:
    """Forget what this process holds, as a restart does; the store keeps its records."""
    global _pruned_at
    _TURNS.clear()
    _RUNNING.clear()
    _pruned_at = 0.0


def _store() -> Any:
    from agent_runtimes.protocol_state import protocol_state_store

    return protocol_state_store()


def _caller_key(caller: Any) -> str:
    return "|".join(
        str(getattr(caller, name, "") or "") for name in ("kind", "uid", "visit")
    )


def key_of(caller: Any, idempotency_key: str, external_event_id: str) -> Optional[str]:
    """What names a turn for its caller: the key, else the external event id,
    else nothing (an ordinary turn, not remembered).
    """
    key = str(idempotency_key or "").strip()
    event = str(external_event_id or "").strip()
    if len(key) > KEY_LIMIT or len(event) > KEY_LIMIT:
        raise TurnConflict(
            f"An idempotency key or an external event id is at most {KEY_LIMIT} characters."
        )
    if not key and not event:
        return None
    return f"{_caller_key(caller)}#{'key:' + key if key else 'event:' + event}"


def fingerprint(request: Dict[str, Any]) -> str:
    """What a request asks, as a hash: a retry asks the same."""
    return hashlib.sha256(
        json.dumps(request, sort_keys=True, separators=(",", ":"), default=str).encode()
    ).hexdigest()


def _prune(now: float) -> None:
    for stale in [key for key, turn in _TURNS.items() if turn.at + TTL_SECONDS <= now]:
        del _TURNS[stale]
    while len(_TURNS) >= HELD:
        del _TURNS[next(iter(_TURNS))]


def claim(
    key: str,
    *,
    request: Dict[str, Any],
    session_uid: str,
    external_event_id: str,
    now: Optional[float] = None,
) -> Tuple[ExternalTurn, bool]:
    """The turn a key names: `(turn, True)` when it was already taken — the
    original, to be answered again — `(new turn, False)` the first time.
    `TurnConflict` for the same key with another request.
    """
    at = time.time() if now is None else now
    _prune(at)
    print_ = fingerprint(request)
    known = _TURNS.get(key)
    if known is not None:
        if known.fingerprint != print_:
            raise TurnConflict(
                "This idempotency key was used for another request: send a new key for a new turn."
            )
        return known, True
    turn = ExternalTurn(
        session_uid=session_uid,
        turn=uuid.uuid4().hex,
        external_event_id=str(external_event_id or ""),
        fingerprint=print_,
        at=at,
    )
    _TURNS[key] = turn
    _RUNNING.add(turn.turn)
    return turn, False


def peek(
    key: str, *, request: Dict[str, Any], now: Optional[float] = None
) -> Optional[ExternalTurn]:
    """The turn a key already names, or `None`: before anything is made for it.
    `TurnConflict` for the same key with another request.
    """
    _prune(time.time() if now is None else now)
    known = _TURNS.get(key)
    if known is not None and known.fingerprint != fingerprint(request):
        raise TurnConflict(
            "This idempotency key was used for another request: send a new key for a new turn."
        )
    return known


async def recall(key: str, *, now: Optional[float] = None) -> None:
    """Read back the turn the store keeps under a key, when this process does
    not hold it — after a restart — so that `peek` and `claim` know it. A turn
    the store says is running, which no process runs any longer, is
    ``failed``, and kept so.
    """
    if key in _TURNS:
        return
    value = await _store().get(KIND, key)
    if value is None:
        return
    at = time.time() if now is None else now
    if value.pop("key") != key:
        raise ValueError(f"The external turn record under {key!r} names another key.")
    turn = ExternalTurn(**value)
    if turn.at + TTL_SECONDS <= at:
        await _store().delete(KIND, key)
        return
    if key in _TURNS:
        # Claimed here while the store was read.
        return
    _prune(at)
    gone = turn.state == "running" and turn.turn not in _RUNNING
    if gone:
        turn.state = "failed"
    _TURNS[key] = turn
    if gone:
        await keep(key, turn, now=at)


async def keep(key: str, turn: ExternalTurn, *, now: Optional[float] = None) -> None:
    """Write a turn to the store as it stands, and every :data:`PRUNE_EVERY`
    seconds remove the records older than :data:`TTL_SECONDS` and the oldest
    beyond :data:`HELD`.
    """
    global _pruned_at
    store = _store()
    await store.put(KIND, key, {"key": key, **asdict(turn)})
    at = time.time() if now is None else now
    if at - _pruned_at < PRUNE_EVERY:
        return
    _pruned_at = at
    records = await store.list(KIND)
    stale = [r["key"] for r in records if r["at"] + TTL_SECONDS <= at]
    fresh = [r["key"] for r in records if r["at"] + TTL_SECONDS > at]
    for gone in stale + fresh[: max(0, len(fresh) - HELD)]:
        await store.delete(KIND, gone)


async def release(key: str) -> None:
    """A turn refused before it ran is not remembered: the host may try again."""
    turn = _TURNS.pop(key, None)
    if turn is not None:
        _RUNNING.discard(turn.turn)
    await _store().delete(KIND, key)


def turn_event(turn: ExternalTurn, *, replayed: bool) -> str:
    """The ``loop.turn`` event, encoded as the session API streams events."""
    from ag_ui.core import CustomEvent
    from ag_ui.encoder import EventEncoder

    return str(
        EventEncoder().encode(
            CustomEvent(
                name=TURN_EVENT,
                value={
                    "session": turn.session_uid,
                    "turn": turn.turn,
                    "external_event_id": turn.external_event_id,
                    "replayed": replayed,
                    "state": turn.state,
                },
            )
        )
    )


async def _ended(key: str, turn: ExternalTurn) -> None:
    _RUNNING.discard(turn.turn)
    # Kept even when the stream was cancelled under it.
    await asyncio.shield(keep(key, turn))


async def tracked(
    key: str, turn: ExternalTurn, chunks: AsyncIterator[str]
) -> AsyncIterator[str]:
    """A turn's stream, its state kept as it ends: ``finished``, or ``failed``."""
    try:
        async for chunk in chunks:
            if '"type":"RUN_ERROR"' in chunk:
                turn.state = "failed"
            yield chunk
    except BaseException:
        turn.state = "failed"
        await _ended(key, turn)
        raise
    if turn.state == "running":
        turn.state = "finished"
    await _ended(key, turn)


async def replayed(head: str, turn: ExternalTurn) -> AsyncIterator[str]:
    """What a retry is answered: the session, the original turn, nothing run.

    Yields
    ------
    str
        The session's head, then the original turn's event.
    """
    if head:
        yield head
    yield turn_event(turn, replayed=True)
