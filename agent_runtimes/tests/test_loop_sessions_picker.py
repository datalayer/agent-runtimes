# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""`loop sessions`: the picker's model, the two places a session lives, the
files of this machine, a session transferred both ways under one uid, and a
new session's uid.
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

import pytest

from agent_runtimes.apps.session_store import INDEX_FILE, FileSessionStore
from agent_runtimes.loop import picker, transfer
from agent_runtimes.loop.paused import MANAGED, STATES, Paused, paused_sessions
from agent_runtimes.loop.picker import Picker, listing_json, listing_lines, why_not
from agent_runtimes.loop.transfer import (
    OnDatalayer,
    ThisMachine,
    TransferRefused,
    places,
)
from agent_runtimes.utils.ulid import is_ulid, new_ulid

NOW = datetime(2026, 11, 11, 12, 0, tzinfo=timezone.utc)


def _kept(
    store: FileSessionStore,
    uid: str,
    state: str = "paused",
    agent: str = "example-simple",
) -> None:
    entries: List[Dict[str, Any]] = [
        {
            "kind": "session",
            "summary": "A session started",
            "payload": {
                "app": agent,
                "state": "open",
                "agent": agent,
                "title": f"Title of {uid}",
                "runs_on": {"kind": "runtime", "uid": "local"},
            },
        },
        {
            "kind": "turn",
            "summary": "My name is Ada.",
            "payload": {
                "asked": "My name is Ada.",
                "answered": "Hello Ada.",
                "api_key": "sk-secret",
            },
        },
    ]
    if state != "open":
        entries.append({"kind": state, "summary": state, "payload": {"state": state}})
    asyncio.run(store.append(uid, entries, app_uid=f"agent:{agent}", opened_by=""))


class Record:
    """The account's record on Datalayer, standing in for ai-agents."""

    def __init__(self) -> None:
        self.entries: Dict[str, List[Dict[str, Any]]] = {}
        self.writes: List[Dict[str, Any]] = []

    async def read(self, uid: str, token: str) -> List[Dict[str, Any]]:
        assert token == "the-token"
        return [dict(entry) for entry in self.entries.get(uid, [])]

    async def write(self, token: str, body: Dict[str, Any]) -> None:
        assert token == "the-token"
        self.writes.append(body)
        for entry in body["entries"]:
            self.entries.setdefault(body["session_uid"], []).append(
                {
                    **entry,
                    "app_uid": body["app_uid"],
                    "session_uid": body["session_uid"],
                    "version": body["version"],
                    "opened_by": "ada",
                    "created_at": "2026-11-11T10:00:00Z",
                }
            )


@pytest.fixture()
def files(tmp_path: Path) -> FileSessionStore:
    return FileSessionStore(root=tmp_path / "sessions")


def _move(
    uid: str, to: str, files: FileSessionStore, record: Record, **more: Any
) -> Any:
    source, destination = places(
        to, "the-token", store=files, reader=record.read, writer=record.write
    )
    return asyncio.run(
        transfer.transfer(
            uid,
            source=source,
            destination=destination,
            by="ada",
            catalogue_agent=lambda agent: agent == "example-simple",
            **more,
        )
    )


# --- the files of this machine ------------------------------------------------------


def test_a_local_session_is_a_folder_named_by_its_uid_with_an_index(
    files: FileSessionStore,
) -> None:
    uid = new_ulid()
    _kept(files, uid)
    assert (files.root / uid / "entries.jsonl").is_file()
    [described] = files.described()
    assert (described["uid"], described["state"], described["turns"]) == (
        uid,
        "paused",
        1,
    )
    # The index says what a listing says, and is what the next listing reads.
    index = json.loads((files.root / INDEX_FILE).read_text())
    assert index["sessions"][uid]["session"]["uid"] == uid
    index["sessions"][uid]["session"]["title"] = "From the index"
    (files.root / INDEX_FILE).write_text(json.dumps(index))
    assert files.described()[0]["title"] == "From the index"
    # A session whose file changed is read again, and the index written.
    asyncio.run(
        files.append(
            uid, [{"kind": "ended", "summary": "", "payload": {"state": "ended"}}]
        )
    )
    assert files.described()[0]["state"] == "ended"
    assert files.described()[0]["title"] == f"Title of {uid}"
    # Deleted for good: its folder, and its line of the index at the next listing.
    assert files.delete(uid) is True and files.delete(uid) is False
    assert files.described() == []
    assert json.loads((files.root / INDEX_FILE).read_text())["sessions"] == {}
    # Never anything outside the store.
    assert files.delete("../elsewhere") is False


def test_the_default_place_is_the_home_folder_and_a_variable_names_another(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    from agent_runtimes.apps import session_store

    assert (
        session_store.DEFAULT_SESSIONS_PATH == Path.home() / ".datalayer" / "sessions"
    )
    monkeypatch.setenv(session_store.SESSIONS_PATH_VARIABLE, str(tmp_path / "other"))
    assert FileSessionStore().root == tmp_path / "other"
    monkeypatch.delenv(session_store.SESSIONS_PATH_VARIABLE)
    assert FileSessionStore().root == session_store.DEFAULT_SESSIONS_PATH


def test_a_runtime_on_this_machine_keeps_its_sessions_in_files() -> None:
    from agent_runtimes.chat import cli

    source = Path(cli.__file__).read_text()
    assert '_os.environ.setdefault(STORE_VARIABLE, "file")' in source


# --- the picker ------------------------------------------------------------------


def _rows(files: FileSessionStore) -> List[Paused]:
    _kept(files, "local-paused", "paused")
    _kept(files, "local-ended", "ended")
    _kept(files, "local-open", "open", agent="worker-marketer")

    def cloud(token: str) -> Dict[str, Any]:
        return {
            "deployments": [
                {
                    "uid": "dep-1",
                    "app_uid": "app-1",
                    "app_name": "Exchange Desk",
                    "slug": "desk",
                    "target": "hosted",
                }
            ],
            "sessions": [
                {
                    "uid": "cloud-agent",
                    "app_uid": "agent:worker-marketer",
                    "state": "paused",
                    "agent": "default",
                    "title": "The autumn campaign",
                    "turns": 4,
                    "started_at": "2026-11-11T09:00:00+00:00",
                },
                {
                    "uid": "cloud-deployed",
                    "app_uid": "app-1",
                    "deployment_uid": "dep-1",
                    "state": "open",
                    "agent": "desk",
                    "title": "Hi",
                    "started_at": "2026-11-10T09:00:00+00:00",
                },
            ],
        }

    return paused_sessions(
        token="the-token",
        store=files,
        asker=cloud,
        say=lambda line: None,
        names={},
        states=STATES,
    )


def test_two_groups_every_state_and_a_filter(files: FileSessionStore) -> None:
    rows = _rows(files)
    model = Picker(rows, now=NOW)
    groups = dict(model.groups())
    assert {row.uid for row in groups["local"]} == {
        "local-paused",
        "local-ended",
        "local-open",
    }
    assert [row.uid for row in groups["cloud"]] == ["cloud-agent", "cloud-deployed"]
    drawn = [line for _, line in model.lines()]
    # How the two are managed, said first; then each place with its count.
    assert drawn[:2] == list(MANAGED)
    assert "On this machine (3)" in drawn and "On Datalayer (2)" in drawn
    assert drawn.index("On this machine (3)") < drawn.index("On Datalayer (2)")
    assert picker.LEGEND in drawn
    for word in (
        "Enter: resume",
        "Ctrl-P: pause",
        "Ctrl-E: end",
        "Ctrl-T: transfer",
        "Ctrl-X: export",
        "Ctrl-D: delete",
        "Ctrl-N: start over (a new session of the same agent",
    ):
        assert word in picker.LEGEND
    # A row says its uid, state, kind, name, turns, when and title.
    line = picker.row_line(groups["cloud"][0], NOW)
    assert (
        line
        == "cloud-agent  paused  agent  default  4 turns  3 hours ago  — The autumn campaign"
    )
    # Typing filters; a number chooses a row; arrows move.
    model.type("autumn")
    assert [row.uid for row in model.visible()] == ["cloud-agent"]
    model.erase()
    for _ in "autum":
        model.erase()
    assert len(model.visible()) == 5
    model.type("4")
    assert model.highlighted() is model.visible()[3]
    model.erase()
    model.move(1)
    assert model.highlighted() is model.visible()[1]
    model.move(-2)
    assert model.highlighted() is model.visible()[-1]


def test_an_action_applies_or_says_why_not(files: FileSessionStore) -> None:
    by_uid = {row.uid: row for row in _rows(files)}
    paused_here, ended, open_here = (
        by_uid["local-paused"],
        by_uid["local-ended"],
        by_uid["local-open"],
    )
    cloud, deployed = by_uid["cloud-agent"], by_uid["cloud-deployed"]
    for action in ("resume", "end", "transfer", "export", "delete", "start_over"):
        assert why_not(action, paused_here) == ""
    assert "ended: start over" in why_not("resume", ended)
    assert "nothing to pause" in why_not("pause", paused_here)
    assert "pause it there, with /pause" in why_not("pause", open_here)
    assert "not signed in" in why_not("transfer", paused_here, signed_in=False)
    assert "a paused session is transferred" in why_not("transfer", open_here)
    assert "belongs to its deployment" in why_not(
        "transfer",
        by_uid["cloud-deployed"].__class__(**{**deployed.__dict__, "state": "paused"}),
    )
    # A session on Datalayer is deleted signed in; one of a deployment starts over at its address.
    assert why_not("delete", cloud) == ""
    assert "deleted signed in" in why_not("delete", cloud, signed_in=False)
    assert "opened at its address" in why_not("start_over", deployed)
    assert why_not("transfer", cloud) == "" and why_not("start_over", cloud) == ""
    # The model says why, and answers nothing to do.
    model = Picker([ended])
    assert model.act("resume") is None and "ended" in model.said
    assert Picker([paused_here]).act("resume") == ("resume", paused_here)


def test_without_a_terminal_the_two_groups_are_printed(files: FileSessionStore) -> None:
    rows = _rows(files)
    lines = listing_lines(rows, signed_in=True, now=NOW)
    assert lines[0] == "On this machine (3)" and "On Datalayer (2)" in lines
    said = listing_json(rows, signed_in=True)
    assert [row["uid"] for row in said["cloud"]] == ["cloud-agent", "cloud-deployed"]
    assert {
        "uid",
        "state",
        "kind",
        "name",
        "title",
        "turns",
        "started_at",
        "where",
        "resumable",
    } <= set(said["local"][0])
    # Signed out: this machine's only, and it says so.
    local = [row for row in rows if row.where == "local"]
    assert listing_json(local, signed_in=False)["cloud"] is None
    assert picker.NOT_SIGNED_IN in listing_lines(local, signed_in=False)
    assert picker.NOT_SIGNED_IN in Picker(local, signed_in=False).header()


def test_the_picker_in_a_terminal_answers_the_key_pressed(
    files: FileSessionStore,
) -> None:
    from prompt_toolkit.input import create_pipe_input
    from prompt_toolkit.output import DummyOutput

    rows = [row for row in _rows(files) if row.uid in ("local-paused", "cloud-agent")]
    # As drawn: this machine's first.
    rows = Picker(rows).visible()
    assert [row.uid for row in rows] == ["local-paused", "cloud-agent"]
    with create_pipe_input() as keys:
        # Down to the second row, then Enter: it is resumed.
        keys.send_text("\x1b[B\r")
        assert picker.pick(Picker(rows), input=keys, output=DummyOutput()) == (
            "resume",
            rows[1],
        )
    with create_pipe_input() as keys:
        # Its number, then Ctrl-T: the first is transferred.
        keys.send_text("1\x14")
        assert picker.pick(Picker(rows), input=keys, output=DummyOutput()) == (
            "transfer",
            rows[0],
        )
    with create_pipe_input() as keys:
        keys.send_text("\x03")
        assert picker.pick(Picker(rows), input=keys, output=DummyOutput()) is None


def test_what_resumes_and_what_starts_over() -> None:
    from agent_runtimes.commands.sessions import resume_command, start_over_command

    agent = Paused(
        "01M7AGENT",
        "agent",
        "default",
        "T",
        "cloud",
        "record",
        "",
        app_uid="agent:worker-marketer",
    )
    assert resume_command(agent) == ["--resume", "01M7AGENT"]
    assert start_over_command(
        Paused("u", "agent", "example-simple", "T", "local", "file", "")
    ) == ["-a", "example-simple", "--local"]
    assert start_over_command(
        Paused(
            "u", "application", "decide", "T", "cloud", "record", "", app_uid="decide"
        )
    ) == ["apps", "run", "decide", "--cloud"]


def test_resume_alone_opens_the_picker_and_a_uid_names_a_session() -> None:
    from agent_runtimes.main import resume_alone

    assert resume_alone(["--resume"]) == ["--resume", ""]
    assert resume_alone(["--resume", "--cloud"]) == ["--resume", "", "--cloud"]
    assert resume_alone(["--resume", "01M7ABC"]) == ["--resume", "01M7ABC"]
    assert resume_alone(["-c"]) == ["-c"]


# --- a session transferred, both ways, under one uid --------------------------------


def test_a_uid_stays_the_same_from_this_machine_to_datalayer_and_back(
    files: FileSessionStore,
) -> None:
    record = Record()
    uid = new_ulid()
    _kept(files, uid)
    asked: List[str] = []

    def yes(question: str) -> bool:
        asked.append(question)
        return True

    done = _move(uid, "cloud", files, record, confirm=yes)
    assert (done.uid, done.to, done.turns, done.returned) == (uid, "cloud", 1, False)
    # Asked once, naming what is sent.
    assert len(asked) == 1 and f"Transfer session {uid} to Datalayer?" in asked[0]
    assert "its conversation and its record (1 turn" in asked[0]
    # On Datalayer under the same uid, paused, its conversation there, credentials redacted.
    there = asyncio.run(
        OnDatalayer("the-token", record.read, record.write).entries(uid)
    )
    assert [entry["kind"] for entry in there] == ["session", "turn", "paused", "paused"]
    assert there[1]["payload"]["asked"] == "My name is Ada."
    assert "sk-secret" not in json.dumps(there) and done.redactions == 1
    assert there[-1]["payload"]["transferred_from"] == "local"
    assert record.writes[0]["app_uid"] == "agent:example-simple"
    # Ended here, saying where it went: not resumed twice.
    here = asyncio.run(ThisMachine(files).entries(uid))
    assert here[-1]["kind"] == "ended"
    assert here[-1]["payload"] == {"state": "ended", "transferred_to": "cloud"}
    with pytest.raises(TransferRefused, match="was transferred to Datalayer already"):
        _move(uid, "cloud", files, record)

    # It goes on there: a turn, then paused again.
    asyncio.run(
        record.write(
            "the-token",
            {
                "app_uid": "agent:example-simple",
                "session_uid": uid,
                "version": 0,
                "entries": [
                    {
                        "kind": "session",
                        "summary": "resumed",
                        "payload": {"state": "open", "resumed": True},
                    },
                    {
                        "kind": "turn",
                        "summary": "And I sell tea.",
                        "payload": {"asked": "And I sell tea.", "answered": "Noted."},
                    },
                    {
                        "kind": "paused",
                        "summary": "paused",
                        "payload": {"state": "paused"},
                    },
                ],
            },
        )
    )
    back = _move(uid, "local", files, record)
    assert (back.uid, back.to, back.returned) == (uid, "local", True)
    # The same folder, the same uid: what was new is carried, and it is paused here again.
    [described] = [session for session in files.described() if session["uid"] == uid]
    assert (described["state"], described["turns"]) == ("paused", 2)
    kinds = [entry["kind"] for entry in asyncio.run(ThisMachine(files).entries(uid))]
    assert kinds.count("turn") == 2 and kinds[-1] == "paused"
    # And ended on Datalayer, saying it came back.
    assert record.entries[uid][-1]["payload"] == {
        "state": "ended",
        "transferred_to": "local",
    }
    # Once more to Datalayer: still the same uid, only the new entries sent.
    again = _move(uid, "cloud", files, record)
    assert again.uid == uid and again.returned is True and again.entries == 0


def test_a_transfer_is_refused_in_a_sentence(files: FileSessionStore) -> None:
    record = Record()
    with pytest.raises(TransferRefused, match="You are not signed in"):
        places("cloud", "")
    with pytest.raises(TransferRefused, match="to `cloud` or to `local`"):
        places("elsewhere", "the-token")
    with pytest.raises(TransferRefused, match="There is no session nowhere"):
        _move("nowhere", "cloud", files, record)
    _kept(files, "is-open-0001", "open")
    with pytest.raises(TransferRefused, match="is open: pause it first"):
        _move("is-open-0001", "cloud", files, record)
    _kept(files, "is-ended-001", "ended")
    with pytest.raises(TransferRefused, match="an ended session is not transferred"):
        _move("is-ended-001", "cloud", files, record)
    # An agent a runtime on Datalayer cannot start.
    _kept(files, "own-agent-01", "paused", agent="my-own-agent")
    with pytest.raises(TransferRefused, match="not an agentspec of the catalogue"):
        _move("own-agent-01", "cloud", files, record)
    # A uid the other place keeps as another session.
    _kept(files, "taken-000001", "paused")
    record.entries["taken-000001"] = [
        {
            "kind": "session",
            "payload": {"state": "open"},
            "app_uid": "agent:example-simple",
        }
    ]
    with pytest.raises(
        TransferRefused,
        match="keeps a session taken-000001 already, and it is not this one",
    ):
        _move("taken-000001", "cloud", files, record)
    # A deployment's session belongs to its deployment.
    record.entries["deployed-0001"] = [
        {
            "kind": "session",
            "payload": {"state": "open", "agent": "desk"},
            "app_uid": "app-1",
            "deployment_uid": "dep-1",
        },
        {"kind": "paused", "payload": {"state": "paused"}},
    ]
    with pytest.raises(TransferRefused, match="belongs to its deployment"):
        _move("deployed-0001", "local", files, record)
    # Declined when asked: nothing is written.
    _kept(files, "declined-001", "paused")
    with pytest.raises(TransferRefused, match="nothing was sent"):
        _move("declined-001", "cloud", files, record, confirm=lambda question: False)
    assert "declined-001" not in record.entries
    assert (
        asyncio.run(ThisMachine(files).entries("declined-001"))[-1]["kind"] == "paused"
    )


def test_loop_sessions_transfer_asks_unless_yes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from agent_runtimes.commands import sessions as command
    from agent_runtimes.loop import launch

    monkeypatch.setattr(launch, "interactive", lambda: False)
    with pytest.raises(
        command.SessionsRefused, match="say `--yes` where nobody can be asked"
    ):
        command.transfer_session("u", "cloud", "the-token", yes=False)


# --- a new session's uid ---------------------------------------------------------------


def test_a_new_sessions_uid_is_a_ulid_wherever_it_is_minted() -> None:
    from agent_runtimes.apps.sessions import SESSION_UID, new_session_uid
    from agent_runtimes.transports.clients.ag_ui_client import AGUIConversation

    first, second = new_session_uid(), new_session_uid()
    assert is_ulid(first) and len(first) == 26 and first != second
    # Time-ordered: one minted later sorts after.
    assert sorted([new_ulid() for _ in range(3)])[0][:8] <= new_ulid()[:8]
    # The prompt's thread is its session.
    conversation = AGUIConversation()
    assert is_ulid(conversation.thread_id)
    conversation.clear()
    assert is_ulid(conversation.thread_id)
    # The shapes minted before are still session uids, and so is a ULID.
    for uid in (
        first,
        "f857341d" * 4,
        "79787ffc-4685-4915-b511-23b9b9c3525d",
        "whatsapp-0a1b2c3d",
    ):
        assert SESSION_UID.match(uid)
    assert not is_ulid("f857341d" * 4)
    source = Path(__file__).parents[1].joinpath("apps", "sessions.py").read_text()
    # A session opened, a clone and an import each mint one.
    assert source.count("new_session_uid()") >= 4


# --- delete, on this machine and on Datalayer ----------------------------------------


def test_a_session_is_deleted_where_it_is_kept(
    files: FileSessionStore, monkeypatch: pytest.MonkeyPatch
) -> None:
    import httpx

    from agent_runtimes.apps import session_store
    from agent_runtimes.commands import sessions as command
    from agent_runtimes.loop.paused import ON_DATALAYER, ON_THIS_MACHINE

    monkeypatch.setenv(session_store.SESSIONS_PATH_VARIABLE, str(files.root))
    monkeypatch.setenv("DATALAYER_AI_AGENTS_URL", "http://ai-agents.test")
    _kept(files, "here-1")
    asked: List[Any] = []

    def ai_agents(request: httpx.Request) -> httpx.Response:
        asked.append(
            (request.method, request.url.path, request.headers["authorization"])
        )
        uid = request.url.path.rsplit("/", 1)[-1]
        if uid == "cloud-open":
            return httpx.Response(
                409,
                json={
                    "detail": f"Session {uid} is open: a runtime holds it. Pause it or end it first, then delete it."
                },
            )
        if uid == "somebody-elses":
            return httpx.Response(404, json={"detail": f"You had no session {uid}."})
        return httpx.Response(
            200,
            json={
                "success": True,
                "uid": uid,
                "deleted": {"conversations": 1, "entries": 3},
            },
        )

    session_store.use_record_transport(httpx.MockTransport(ai_agents))
    try:
        # This machine's: its folder, wherever the place is not named.
        assert "from this machine" in command.delete_session("here-1", "the-token")
        assert not (files.root / "here-1").exists() and asked == []
        with pytest.raises(
            command.SessionsRefused, match="no session here-1 on this machine"
        ):
            command.delete_session("here-1", "the-token", ON_THIS_MACHINE)
        # Signed out, nothing on Datalayer is asked.
        with pytest.raises(command.SessionsRefused, match="datalayer login"):
            command.delete_session("cloud-1", "")
        # On Datalayer: the record's route, as the person.
        said = command.delete_session("cloud-1", "the-token", ON_DATALAYER)
        assert said == "Deleted cloud-1 from your Datalayer account's record."
        assert asked == [
            ("DELETE", "/api/ai-agents/v1/apps/sessions/cloud-1", "Bearer the-token")
        ]
        # Its refusals, in ai-agents' sentence.
        with pytest.raises(command.SessionsRefused, match="Pause it or end it first"):
            command.delete_session("cloud-open", "the-token")
        with pytest.raises(
            command.SessionsRefused, match="You had no session somebody-elses"
        ):
            command.delete_session("somebody-elses", "the-token")
        # The record store says it too, for a runtime's route.
        removed = asyncio.run(
            session_store.RecordSessionStore(
                remover=lambda uid, bearer: _answer(uid)
            ).remove("x")
        )
        assert removed is True
        assert asyncio.run(files.remove("nothing-here")) is False
    finally:
        session_store.use_record_transport(None)


async def _answer(uid: str) -> Dict[str, Any]:
    return {"uid": uid}


# --- delete with no uid: every session, asked of in turn ---------------------------


def test_delete_without_a_uid_goes_through_every_session_and_asks_each() -> None:
    from agent_runtimes.commands import sessions as command
    from agent_runtimes.loop.paused import ON_DATALAYER, ON_THIS_MACHINE

    rows = [
        Paused("01-a", "agent", "example-simple", "A", ON_THIS_MACHINE, "file", ""),
        Paused("01-b", "agent", "example-simple", "B", ON_DATALAYER, "record", ""),
        Paused("01-c", "agent", "example-simple", "C", ON_DATALAYER, "record", ""),
        Paused("01-d", "agent", "example-simple", "D", ON_THIS_MACHINE, "file", ""),
    ]
    answers = {
        "01-a": command.DELETE_YES,
        "01-b": command.DELETE_KEEP,
        "01-c": command.DELETE_YES,
        "01-d": command.DELETE_YES,
    }
    asked: List[str] = []
    deleted: List[Any] = []
    said: List[str] = []

    def ask(row: Paused) -> str:
        asked.append(row.uid)
        return answers[row.uid]

    def delete(uid: str, token: str, where: str) -> str:
        if uid == "01-c":
            raise command.SessionsRefused(
                f"Session {uid} is open: pause it or end it first."
            )
        deleted.append((uid, token, where))
        return f"Deleted {uid}."

    counts = command.delete_across(rows, "the-token", ask, said.append, delete)
    # Every session is asked of; each is deleted where it is kept.
    assert asked == ["01-a", "01-b", "01-c", "01-d"]
    assert deleted == [
        ("01-a", "the-token", ON_THIS_MACHINE),
        ("01-d", "the-token", ON_THIS_MACHINE),
    ]
    # A refused delete is said, and the walk goes on.
    assert any(line.startswith("Not deleted: Session 01-c is open") for line in said)
    assert counts == (2, 2)


def test_stop_ends_the_walk_and_deletes_nothing_more() -> None:
    from agent_runtimes.commands import sessions as command
    from agent_runtimes.loop.paused import ON_THIS_MACHINE

    rows = [
        Paused(f"01-{n}", "agent", "example-simple", "T", ON_THIS_MACHINE, "file", "")
        for n in range(3)
    ]
    replies = iter([command.DELETE_YES, command.DELETE_STOP, command.DELETE_YES])
    deleted: List[str] = []

    def delete(uid: str, token: str, where: str) -> str:
        deleted.append(uid)
        return "ok"

    counts = command.delete_across(
        rows,
        "",
        lambda row: next(replies),
        lambda line: None,
        delete,
    )
    assert deleted == ["01-0"] and counts == (1, 0)


def test_yes_without_a_uid_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    from typer.testing import CliRunner

    from agent_runtimes.commands import sessions as command

    walked: List[bool] = []
    monkeypatch.setattr(command, "_delete_each", lambda: walked.append(True))
    result = CliRunner().invoke(command.app, ["delete", "--yes"])
    assert result.exit_code != 0 and walked == []
    assert "never all" in result.output
