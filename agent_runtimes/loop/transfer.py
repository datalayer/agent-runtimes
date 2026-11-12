# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A session moved between this machine and Datalayer, and back.

A transfer is a **move**: the session keeps its uid, lives where it was
sent, and is ended where it was, its record saying where it went — so it is
never resumed twice. (A clone is a new session, with a new uid.)

What is carried is the session's record, through the session file
(``datalayer-session/1``): the entries are exported as an export writes
them — credentials and the runtime's addresses redacted — and read back as
an import reads them, each line validated. The files a session was given
are named in it; their bytes are not carried, as in an export.

The two places are the two session stores: the files of
``~/.datalayer/sessions`` on this machine, and the record of the person's
Datalayer account. Nothing else is written.

Refused, in a sentence: signed out; a session that is open (pause it
first, which gives the agent's memory the conversation) or ended; a
deployment's session, which belongs to its deployment; a seat of a team
run; an agent that is not an agentspec of the catalogue, which a runtime
on Datalayer cannot start; a uid the other place keeps as another session.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, List, Mapping, Optional, Sequence

from agent_runtimes.apps.record import session_from_entries, session_kind
from agent_runtimes.loop.paused import ON_DATALAYER, ON_THIS_MACHINE

#: The most entries the record takes in one write.
RECORD_WRITE = 200

#: What the two places are called in a sentence.
SAID = {ON_THIS_MACHINE: "this machine", ON_DATALAYER: "Datalayer"}


class TransferRefused(Exception):
    """Why a session is not transferred, in a sentence."""


@dataclass(frozen=True)
class Transferred:
    """What a transfer did."""

    uid: str
    to: str
    """`ON_DATALAYER` or `ON_THIS_MACHINE`."""
    agent: str
    kind: str
    turns: int
    entries: int
    """How many entries were carried."""
    redactions: int
    returned: bool
    """Whether it went back where it had been before: only what was new was carried."""

    @property
    def said(self) -> str:
        return (
            f"Transferred {self.uid} to {SAID[self.to]}: {self.turns} turn{'s' if self.turns != 1 else ''}, "
            f"{self.entries} entr{'ies' if self.entries != 1 else 'y'}"
            + (
                f", {self.redactions} redaction{'s' if self.redactions != 1 else ''}"
                if self.redactions
                else ""
            )
            + f". It lives on {SAID[self.to]} now, under the same uid, and is ended where it was."
        )


class Place:
    """One of the two places a session lives: its entries read and written."""

    where: str

    async def entries(self, uid: str) -> List[Dict[str, Any]]:
        raise NotImplementedError

    async def append(
        self, uid: str, entries: Sequence[Mapping[str, Any]], facts: Mapping[str, Any]
    ) -> None:
        raise NotImplementedError

    async def remove(self, uid: str) -> bool:
        """Delete a session kept here, for good: whether it was kept."""
        raise NotImplementedError


class ThisMachine(Place):
    """The files of ``~/.datalayer/sessions``."""

    where = ON_THIS_MACHINE

    def __init__(self, store: Any = None) -> None:
        from agent_runtimes.apps.session_store import FileSessionStore

        self.store = store or FileSessionStore()

    async def entries(self, uid: str) -> List[Dict[str, Any]]:
        return list(await self.store.entries(uid))

    async def append(
        self, uid: str, entries: Sequence[Mapping[str, Any]], facts: Mapping[str, Any]
    ) -> None:
        await self.store.append(uid, entries, **dict(facts))

    async def remove(self, uid: str) -> bool:
        return self.store.delete(uid)


Reader = Callable[[str, str], Awaitable[List[Dict[str, Any]]]]
Writer = Callable[[str, Dict[str, Any]], Awaitable[None]]


async def _write_record(token: str, body: Dict[str, Any]) -> None:
    """Add entries to a session's record on Datalayer, as the person."""
    import httpx
    from datalayer_core.utils.urls import DatalayerURLs

    url = getattr(DatalayerURLs.from_environment(), "ai_agents_url", "") or ""
    if not url:
        raise TransferRefused("No Datalayer is configured to transfer a session to.")
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{url.rstrip('/')}/api/ai-agents/v1/apps/records",
            json=body,
            headers={"Authorization": f"Bearer {token}"},
        )
    if response.status_code >= 300:
        raise TransferRefused(
            f"Datalayer refused the session's record ({response.status_code}): {response.text[:200]}"
        )


class OnDatalayer(Place):
    """The record of the person's Datalayer account, read and written with their token."""

    where = ON_DATALAYER

    def __init__(
        self,
        token: str,
        reader: Optional[Reader] = None,
        writer: Optional[Writer] = None,
    ) -> None:
        self.token = token
        self.reader = reader
        self.writer = writer or _write_record

    async def entries(self, uid: str) -> List[Dict[str, Any]]:
        from agent_runtimes.apps.session_store import _as_entries, _read_record

        answered = await (self.reader or _read_record)(uid, self.token)
        return _as_entries(list(answered))

    async def append(
        self, uid: str, entries: Sequence[Mapping[str, Any]], facts: Mapping[str, Any]
    ) -> None:
        body = {
            "app_uid": str(facts.get("app_uid") or ""),
            "session_uid": uid,
            "version": int(facts.get("version") or 0),
        }
        listed = [
            {
                "kind": str(entry.get("kind") or ""),
                "summary": str(entry.get("summary") or ""),
                "payload": dict(entry.get("payload") or {}),
            }
            for entry in entries
        ]
        for start in range(0, len(listed), RECORD_WRITE):
            await self.writer(
                self.token, {**body, "entries": listed[start : start + RECORD_WRITE]}
            )

    async def remove(self, uid: str) -> bool:
        from agent_runtimes.apps.session_store import _delete_record

        await _delete_record(uid, self.token)
        return True


def _went(entries: Sequence[Mapping[str, Any]]) -> str:
    """Where a session that was transferred away went, by its last entry; ``""`` otherwise."""
    if not entries:
        return ""
    last = entries[-1]
    if last.get("kind") != "ended":
        return ""
    return str((last.get("payload") or {}).get("transferred_to") or "")


def _since_arrival(entries: Sequence[Mapping[str, Any]]) -> List[Mapping[str, Any]]:
    """The entries written since the session last arrived here by a transfer."""
    for index in range(len(entries) - 1, -1, -1):
        payload = entries[index].get("payload") or {}
        if entries[index].get("kind") == "paused" and payload.get("transferred_from"):
            return list(entries[index + 1 :])
    return list(entries)


def check(
    uid: str,
    entries: Sequence[Mapping[str, Any]],
    *,
    to: str,
    catalogue_agent: Optional[Callable[[str], bool]] = None,
) -> Dict[str, Any]:
    """The session as its record says it, when it can be transferred to ``to``.

    Raises
    ------
    TransferRefused
        Why not, in a sentence.
    """
    described = session_from_entries(uid, [dict(entry) for entry in entries])
    if described is None:
        raise TransferRefused(
            f"There is no session {uid} on {SAID[ON_DATALAYER if to == ON_THIS_MACHINE else ON_THIS_MACHINE]}."
        )
    went = _went(entries)
    if went:
        raise TransferRefused(
            f"Session {uid} was transferred to {SAID.get(went, went)} already: it lives there now, under the same uid."
        )
    if described["state"] == "ended":
        raise TransferRefused(
            f"Session {uid} ended; an ended session is not transferred. Clone it to go on from it."
        )
    if described["state"] == "open":
        raise TransferRefused(
            f"Session {uid} is open: pause it first — `/pause` in its prompt, or `loop sessions pause {uid}` — "
            "so that nothing runs while it moves."
        )
    instance = described.get("instance") or {}
    if instance.get("deployment_uid"):
        raise TransferRefused(
            f"Session {uid} is a session of a deployment: it belongs to its deployment, and goes on at its address."
        )
    if (described.get("runs_on") or {}).get("kind") == "team_run":
        raise TransferRefused(
            f"Session {uid} is a seat of a team run: it goes on with its run."
        )
    if to == ON_DATALAYER and session_kind(instance.get("app_uid")) == "agent":
        agent = str(instance.get("app_uid") or "")[len("agent:") :] or str(
            described.get("agent") or ""
        )
        known = catalogue_agent or _in_the_catalogue
        if not known(agent):
            raise TransferRefused(
                f"The agent {agent} is not an agentspec of the catalogue: a runtime on Datalayer cannot "
                f"start it, so session {uid} stays on this machine."
            )
    return described


async def _person(token: str) -> str:
    """The uid of the person a token is, or ``""`` when it cannot be asked."""
    try:
        from agent_runtimes.apps.callers import VERIFIER

        return str((await VERIFIER.verify(token, "")).uid or "")
    except Exception:  # noqa: BLE001 - said by nobody: the record names its writer
        return ""


def _in_the_catalogue(agent: str) -> bool:
    from agent_runtimes.specs.agents.agents import get_agent_spec

    return bool(agent) and get_agent_spec(agent) is not None


def what_is_sent(described: Mapping[str, Any], entries: int, to: str) -> str:
    """What a transfer carries, said before it leaves: the confirmation's sentence."""
    turns = int(described.get("turns") or 0)
    files = sum(1 for kind in described.get("kinds") or [] if kind == "file")
    return (
        f"Transfer session {described.get('uid')} to {SAID[to]}? What is sent: its conversation and its record "
        f"({turns} turn{'s' if turns != 1 else ''}, {entries} entr{'ies' if entries != 1 else 'y'}), "
        "credentials redacted as an export redacts them"
        + (
            "; the files it was given are named, their contents are not sent"
            if files
            else ""
        )
        + ". It keeps its uid, and is ended here."
    )


async def transfer(
    uid: str,
    *,
    source: Place,
    destination: Place,
    by: str = "",
    catalogue_agent: Optional[Callable[[str], bool]] = None,
    confirm: Optional[Callable[[str], bool]] = None,
) -> Transferred:
    """Move a session from ``source`` to ``destination``, under the same uid.

    ``confirm`` is asked once, with what is sent, before anything is
    written; answering no refuses.

    Raises
    ------
    TransferRefused
        Why it was not moved, in a sentence; nothing was written.
    """
    from agent_runtimes.apps.session_files import (
        SessionFormatRefused,
        digest_of,
        format_named,
    )

    if not by and isinstance(source, OnDatalayer | ThisMachine):
        # The person it is written as: the one the token says.
        token = getattr(source, "token", "") or getattr(destination, "token", "")
        by = await _person(token) if token else ""
    entries = await source.entries(uid)
    described = check(
        uid, entries, to=destination.where, catalogue_agent=catalogue_agent
    )
    # The other place may keep this uid only as this same session, ended
    # there when it was transferred here: then it comes back, and only what
    # is new is carried.
    kept = await destination.entries(uid)
    returned = bool(kept)
    if kept and _went(kept) != source.where:
        raise TransferRefused(
            f"{SAID[destination.where].capitalize()} keeps a session {uid} already, and it is not this one: "
            "nothing was transferred. Clone this session to take it there under a new uid."
        )
    carried = _since_arrival(entries) if returned else list(entries)
    fmt = format_named("")
    # A session file names its owner: the person, or this machine's own
    # sessions, which nobody signed in opened.
    owner = str((described.get("opened_by") or {}).get("uid") or by or "local")
    described = {**described, "opened_by": {"uid": owner}}
    try:
        exported = fmt.export(described, carried, exported_by=by or owner)
        imported = fmt.import_(exported.lines)
    except SessionFormatRefused as refused:
        raise TransferRefused(
            f"Session {uid} cannot be written as a session file: {refused.reason}"
        ) from None
    if confirm is not None and not confirm(
        what_is_sent(described, exported.entries, destination.where)
    ):
        raise TransferRefused("Not transferred: nothing was sent.")
    instance = described.get("instance") or {}
    facts = {
        "app_uid": str(instance.get("app_uid") or ""),
        "version": int(instance.get("version") or 0),
        "opened_by": by,
    }
    arrival = {
        "kind": "paused",
        "summary": f"Transferred from {SAID[source.where]}: the same session, paused here",
        "payload": {
            "state": "paused",
            "transferred_from": source.where,
            "digest": digest_of(exported.lines),
            "entries": exported.entries,
        },
    }
    await destination.append(uid, [*imported.entries, arrival], facts)
    # Ended where it was, saying where it went: it is not resumed twice.
    await source.append(
        uid,
        [
            {
                "kind": "ended",
                "summary": f"Transferred to {SAID[destination.where]}: it goes on there, under the same uid",
                "payload": {"state": "ended", "transferred_to": destination.where},
            }
        ],
        facts,
    )
    return Transferred(
        uid=uid,
        to=destination.where,
        agent=str(described.get("agent") or ""),
        kind=str(described.get("kind") or ""),
        turns=int(described.get("turns") or 0),
        entries=exported.entries,
        redactions=exported.redactions,
        returned=returned,
    )


def places(
    to: str,
    token: str,
    *,
    store: Any = None,
    reader: Optional[Reader] = None,
    writer: Optional[Writer] = None,
) -> tuple[Place, Place]:
    """The place a session leaves and the one it goes to, for ``--to cloud`` or ``--to local``.

    Raises
    ------
    TransferRefused
        Signed out: a session goes to, and comes from, a Datalayer account.
    """
    if to not in (ON_DATALAYER, ON_THIS_MACHINE):
        raise TransferRefused(
            f"A session is transferred to `cloud` or to `local`, not to {to!r}."
        )
    if not token:
        raise TransferRefused(
            "You are not signed in: a session is transferred to, and from, your Datalayer account. "
            "Sign in with `datalayer login`."
        )
    here, there = ThisMachine(store), OnDatalayer(token, reader, writer)
    return (here, there) if to == ON_DATALAYER else (there, here)


__all__ = [
    "OnDatalayer",
    "Place",
    "ThisMachine",
    "TransferRefused",
    "Transferred",
    "check",
    "places",
    "transfer",
    "what_is_sent",
]
