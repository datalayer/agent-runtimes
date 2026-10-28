# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Where sessions are kept: the ``session.store`` point's two contributions (MH-F03).

The entries half of a session's truth — its record — is a
:class:`~agent_runtimes.plugins.points.SessionStore`: **the record store**,
today's ai-agents reader and writer (``GET /api/ai-agents/v1/apps/records``
by session, ``POST …/apps/records`` for the writer, ``GET …/apps/sessions``
by opener and ``POST …/apps/records/copy`` once the services answer them),
keyed by ``DATALAYER_AI_AGENTS_URL``; and **the file store**, one
``entries.jsonl`` per session under ``~/.datalayer/sessions/<uid>/``, for
``loop`` on a machine and the tests. The harness rows (``harness_session``
per (session, agent)) are the protocol state store's, unchanged: the other
half, not redesigned.

One store is active, chosen by configuration (:func:`active_store`):
``AGENT_RUNTIMES_SESSION_STORE`` names it (``record`` or ``file``); unset,
the record store when an ai-agents URL is configured, the file store
otherwise. Two names, or a name nothing contributes, refuse the host in a
sentence at start. Every session operation of the model — list, get,
resume from the record, clone, export, import — reads and writes through
the active store; the recorder's sends go through it too
(:func:`send_through_store`), so a session kept in a file is kept whole.

Each entry has one shape in both stores, the record's: ``{uid, app_uid,
deployment_uid, session_uid, version, purpose, opened_by, kind, summary,
payload, at}`` (``at`` is Solr's ``created_at``).
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, List, Mapping, Optional, Sequence

from agent_runtimes.loop.apps.record import session_from_entries
from agent_runtimes.plugins.points import SESSION_STORES, SessionPage

logger = logging.getLogger(__name__)

#: The variable that names the active store.
STORE_VARIABLE = "AGENT_RUNTIMES_SESSION_STORE"

#: The file store's root when ``AGENT_RUNTIMES_SESSIONS_PATH`` names none.
DEFAULT_SESSIONS_PATH = Path.home() / ".datalayer" / "sessions"

#: The file of a session's entries.
ENTRIES_FILE = "entries.jsonl"

#: The most sessions a page lists.
PAGE_LIMIT = 200


class SessionStoreRefused(RuntimeError):
    """The host's store configuration refused, in a sentence."""


class SessionStoreError(RuntimeError):
    """A store that could not answer, in a sentence; the status to say it with."""

    def __init__(self, status: int, reason: str):
        super().__init__(reason)
        self.status = status
        self.reason = reason


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _page(
    sessions: List[Dict[str, Any]],
    *,
    owner: Mapping[str, str],
    app: str,
    after: str,
    limit: int,
    agent: str,
    state: str,
    query: str,
    archived: bool,
) -> SessionPage:
    """One page of described sessions, newest first, the filters of MH-02 applied."""
    uid = str(owner.get("uid") or "")
    kind = str(owner.get("kind") or "")
    kept = []
    for session in sessions:
        if kind != "local" and session["opened_by"]["uid"] != uid:
            continue
        if (
            app
            and session["app"]["id"] != app
            and session["instance"]["app_uid"] != app
        ):
            continue
        if agent and session["agent"] != agent:
            continue
        if state and session["state"] != state:
            continue
        if query and query.lower() not in session["title"].lower():
            continue
        # `archived` includes the archived; unsaid, they are hidden.
        if session["archived"] and not archived:
            continue
        kept.append(session)
    kept.sort(key=lambda s: s["started_at"], reverse=True)
    if after:
        uids = [s["uid"] for s in kept]
        kept = kept[uids.index(after) + 1 :] if after in uids else []
    limit = max(1, min(int(limit or 50), PAGE_LIMIT))
    return SessionPage(sessions=kept[:limit], has_more=len(kept) > limit)


def _up_to_turn(
    entries: List[Dict[str, Any]], up_to_turn: Optional[int]
) -> List[Dict[str, Any]]:
    """The entries up to the Nth turn (the turn entry included), or all."""
    if up_to_turn is None:
        return list(entries)
    kept: List[Dict[str, Any]] = []
    turns = 0
    for entry in entries:
        if turns >= up_to_turn and entry.get("kind") not in ("session",):
            break
        kept.append(entry)
        if entry.get("kind") == "turn":
            turns += 1
            if turns >= up_to_turn:
                break
    return kept


#: What a clone does not copy: the source's own state and audit rows — the
#: clone's opening entry says its own state, agent and lineage.
NOT_CLONED = frozenset(
    {"session", "paused", "ended", "cloned", "exported", "imported", "titled"}
)


def cloned_entries(
    entries: List[Dict[str, Any]], up_to_turn: Optional[int]
) -> List[Dict[str, Any]]:
    """What a clone copies: the entries up to the turn, without the source's
    own state and audit rows, and the session's Rules whole — a rule is the
    session's, not a turn's, wherever it was added.
    """
    kept = [
        e for e in _up_to_turn(entries, up_to_turn) if e.get("kind") not in NOT_CLONED
    ]
    seen = {id(e) for e in kept}
    kept.extend(e for e in entries if e.get("kind") == "rule" and id(e) not in seen)
    return kept


@dataclass
class FileSessionStore:
    """Sessions in files: ``<root>/<uid>/entries.jsonl``."""

    root: Path = field(
        default_factory=lambda: Path(
            os.environ.get("AGENT_RUNTIMES_SESSIONS_PATH", "").strip()
            or DEFAULT_SESSIONS_PATH
        )
    )
    name: str = "file"

    def _file(self, uid: str) -> Path:
        return self.root / uid / ENTRIES_FILE

    def _read(self, uid: str) -> List[Dict[str, Any]]:
        path = self._file(uid)
        if not path.is_file():
            return []
        entries = []
        for line in path.read_text().splitlines():
            if line.strip():
                entries.append(json.loads(line))
        return entries

    async def list(
        self,
        owner: Mapping[str, str],
        *,
        app: str = "",
        after: str = "",
        limit: int = 50,
        agent: str = "",
        state: str = "",
        query: str = "",
        archived: bool = False,
    ) -> SessionPage:
        sessions = []
        if self.root.is_dir():
            for folder in sorted(self.root.iterdir()):
                entries = self._read(folder.name)
                described = session_from_entries(folder.name, entries)
                if described is not None:
                    sessions.append(described)
        return _page(
            sessions,
            owner=owner,
            app=app,
            after=after,
            limit=limit,
            agent=agent,
            state=state,
            query=query,
            archived=archived,
        )

    async def get(self, uid: str) -> Optional[Dict[str, Any]]:
        return session_from_entries(uid, self._read(uid))

    async def entries(
        self, uid: str, *, up_to_turn: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        return _up_to_turn(self._read(uid), up_to_turn)

    async def append(
        self, uid: str, entries: Sequence[Mapping[str, Any]], **body: Any
    ) -> None:
        path = self._file(uid)
        path.parent.mkdir(parents=True, exist_ok=True)
        at = _now()
        with path.open("a") as out:
            for entry in entries:
                line = {
                    "app_uid": str(body.get("app_uid") or entry.get("app_uid") or ""),
                    "deployment_uid": str(
                        body.get("deployment_uid") or entry.get("deployment_uid") or ""
                    ),
                    "session_uid": uid,
                    "version": int(body.get("version") or entry.get("version") or 0),
                    "purpose": str(body.get("purpose") or entry.get("purpose") or ""),
                    "opened_by": str(
                        body.get("opened_by") or entry.get("opened_by") or ""
                    ),
                    "kind": str(entry.get("kind") or ""),
                    "summary": str(entry.get("summary") or ""),
                    "payload": dict(entry.get("payload") or {}),
                    "at": str(entry.get("at") or at),
                }
                out.write(json.dumps(line, default=str) + "\n")

    async def copy(
        self, uid: str, to_uid: str, *, up_to_turn: Optional[int] = None
    ) -> int:
        entries = cloned_entries(self._read(uid), up_to_turn)
        if self._file(to_uid).exists():
            raise SessionStoreError(
                409, f"Session {to_uid} is kept already; a clone is a new uid."
            )
        await self.append(to_uid, [{**e, "session_uid": to_uid} for e in entries])
        return len(entries)

    async def lineage(self, uid: str) -> Dict[str, Any]:
        described = await self.get(uid)
        return (
            dict(described["lineage"])
            if described
            else {"forked_from": None, "imported_from": None}
        )


Reader = Callable[[str, str], Awaitable[List[Dict[str, Any]]]]


#: The most entries of one session the record answers at once (ai-agents'
#: `MAX_READ`). A session read back with that many is not known to be whole:
#: refused, never cut short and resumed, cloned or exported as if it were.
RECORD_READ_LIMIT = 1000


def _whole(session_uid: str, answered: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """The entries answered, when they can be the whole session."""
    if len(answered) >= RECORD_READ_LIMIT:
        raise SessionStoreError(
            409,
            f"Session {session_uid} has {RECORD_READ_LIMIT} entries or more, and "
            f"the record answers at most {RECORD_READ_LIMIT} at once: it cannot "
            "be read back whole yet.",
        )
    return answered


async def _read_record(session_uid: str, bearer: str) -> List[Dict[str, Any]]:
    """A session's record, read from ai-agents as the caller."""
    if not bearer:
        raise SessionStoreError(
            401,
            f"Session {session_uid} cannot be read back: the record is read with your token, and none was sent.",
        )
    import httpx
    from datalayer_core.utils.urls import DatalayerURLs

    url = getattr(DatalayerURLs.from_environment(), "ai_agents_url", "") or ""
    if not url:
        raise SessionStoreError(
            503,
            f"Session {session_uid} cannot be read back: no ai-agents is configured.",
        )
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            f"{url.rstrip('/')}/api/ai-agents/v1/apps/records",
            params={"session_uid": session_uid, "limit": RECORD_READ_LIMIT},
            headers={"Authorization": f"Bearer {bearer}"},
        )
    if response.status_code >= 300:
        raise SessionStoreError(
            502,
            f"The record of session {session_uid} could not be read ({response.status_code}): {response.text[:200]}",
        )
    return list((response.json() or {}).get("entries") or [])


def _as_entries(answered: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """The entries ai-agents answered, in the store's shape: ``created_at`` said as ``at``."""
    return [
        {**entry, "at": str(entry.get("created_at") or entry.get("at") or "")}
        for entry in answered
    ]


async def _list_sessions(bearer: str, params: Dict[str, Any]) -> Dict[str, Any]:
    """A person's sessions from ai-agents (MH-P01's route): ``{sessions, has_more}``."""
    if not bearer:
        raise SessionStoreError(
            401,
            "Sessions cannot be listed: the record is read with your token, and none was sent.",
        )
    import httpx
    from datalayer_core.utils.urls import DatalayerURLs

    url = getattr(DatalayerURLs.from_environment(), "ai_agents_url", "") or ""
    if not url:
        raise SessionStoreError(
            503, "Sessions cannot be listed: no ai-agents is configured."
        )
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            f"{url.rstrip('/')}/api/ai-agents/v1/apps/sessions",
            params={k: v for k, v in params.items() if v not in ("", None, False)},
            headers={"Authorization": f"Bearer {bearer}"},
        )
    if response.status_code >= 300:
        raise SessionStoreError(
            502,
            f"The sessions could not be listed ({response.status_code}): {response.text[:200]}",
        )
    return dict(response.json() or {})


async def _copy_record(bearer: str, body: Dict[str, Any]) -> int:
    """Copy a session's entries under a new uid, server-side (MH-P02's route)."""
    if not bearer:
        raise SessionStoreError(
            401,
            f"Session {body.get('from')} cannot be cloned: the record is read with your token, and none was sent.",
        )
    import httpx
    from datalayer_core.utils.urls import DatalayerURLs

    url = getattr(DatalayerURLs.from_environment(), "ai_agents_url", "") or ""
    if not url:
        raise SessionStoreError(
            503,
            f"Session {body.get('from')} cannot be cloned: no ai-agents is configured.",
        )
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{url.rstrip('/')}/api/ai-agents/v1/apps/records/copy",
            json=body,
            headers={"Authorization": f"Bearer {bearer}"},
        )
    if response.status_code >= 300:
        raise SessionStoreError(
            502,
            f"Session {body.get('from')} could not be copied ({response.status_code}): {response.text[:200]}",
        )
    return int((response.json() or {}).get("copied") or 0)


def _bearer() -> str:
    from agent_runtimes.context.identities import get_request_user_jwt

    return get_request_user_jwt() or ""


@dataclass
class RecordSessionStore:
    """Sessions in the record, on ai-agents: today's reader and writer.

    ``reader``, ``lister`` and ``copier`` stand in for ai-agents in tests
    (:func:`use_record_reader`); each is called with the caller's token.
    """

    name: str = "record"
    reader: Reader = _read_record
    lister: Callable[[str, Dict[str, Any]], Awaitable[Dict[str, Any]]] = _list_sessions
    copier: Callable[[str, Dict[str, Any]], Awaitable[int]] = _copy_record

    async def list(
        self,
        owner: Mapping[str, str],
        *,
        app: str = "",
        after: str = "",
        limit: int = 50,
        agent: str = "",
        state: str = "",
        query: str = "",
        archived: bool = False,
    ) -> SessionPage:
        answered = await self.lister(
            _bearer(),
            {
                "opened_by": str(owner.get("uid") or ""),
                "app_uid": app,
                "agent": agent,
                "state": state,
                "q": query,
                "archived": "true" if archived else "",
                "after": after,
                "limit": max(1, min(int(limit or 50), PAGE_LIMIT)),
            },
        )
        return SessionPage(
            sessions=[dict(item) for item in answered.get("sessions") or []],
            has_more=bool(answered.get("has_more")),
        )

    async def get(self, uid: str) -> Optional[Dict[str, Any]]:
        answered = _whole(uid, await self.reader(uid, _bearer()))
        return session_from_entries(uid, _as_entries(answered))

    async def entries(
        self, uid: str, *, up_to_turn: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        answered = _whole(uid, await self.reader(uid, _bearer()))
        return _up_to_turn(_as_entries(answered), up_to_turn)

    async def append(
        self, uid: str, entries: Sequence[Mapping[str, Any]], **body: Any
    ) -> None:
        from agent_runtimes.loop.apps.record import send_to_ai_agents

        await send_to_ai_agents(
            {**body, "session_uid": uid, "entries": [dict(e) for e in entries]}
        )

    async def copy(
        self, uid: str, to_uid: str, *, up_to_turn: Optional[int] = None
    ) -> int:
        return await self.copier(
            _bearer(), {"from": uid, "to": to_uid, "up_to_turn": up_to_turn}
        )

    async def lineage(self, uid: str) -> Dict[str, Any]:
        described = await self.get(uid)
        return (
            dict(described["lineage"])
            if described
            else {"forked_from": None, "imported_from": None}
        )


#: The two stores agent-runtimes contributes.
RECORD_STORE = RecordSessionStore()
FILE_STORE = FileSessionStore()


def use_record_reader(reader: Optional[Reader]) -> None:
    """Who reads a session's record back for the record store, which a
    reader given makes the active store; ``None`` puts ai-agents and the
    configured store back (a test).
    """
    RECORD_STORE.reader = reader or _read_record
    use_session_store(RECORD_STORE if reader else None)


def configured_store_name() -> str:
    """The store the configuration names: ``AGENT_RUNTIMES_SESSION_STORE``,
    else ``record`` when ``DATALAYER_AI_AGENTS_URL`` or ``DATALAYER_API_KEY``
    is set, else ``file``.

    Raises
    ------
    SessionStoreRefused
        When two are named.
    """
    named = (os.environ.get(STORE_VARIABLE) or "").strip()
    if named:
        names = [
            part.strip() for part in named.replace(";", ",").split(",") if part.strip()
        ]
        if len(names) > 1:
            raise SessionStoreRefused(
                f"{STORE_VARIABLE} names {len(names)} stores ({', '.join(names)}): one session store is active, "
                "the record's or a file's — name one."
            )
        return names[0]
    # The platform's record when the environment names the platform (decision
    # 17): an ai-agents URL, or the key `datalayer login` left — the
    # defaults of `DatalayerURLs` name the platform for everybody, and are
    # not a configuration.
    on_platform = any(
        (os.environ.get(variable) or "").strip()
        for variable in ("DATALAYER_AI_AGENTS_URL", "DATALAYER_API_KEY")
    )
    return "record" if on_platform else "file"


_ACTIVE: Dict[str, Any] = {}


def active_store(platform: Any = None) -> Any:
    """The active session store, read from the ``session.store`` point once.

    Raises
    ------
    SessionStoreRefused
        When the configuration names two, or one nothing contributes.
    """
    if "store" in _ACTIVE:
        return _ACTIVE["store"]
    from agent_runtimes.plugins.host import accepted, session_platform

    name = configured_store_name()
    platform = session_platform(platform)
    stores = {c.id: c.value for c in accepted(platform, SESSION_STORES)}
    if name not in stores:
        raise SessionStoreRefused(
            f"The session store {name!r} is not contributed: one of {', '.join(sorted(stores)) or 'none'} "
            f"({STORE_VARIABLE} names it)."
        )
    _ACTIVE["store"] = stores[name]
    return stores[name]


def use_session_store(store: Any) -> None:
    """Install the active store — for the tests; ``None`` reads the configuration again."""
    if store is None:
        _ACTIVE.pop("store", None)
    else:
        _ACTIVE["store"] = store


async def send_through_store(body: Dict[str, Any]) -> None:
    """The recorder's send: through the active store — ai-agents for the
    record store, the file for the file store.
    """
    store = active_store()
    entries = list(body.get("entries") or [])
    facts = {k: v for k, v in body.items() if k != "entries"}
    await store.append(str(body.get("session_uid") or ""), entries, **facts)


__all__ = [
    "DEFAULT_SESSIONS_PATH",
    "ENTRIES_FILE",
    "FILE_STORE",
    "RECORD_READ_LIMIT",
    "NOT_CLONED",
    "PAGE_LIMIT",
    "RECORD_STORE",
    "STORE_VARIABLE",
    "FileSessionStore",
    "RecordSessionStore",
    "SessionStoreError",
    "SessionStoreRefused",
    "active_store",
    "cloned_entries",
    "configured_store_name",
    "send_through_store",
    "use_record_reader",
    "use_session_store",
]
