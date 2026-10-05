# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What an application remembers (LOOP R-18).

An application remembers when its Appspec says so — ``memory: mem0``, the
memory of the catalogue enabled today; any other is not enabled, and its
setup notes say so. It remembers **per person and application**: its
memories are kept in mem0 under the runtime's owner (the trusted identity
of `agent_runtimes.memory.identity`) and the application's key,
``app:<its uid>`` — the `app` item the platform keeps it as — or
``app:<its id>`` for an application run from its file, which has no item.
Its Preview and every deployment of it remember together: a deployment has
no memories of its own.

It remembers only in conversations of its owner: a session somebody else
opened — at its address, embedded — reads nothing of what it remembers and
writes nothing to it (`withhold_for`), since what it keeps is its owner's.
A run outside a session — the scheduler's tick, as its owner — remembers.

Its owner reads them, corrects one in place (LOOP R-34) and forgets them,
one or all, here
(`agent_runtimes.routes.apps`, ``/api/v1/apps/memories/{app}``), on a
runtime of theirs — the store is the same from every runtime of the person.
"""

from __future__ import annotations

from contextvars import ContextVar
from typing import Any, Mapping, Optional, Tuple

from agent_runtimes.memory.config import resolve_mem0_config
from agent_runtimes.memory.identity import resolve_memory_identity
from agent_runtimes.memory.mem0_backend import Mem0Backend
from agent_runtimes.types import AppSpec

#: Where an application's memories are kept, before its uid or id.
KEY_PREFIX = "app:"

#: The memory of the catalogue an application can remember with today.
ENABLED = "mem0"


#: Whether the run under way is of a session its owner did not open.
_WITHHELD: ContextVar[bool] = ContextVar("loop_app_memory_withheld", default=False)


def withhold_for(caller: Any) -> None:
    """Withhold memory from the run under way unless its owner opened the session.

    ``caller`` is who opened it (`agent_runtimes.loop.apps.callers.Caller`):
    the machine itself, or the person whose memories the runtime keeps,
    remember; anybody else — another person, an embed, nobody — does not.
    """
    owner = resolve_memory_identity().user_uid
    kind, uid = getattr(caller, "kind", ""), getattr(caller, "uid", "")
    _WITHHELD.set(
        not (kind == "local" or (kind == "person" and owner and uid == owner))
    )


def remembering() -> bool:
    """Whether the run under way may read and write what its application remembers."""
    return not _WITHHELD.get()


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
        "datalayer": {"memory_agent_id": memory_key(app, instance), "owner_only": True}
    }


def app_memory(key: str) -> Mem0Backend:
    """The memories kept under a key for the runtime's owner.

    `MemoryNotKept` when this runtime has no mem0 to reach them with.
    """
    try:
        import mem0  # noqa: F401
    except ImportError:
        raise MemoryNotKept(
            "This runtime keeps no memories: mem0 is not installed on it."
        ) from None
    user_id = resolve_memory_identity().user_id
    return Mem0Backend(
        user_id=user_id,
        agent_id=key,
        config=resolve_mem0_config(user_id=user_id, agent_id=key),
    )
