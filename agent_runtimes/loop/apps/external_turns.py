# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Idempotent external turns (plans/SLACK.md §4.3, 2; §2 rule 8).

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

Held by the runtime that holds the sessions, for a day, at most
:data:`HELD` turns; the turns of one caller never answer another's.
"""

from __future__ import annotations

import hashlib
import json
import time
import uuid
from dataclasses import dataclass
from typing import Any, AsyncIterator, Dict, Optional, Tuple

#: How long a turn is remembered, in seconds: longer than any host retries.
TTL_SECONDS = 24 * 3600

#: The most turns remembered at once; the oldest go first.
HELD = 5000

#: The longest key or external event id taken.
KEY_LIMIT = 255

#: The custom event that says which turn a stream is.
TURN_EVENT = "loop.turn"


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


_TURNS: Dict[str, ExternalTurn] = {}


def forget() -> None:
    _TURNS.clear()


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


def release(key: str) -> None:
    """A turn refused before it ran is not remembered: the host may try again."""
    _TURNS.pop(key, None)


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


async def tracked(turn: ExternalTurn, chunks: AsyncIterator[str]) -> AsyncIterator[str]:
    """A turn's stream, its state kept as it ends: ``finished``, or ``failed``."""
    try:
        async for chunk in chunks:
            if '"type":"RUN_ERROR"' in chunk:
                turn.state = "failed"
            yield chunk
    except BaseException:
        turn.state = "failed"
        raise
    if turn.state == "running":
        turn.state = "finished"


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
