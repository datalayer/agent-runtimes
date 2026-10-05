# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What an application remembers (LOOP R-18, R-35, R-36).

An application remembers when its Appspec says so — ``memory: mem0``, the
memory of the catalogue enabled today; any other is not enabled, and its
setup notes say so. It remembers **per person and application**: its
memories are kept in mem0 under the person and the application's key,
``app:<its uid>`` — the `app` item the platform keeps it as — or
``app:<its id>`` for an application run from its file, which has no item.
Its Preview and every deployment of it remember together: a deployment has
no memories of its own.

**Each person apart** (LOOP R-36): a turn remembers under whoever opened its
session — its owner, or a visitor at its address under the visitor's own uid,
apart from its owner and from each other (`remember_for`). Nobody is never
the owner: a visitor who is not signed in, or one of an embed, which does not
know who its visitor is, has nothing remembered, and the agent is told so in
a sentence. A run outside a session — the scheduler's tick — is its owner's.

**Shared with the applications a person allows** (LOOP R-35): besides its
own, an application's agent reads what the other applications the person
allowed remember of them — and never any other's. The allowances are the
person's, kept by the runtimes service beside the memories
(``/api/runtimes/v1/memory-shares``), and read once per turn with the
caller's token (`read_shares`). What it learns it writes under its own key
only.

A person reads what an application remembers of them, corrects one in place
(LOOP R-34) and forgets them, one or all, here
(`agent_runtimes.routes.apps`, ``/api/v1/apps/memories/{app}``) — their own,
the owner and a visitor alike — or through the runtimes service, whether or
not a runtime is running.
"""

from __future__ import annotations

import os
from collections import OrderedDict
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, List, Mapping, Optional, Tuple

import httpx

from agent_runtimes.memory.base import BaseMemoryBackend
from agent_runtimes.memory.capability import MemoryCapability
from agent_runtimes.memory.config import resolve_mem0_config
from agent_runtimes.memory.identity import resolve_memory_identity
from agent_runtimes.memory.mem0_backend import Mem0Backend
from agent_runtimes.types import AppSpec

#: Where an application's memories are kept, before its uid or id.
KEY_PREFIX = "app:"

#: The memory of the catalogue an application can remember with today.
ENABLED = "mem0"

#: What the agent is told when its visitor is not signed in.
NOT_SIGNED_IN = (
    "Nothing is remembered in this conversation: its visitor is not signed in, "
    "and what an application remembers is kept for each person under their own account."
)

#: What the agent is told in an embed's conversation.
EMBEDDED = (
    "Nothing is remembered in this conversation: an embedded application does not "
    "know who its visitor is."
)

#: Where the runtimes service keeps a person's allowances.
SHARES_PATH = "/api/runtimes/v1/memory-shares"


@dataclass
class Rememberer:
    """Whose memories a turn reads and writes, or why none."""

    user_id: str = ""
    """The person: the runtime's owner, or a visitor under their own uid."""

    withheld: str = ""
    """Why nothing is remembered, in a sentence; '' when it is."""

    token: str = ""
    """The caller's token, with which their allowances are read."""

    shared: Optional[Tuple[str, ...]] = None
    """The keys of the other applications it may read, once read in the turn."""


#: Who the turn under way remembers for; None outside a session: its owner.
_TURN: ContextVar[Optional[Rememberer]] = ContextVar(
    "loop_app_rememberer", default=None
)


def remember_for(caller: Any, token: str) -> None:
    """Remember, in the turn under way, for whoever opened its session (LOOP R-36).

    ``caller`` is who opened it (`agent_runtimes.loop.apps.callers.Caller`):
    the machine itself and the runtime's owner remember as the owner; another
    person who is signed in, under their own uid; an embed's visitor, or a
    visitor who is not signed in, has nothing remembered — never the owner's.
    """
    identity = resolve_memory_identity()
    kind, uid = getattr(caller, "kind", ""), str(getattr(caller, "uid", "") or "")
    if kind == "local" or (kind == "person" and uid and uid == identity.user_uid):
        who = Rememberer(user_id=identity.user_id, token=token)
    elif kind == "person" and uid:
        who = Rememberer(user_id=uid, token=token)
    elif kind == "embed":
        who = Rememberer(withheld=EMBEDDED)
    else:
        who = Rememberer(withheld=NOT_SIGNED_IN)
    _TURN.set(who)


def rememberer() -> Rememberer:
    """Who the turn under way remembers for: outside a session, the runtime's owner."""
    return _TURN.get() or Rememberer(user_id=resolve_memory_identity().user_id)


def withheld() -> str:
    """Why the turn under way remembers nothing, in a sentence; '' when it remembers."""
    return rememberer().withheld


class SharesUnread(RuntimeError):
    """What a person allowed could not be read, in a sentence."""


async def _ask_shares(url: str, token: str) -> List[Dict[str, Any]]:
    """Ask the runtimes service for the caller's allowances."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(url, headers={"Authorization": f"Bearer {token}"})
    if response.status_code != 200:
        raise SharesUnread(
            "What you allowed other applications to share with this one could not "
            f"be read: the runtimes service answered {response.status_code}."
        )
    shares = response.json().get("shares")
    if not isinstance(shares, list):
        raise SharesUnread(
            "The runtimes service answered allowances of the wrong shape."
        )
    return [share for share in shares if isinstance(share, dict)]


#: How the runtimes service is asked: (url, token) -> its shares.
_asker: Dict[str, Callable[[str, str], Awaitable[List[Dict[str, Any]]]]] = {
    "ask": _ask_shares
}


async def read_shares(reader: str, token: str) -> Tuple[str, ...]:
    """The keys of the applications a person allowed ``reader`` to read, with their token.

    With no token — the machine itself, a run outside a session — nothing
    is read and it reads its own only. A runtime that does not know where
    the runtimes service is, or a service that refuses, is said: `SharesUnread`.
    """
    if not token:
        return ()
    base = (os.environ.get("DATALAYER_RUNTIMES_URL") or "").strip().rstrip("/")
    if not base:
        raise SharesUnread(
            "This runtime does not know where the runtimes service is "
            "(DATALAYER_RUNTIMES_URL), so what you allowed other applications "
            "to share with this one could not be read."
        )
    try:
        shares = await _asker["ask"](
            str(httpx.URL(f"{base}{SHARES_PATH}", params={"reader": reader})), token
        )
    except httpx.HTTPError as error:
        raise SharesUnread(
            "What you allowed other applications to share with this one could not "
            f"be read: the runtimes service was not reached ({type(error).__name__})."
        ) from None
    return tuple(
        str(share["source"])
        for share in shares
        if str(share.get("reader")) == reader and str(share.get("source") or "")
    )


class MemoryNotKept(RuntimeError):
    """Why this runtime cannot reach what an application remembers, in a sentence."""


def remembers_with(app: AppSpec) -> str:
    """The memory an application remembers with, or '' when it remembers nothing.

    Its Appspec's own ``memory``, never its agent's: an application has
    what it names.
    """
    reference = (app.memory or "").strip()
    base, _, version = reference.rpartition(":")
    memory = base if base and "." in version else reference
    return ENABLED if memory == ENABLED else ""


def memory_key(app: AppSpec, instance: Optional[Mapping[str, Any]] = None) -> str:
    """Where an application's memories are kept: its uid, else its id."""
    uid = str((instance or {}).get("app_uid") or "").strip()
    return key_of(uid or app.id)


def key_of(app: str) -> str:
    """The key of an application named by its uid (or, run from its file, its id)."""
    app = app.strip()
    if not app or any(ch.isspace() for ch in app):
        raise ValueError(f"{app!r} names no application.")
    return f"{KEY_PREFIX}{app}"


def agent_memory(
    app: AppSpec, instance: Optional[Mapping[str, Any]] = None
) -> Tuple[str, Optional[dict[str, Any]]]:
    """The memory the agent of an application is made with, and its config.

    ``("mem0", config)`` remembering under its key, or ``("ephemeral",
    None)``: remembering nothing — whatever its agent's spec says.
    """
    if not remembers_with(app):
        return "ephemeral", None
    return ENABLED, {
        "datalayer": {"memory_agent_id": memory_key(app, instance), "app_memory": True}
    }


def app_memory(key: str, user_id: str) -> Mem0Backend:
    """The memories kept under a key for a person.

    `MemoryNotKept` when this runtime has no mem0 to reach them with.
    """
    try:
        import mem0  # noqa: F401
    except ImportError:
        raise MemoryNotKept(
            "This runtime keeps no memories: mem0 is not installed on it."
        ) from None
    return Mem0Backend(
        user_id=user_id,
        agent_id=key,
        config=resolve_mem0_config(user_id=user_id, agent_id=key),
    )


#: The most (person, key) stores an agent keeps open at once.
KEPT_OPEN = 64


class AppMemory(BaseMemoryBackend):
    """What an application's agent remembers: for whoever the turn is of.

    It writes under its own key; it reads its own and what the applications
    the person allowed remember of them (LOOP R-35), each marked with the
    application that remembered it (``remembered_by``).
    """

    def __init__(self, key: str):
        """Remember under ``key``, the application's: ``app:<its uid>``."""
        self.key = key
        self._open: "OrderedDict[Tuple[str, str], Mem0Backend]" = OrderedDict()

    def _store(self, user_id: str, key: str) -> Mem0Backend:
        """The person's memories of one application, kept open for the next turn."""
        held = self._open.get((user_id, key))
        if held is None:
            held = app_memory(key, user_id)
            self._open[(user_id, key)] = held
            while len(self._open) > KEPT_OPEN:
                self._open.popitem(last=False)
        else:
            self._open.move_to_end((user_id, key))
        return held

    @staticmethod
    def _who() -> Rememberer:
        """Who the turn is of; `MemoryNotKept`, in its sentence, when nobody."""
        who = rememberer()
        if who.withheld:
            raise MemoryNotKept(who.withheld)
        return who

    async def readable(self) -> Tuple[str, ...]:
        """The other applications the person allowed it to read, once per turn."""
        who = self._who()
        if who.shared is None:
            who.shared = tuple(
                key for key in await read_shares(self.key, who.token) if key != self.key
            )
        return who.shared

    async def add(
        self, messages: list[dict], metadata: dict[str, Any] | None = None
    ) -> None:
        """Keep what it learned under its own key, for the person of the turn."""
        await self._store(self._who().user_id, self.key).add(messages, metadata)

    async def search(self, query: str, limit: int = 10) -> list[dict[str, Any]]:
        """Find its own first, then what the applications allowed remember of the person."""
        who = self._who()
        found = await self._store(who.user_id, self.key).search(query, limit=limit)
        for source in await self.readable():
            for entry in await self._store(who.user_id, source).search(
                query, limit=limit
            ):
                found.append(
                    {
                        **entry,
                        "metadata": {**entry["metadata"], "remembered_by": source},
                    }
                )
        return found

    async def list_all(self, limit: int = 50) -> list[dict[str, Any]]:
        """List what it remembers of the person of the turn, newest first."""
        return await self._store(self._who().user_id, self.key).list_all(limit=limit)

    async def close(self) -> None:
        """Let go of the stores it kept open."""
        self._open.clear()


def app_memory_capability(key: str) -> MemoryCapability:
    """The memory of an application's agent: per person, shared as they allow."""
    return MemoryCapability(backend=AppMemory(key), agent_id=key, withheld=withheld)
