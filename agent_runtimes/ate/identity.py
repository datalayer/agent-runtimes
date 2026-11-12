# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The actor's identity, read at the time of use.

Agent Substrate projects an actor's metadata to files of a ``systemInfo``
volume (``actorMetadata``): its name, its atespace and its uid. They are files,
not environment variables, because every actor of a template is restored from
the same golden snapshot: an environment variable, or anything the process read
at start, is the golden actor's and identical in every clone. The files are the
actor's own, so they are read again after each wake.

A Datalayer runtime served by an actor is named ``rt-<uid>``, its uid
lowercased (actor names are DNS labels). The runtime's uid is that name's tail,
uppercased back: a ULID. That uid is the runtime's identity everywhere on the
platform; the worker the actor runs on is never named.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

#: The file names the rendered template projects (``template.py``).
NAME_FILE = "actor-name"
ATESPACE_FILE = "atespace"
UID_FILE = "actor-uid"

#: The prefix of an actor that serves a Datalayer runtime.
RUNTIME_ACTOR_PREFIX = "rt-"

#: A runtime uid: a ULID (Crockford base32, 26 characters).
_ULID = re.compile(r"^[0-9A-HJKMNP-TV-Z]{26}$")


@dataclass(frozen=True)
class ActorIdentity:
    """Who the actor is: its atespace, its name and its uid (an incarnation)."""

    atespace: str
    name: str
    uid: str

    @property
    def runtime_uid(self) -> Optional[str]:
        """The Datalayer runtime the actor serves, when it is named for one."""
        return runtime_uid_of_actor(self.name)

    def as_dict(self) -> dict[str, Optional[str]]:
        """The identity as the ``/ate/identity`` route answers it."""
        return {
            "atespace": self.atespace,
            "actor": self.name,
            "actor_uid": self.uid,
            "runtime_uid": self.runtime_uid,
        }


def runtime_uid_of_actor(actor_name: Optional[str]) -> Optional[str]:
    """The runtime uid of an actor named ``rt-<uid>``, or ``None``.

    Parameters
    ----------
    actor_name : str, optional
        The actor's name.

    Returns
    -------
    str or None
        The ULID, uppercased; ``None`` when the name is not a runtime's.
    """
    name = (actor_name or "").strip()
    if not name.startswith(RUNTIME_ACTOR_PREFIX):
        return None
    uid = name[len(RUNTIME_ACTOR_PREFIX) :].upper()
    return uid if _ULID.match(uid) else None


def actor_name_of_runtime(runtime_uid: str) -> str:
    """The actor name of a Datalayer runtime: ``rt-`` and its uid, lowercased.

    Raises
    ------
    ValueError
        When the uid is not a ULID, in a sentence.
    """
    uid = (runtime_uid or "").strip().upper()
    if not _ULID.match(uid):
        raise ValueError(f"A runtime uid is a ULID, not {runtime_uid!r}.")
    return f"{RUNTIME_ACTOR_PREFIX}{uid.lower()}"


def _read(directory: Path, name: str) -> str:
    try:
        return (directory / name).read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        return ""


def read_identity(system_info_dir: str) -> Optional[ActorIdentity]:
    """The actor's identity from its ``systemInfo`` directory, read now.

    Parameters
    ----------
    system_info_dir : str
        Where the ``actorMetadata`` files are projected.

    Returns
    -------
    ActorIdentity or None
        ``None`` when the directory carries no actor name: the process is not
        running as an actor (a local run, a test).
    """
    directory = Path(system_info_dir)
    name = _read(directory, NAME_FILE)
    if not name:
        return None
    return ActorIdentity(
        atespace=_read(directory, ATESPACE_FILE),
        name=name,
        uid=_read(directory, UID_FILE),
    )


__all__ = [
    "ATESPACE_FILE",
    "ActorIdentity",
    "NAME_FILE",
    "RUNTIME_ACTOR_PREFIX",
    "UID_FILE",
    "actor_name_of_runtime",
    "read_identity",
    "runtime_uid_of_actor",
]
