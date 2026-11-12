# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The paused sessions `loop` lists, and how each is resumed.

The rows from a store of files on this machine and a stubbed answer of the
platform's record; each resumed where the session lives; nothing drawn when
nobody is at the terminal; the platform's list failing said in a line and
not fatal. The screen itself: test_loop_start_screen.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

import pytest

from agent_runtimes.apps.session_store import FileSessionStore
from agent_runtimes.loop import paused
from agent_runtimes.loop.paused import (
    Paused,
    paused_line,
    paused_sessions,
    resume_plan,
)

NOW = datetime(2026, 11, 11, 12, 0, tzinfo=timezone.utc)


def _kept(store: FileSessionStore, uid: str, app_uid: str, state: str) -> None:
    """A session in the files, as a runtime's recorder writes it."""
    entries: List[Dict[str, Any]] = [
        {
            "kind": "session",
            "summary": "A session started",
            "payload": {
                "app": "example-simple",
                "state": "open",
                "agent": "example-simple",
                "title": f"Title of {uid}",
                "runs_on": {"kind": "runtime", "uid": "local"},
            },
        },
        {
            "kind": "turn",
            "summary": "One",
            "payload": {"asked": "One", "answered": "1"},
        },
    ]
    if state != "open":
        entries.append({"kind": state, "summary": state, "payload": {"state": state}})
    asyncio.run(store.append(uid, entries, app_uid=app_uid, opened_by=""))


NAMES = {"decide": "Decide"}


def _cloud(token: str) -> Dict[str, Any]:
    assert token == "the-token"
    return {
        "deployments": [
            {
                "uid": "dep-1",
                "app_uid": "app-1",
                "app_name": "Exchange Desk",
                "slug": "exchange-desk",
                "target": "hosted",
            }
        ],
        "sessions": _cloud_sessions(),
    }


def _cloud_sessions() -> List[Dict[str, Any]]:
    return [
        {
            "uid": "cloud-agent-1",
            "app_uid": "agent:worker-marketer",
            "state": "paused",
            "agent": "worker-marketer",
            "title": "The autumn campaign",
            "runs_on": {"kind": "runtime", "uid": "01m6gfaf"},
            "started_at": "2026-11-11T11:00:00+00:00",
            "turns": 4,
        },
        {
            "uid": "cloud-app-1",
            "app_uid": "app-1",
            "deployment_uid": "dep-1",
            "state": "paused",
            "agent": "cog-crawler",
            "title": "Hi",
            "runs_on": {"kind": "runtime", "uid": "01m6gfag"},
            "started_at": "2026-11-11T09:00:00+00:00",
        },
        {
            "uid": "others-app-1",
            "app_uid": "app-9",
            "deployment_uid": "dep-of-somebody-else",
            "state": "paused",
            "agent": "cog-crawler",
            "title": "Shared with me",
            "started_at": "2026-11-11T06:00:00+00:00",
        },
        {
            "uid": "preview-1",
            "app_uid": "decide",
            "state": "paused",
            "agent": "decide",
            "title": "Reply with one word.",
            "started_at": "2026-11-11T08:00:00+00:00",
        },
        {
            "uid": "seat-1",
            "app_uid": "team-coding-agents",
            "state": "paused",
            "agent": "coder",
            "title": "Fix it",
            "runs_on": {"kind": "team_run", "execution_id": "exec_400b", "seat": "c"},
            "started_at": "2026-11-11T07:00:00+00:00",
        },
        {
            "uid": "own-machine-1",
            "app_uid": "agent:example-simple",
            "state": "paused",
            "agent": "example-simple",
            "title": "Kept on Datalayer, ran here",
            "runs_on": {"kind": "runtime", "uid": "local"},
            "started_at": "2026-11-11T10:00:00+00:00",
        },
        {"uid": "open-1", "app_uid": "agent:x", "state": "open", "agent": "x"},
    ]


@pytest.fixture()
def files(tmp_path: Path) -> FileSessionStore:
    store = FileSessionStore(root=tmp_path / "sessions")
    _kept(store, "local-paused-1", "agent:example-simple", "paused")
    _kept(store, "local-open-1", "agent:example-simple", "open")
    _kept(store, "local-ended-1", "agent:example-simple", "ended")
    return store


def test_the_rows_from_this_machine_and_from_datalayer(files: FileSessionStore) -> None:
    said: List[str] = []
    rows = paused_sessions(
        token="the-token", store=files, asker=_cloud, say=said.append, names=NAMES
    )
    assert said == []
    by_uid = {row.uid: row for row in rows}
    # Paused ones only: an open and an ended one are not offered.
    assert set(by_uid) == {
        "local-paused-1",
        "cloud-agent-1",
        "cloud-app-1",
        "own-machine-1",
        "preview-1",
        "seat-1",
        "others-app-1",
    }
    assert by_uid["local-paused-1"] == Paused(
        uid="local-paused-1",
        kind="agent",
        agent="example-simple",
        title="Title of local-paused-1",
        where="local",
        store="file",
        started_at=by_uid["local-paused-1"].started_at,
        turns=1,
        app_uid="agent:example-simple",
    )
    assert (by_uid["cloud-agent-1"].where, by_uid["cloud-agent-1"].store) == (
        "cloud",
        "record",
    )
    # Kept in the account's record, whatever ran it last: it lives on Datalayer.
    assert (by_uid["own-machine-1"].where, by_uid["own-machine-1"].store) == (
        "cloud",
        "record",
    )
    assert by_uid["cloud-agent-1"].resumable
    # A Preview of an application — a catalogue's, with no deployment — is
    # resumed from the terminal, named as its application.
    preview = by_uid["preview-1"]
    assert (preview.kind, preview.resumable, preview.app_name, preview.where) == (
        "application",
        True,
        "Decide",
        "cloud",
    )
    # A session of one of the person's own deployments is resumed from the
    # terminal too, on Datalayer, where it lives; its address is kept.
    deployed = by_uid["cloud-app-1"]
    assert (deployed.kind, deployed.resumable, deployed.app_name, deployed.where) == (
        "application",
        True,
        "Exchange Desk",
        "cloud",
    )
    assert deployed.deployment_uid == "dep-1"
    assert (
        deployed.address == "https://datalayer.ai/apps/exchange-desk?thread=cloud-app-1"
    )
    # Somebody else's deployment is not: it says why.
    others = by_uid["others-app-1"]
    assert (others.resumable, others.why_not) == (False, paused.DEPLOYMENT_WHY_NOT)
    # A seat of a team run is resumed with its run, which `loop` lets go on.
    seat = by_uid["seat-1"]
    assert (seat.resumable, seat.why_not, seat.team_run, seat.address) == (
        True,
        "",
        "exec_400b",
        "https://datalayer.ai/executions/exec_400b",
    )
    # Newest first.
    started = [row.started_at for row in rows]
    assert started == sorted(started, reverse=True)


def test_a_line_says_kind_agent_title_where_and_when() -> None:
    row = Paused(
        uid="u",
        kind="agent",
        agent="worker-marketer",
        title="The autumn campaign",
        where="cloud",
        store="record",
        started_at="2026-11-11T09:00:00+00:00",
    )
    assert paused_line(row, NOW) == (
        "Agent session · worker-marketer · “The autumn campaign” · u · started 3 hours ago"
    )
    here = Paused(
        "u",
        "application",
        "cog-crawler",
        "",
        "local",
        "file",
        "",
        app_uid="app-1",
        app_name="Exchange Desk",
    )
    # An application's session is named by its application, not its agent.
    assert paused_line(here, NOW) == (
        "Application session · Exchange Desk · “(no title)” · u"
    )


def test_not_signed_in_lists_this_machines_only(files: FileSessionStore) -> None:
    def never(token: str) -> Dict[str, Any]:
        raise AssertionError("Nobody signed in: Datalayer is not asked.")

    rows = paused_sessions(token="", store=files, asker=never, say=lambda line: None)
    assert [row.uid for row in rows] == ["local-paused-1"]


def test_datalayer_failing_is_said_in_a_line_and_not_fatal(
    files: FileSessionStore,
) -> None:
    def offline(token: str) -> Dict[str, Any]:
        raise OSError("Name or service not known")

    said: List[str] = []
    rows = paused_sessions(
        token="the-token", store=files, asker=offline, say=said.append
    )
    assert [row.uid for row in rows] == ["local-paused-1"]
    assert said == [
        "Your sessions on Datalayer could not be listed (Name or service not known): going on without them."
    ]


def test_each_session_is_resumed_where_it_lives(files: FileSessionStore) -> None:
    rows = paused_sessions(
        token="the-token", store=files, asker=_cloud, say=lambda _: None, names=NAMES
    )
    by_uid = {row.uid: row for row in rows}

    # A seat of a team run: its run is what is resumed.
    plan = resume_plan(by_uid["seat-1"])
    assert (plan.team_run, plan.application, plan.uid) == ("exec_400b", "", "seat-1")

    # A deployment's session is resumed on a runtime launched for it.
    plan = resume_plan(by_uid["cloud-app-1"])
    assert (plan.application, plan.deployment, plan.cloud) == ("app-1", "dep-1", True)

    # An application's Preview is resumed by starting its application.
    plan = resume_plan(by_uid["preview-1"])
    assert (plan.uid, plan.application, plan.cloud) == ("preview-1", "decide", True)
    assert plan.deployment == ""

    # A cloud one is resumed on Datalayer, a local one on this machine,
    # each with its agent, nobody asked where.
    plan = resume_plan(by_uid["cloud-agent-1"])
    assert (plan.uid, plan.agent, plan.cloud, plan.session_store) == (
        "cloud-agent-1",
        "worker-marketer",
        True,
        "",
    )
    assert plan.application == ""
    plan = resume_plan(by_uid["local-paused-1"])
    # Kept in files: its server reads the files, signed in or not.
    assert (plan.agent, plan.cloud, plan.session_store) == (
        "example-simple",
        False,
        "file",
    )
    kept_on_datalayer = resume_plan(by_uid["own-machine-1"])
    assert (kept_on_datalayer.cloud, kept_on_datalayer.session_store) == (True, "")


def test_a_run_nobody_is_at_asks_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    from agent_runtimes.chat import cli
    from agent_runtimes.commands import sessions
    from agent_runtimes.loop import launch

    monkeypatch.setattr(launch, "interactive", lambda: False)
    monkeypatch.setattr(
        sessions,
        "run_picker",
        lambda **kwargs: (_ for _ in ()).throw(AssertionError("not drawn")),
    )
    assert cli._offer_paused() == (None, "")


def test_a_picked_session_is_resumed_before_the_first_prompt() -> None:
    """The prompt runs `/resume <uid>` as it starts, when one was picked."""
    from pathlib import Path as P

    from agent_runtimes.chat import cli, tux

    source = P(tux.__file__).read_text()
    assert 'await self.run_line(f"/resume {self.resume_at_start}")' in source
    assert "tux.resume_at_start = resume" in source
    wiring = P(cli.__file__).read_text()
    assert "resume=resume_uid," in wiring
    assert "elif agent_id is None and not query and not runtime:" in wiring
    # Offered before where the agent runs is asked.
    assert wiring.index(
        "paused, where_picked = _offer_paused(local=local, cloud=cloud)"
    ) < wiring.index("where = _choose_where_at_start(local=local, cloud=cloud)")


def test_the_application_of_a_session_is_read_to_start_it_again() -> None:
    from agent_runtimes.commands.apps import ResumeRefused, resumed_application

    catalogue = {
        "decide": {"id": "decide", "name": "Decide", "kind": "chat"},
        "coded": {"id": "coded", "name": "Coded", "code": {"file": "app.py"}},
    }
    # A catalogue's application, by its id: recorded under its id.
    assert resumed_application("decide", catalogue) == (catalogue["decide"], "")
    with pytest.raises(ResumeRefused, match="written in Python"):
        resumed_application("coded", catalogue)

    class Item:
        name = "Notes"
        version = 3

        def __init__(self, model: Dict[str, Any]) -> None:
            self.model = model

    class Studio:
        def __init__(self, model: Dict[str, Any]) -> None:
            self.model = model

        def item(self, uid: str) -> Any:
            assert uid == "01M4APP"
            return Item(self.model)

    from agent_runtimes.apps.store import APP_ITEM_FORMAT

    spec = {"schema": "loop.app/v1", "id": "notes", "name": "Notes", "kind": "chat"}
    # One the person keeps in the Studio: recorded under the Studio's uid.
    document, uid = resumed_application(
        "01M4APP", catalogue, Studio({"format": APP_ITEM_FORMAT, "spec": spec})
    )
    assert (document, uid) == (spec, "01M4APP")
    with pytest.raises(ResumeRefused, match="older form"):
        resumed_application("01M4APP", catalogue, Studio({"format": "old"}))


def test_an_application_picked_is_started_and_resumed() -> None:
    """The start hands an application's session to what starts its application."""
    from pathlib import Path as P

    from agent_runtimes.chat import cli
    from agent_runtimes.commands import apps

    wiring = P(cli.__file__).read_text()
    assert "if plan.application:" in wiring
    assert "resume_application_session(" in wiring
    source = P(apps.__file__).read_text()
    assert "configure_on(base_url, document, app_uid=studio_uid or None)" in source
    assert "resume=session_uid," in source
    assert "session_agui_url(base_url, agent_name)" in source
    assert "deployment_uid=plan.deployment," in wiring


def test_an_application_kept_on_datalayer_is_configured_under_its_uid(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Its sessions are recorded, and resumed, under the uid Datalayer knows it by."""
    import httpx

    from agent_runtimes.commands.apps import configure_on
    from agent_runtimes.routes.apps import ConfigureAppRequest

    sent: List[Dict[str, Any]] = []

    class Answer:
        status_code = 200

        def json(self) -> Dict[str, Any]:
            return {"setup": []}

    def post(url: str, json: Dict[str, Any], timeout: float) -> Answer:
        sent.append({"url": url, **json})
        return Answer()

    monkeypatch.setattr(httpx, "post", post)
    configure_on("http://runtime", {"id": "notes"}, app_uid="01M4APP")
    configure_on("http://runtime", {"id": "decide"})
    assert sent[0] == {
        "url": "http://runtime/api/v1/apps/configure",
        "app": {"id": "notes"},
        "app_uid": "01M4APP",
    }
    assert "app_uid" not in sent[1]
    assert ConfigureAppRequest(app={}, app_uid="01M4APP").app_uid == "01M4APP"
    assert ConfigureAppRequest(app={}).app_uid is None


def test_a_deployment_of_the_persons_is_read_to_start_its_agent_again() -> None:
    from agent_runtimes.apps.deployments import Deployment
    from agent_runtimes.apps.store import APP_ITEM_FORMAT
    from agent_runtimes.commands.apps import ResumeRefused, deployed_application

    spec = {"schema": "loop.app/v1", "id": "notes", "name": "Notes", "kind": "chat"}

    class Item:
        name = "Notes"

        def __init__(self, version: int) -> None:
            self.version = version
            self.model = {"format": APP_ITEM_FORMAT, "spec": spec}

    class Studio:
        def __init__(self, kept: int) -> None:
            self.kept = kept

        def list(self) -> List[Deployment]:
            return [Deployment(uid="dep-1", app_uid="01M4APP", version=3, slug="notes")]

        def item(self, uid: str) -> Any:
            assert uid == "01M4APP"
            return Item(self.kept)

    # The instance its page gives a runtime: the runtime acts as its principal.
    assert deployed_application("dep-1", Studio(3)) == (
        spec,
        {"app_uid": "01M4APP", "deployment_uid": "dep-1", "version": 3},
    )
    with pytest.raises(ResumeRefused, match="not one of yours"):
        deployed_application("dep-of-somebody-else", Studio(3))
    with pytest.raises(
        ResumeRefused, match="runs version 3 and the Studio keeps version 4"
    ):
        deployed_application("dep-1", Studio(4))


def test_a_seat_whose_run_is_not_named_is_drawn_with_why() -> None:
    rows = paused.paused_of(
        [
            {
                "uid": "seat-2",
                "app_uid": "team-coding-agents",
                "state": "paused",
                "agent": "coder",
                "runs_on": {"kind": "team_run", "seat": "c"},
                "started_at": "2026-11-11T07:00:00+00:00",
            }
        ],
        paused.RECORD,
        None,
        {},
    )
    assert (rows[0].resumable, rows[0].team_run, rows[0].why_not) == (
        False,
        "",
        paused.TEAM_WHY_NOT,
    )
    assert "agent-teams sessions resume <run>" in paused.TEAM_WHY_NOT


def test_a_team_run_is_resumed_with_the_team_command() -> None:
    import click

    asked: List[List[str]] = []
    assert paused.team_resume_command("exec_400b") == (
        "agent-teams sessions resume exec_400b"
    )
    # The command is run with the run's id, and its exit code answered.
    assert paused.resume_team_run("exec_400b", run=asked.append) == 0
    assert asked == [["resume", "exec_400b"]]

    # A refusal — a run that is open, or ended — is the command's own
    # sentence and exit code.
    def refused(arguments: List[str]) -> None:
        raise click.exceptions.Exit(1)

    assert paused.resume_team_run("exec_400b", run=refused) == 1
    # Run in process, a command that exits answers its code.
    assert paused.resume_team_run("exec_400b", run=lambda arguments: 1) == 1


def test_the_team_command_is_the_real_one() -> None:
    # `agent-teams sessions resume <execution>` exists where the team
    # commands are installed: the group `loop` runs has that verb.
    sessions_commands = pytest.importorskip("agent_teams.sessions_commands")
    names = {
        command.name or command.callback.__name__
        for command in sessions_commands.sessions_app.registered_commands
    }
    assert "resume" in names
