# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""`loop sessions …` (MH-17): one command per verb against a fake runtime —
the real session routes in process, the command's client the test's — and
the retired `loop apps threads|feedback` answering with their sentence.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterator

import pytest
from fastapi.testclient import TestClient
from typer.testing import CliRunner

from agent_runtimes.commands import sessions as command
from agent_runtimes.commands.apps import app as apps_app
from agent_runtimes.loop.apps import sessions
from agent_runtimes.loop.apps.session_store import FileSessionStore, use_session_store
from agent_runtimes.tests.test_app_sessions import (  # noqa: F401 - fixtures
    ASSISTANT,
    Runtime,
    as_,
    events_of,
    remote,
    runtime,
)

runner = CliRunner()
HARNESS_AGENT = "example-harness-codex"


class Signed:
    """The test client, signing every call as Ada — what `--cloud` does with a token."""

    def __init__(self, client: TestClient) -> None:
        self.client = client

    def request(self, method: str, url: str, **kwargs: Any) -> Any:
        headers = {**as_("ada"), **(kwargs.pop("headers", None) or {})}
        return self.client.request(method, url, headers=headers, **kwargs)


@pytest.fixture()
def fake(runtime: Runtime, remote: TestClient, tmp_path: Path) -> Iterator[Runtime]:  # noqa: F811 - the fixtures
    from agent_runtimes.loop.apps.record import agent_recorder, send_to_store

    use_session_store(FileSessionStore(root=tmp_path / "sessions"))
    runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1", "version": 3})
    recorder = agent_recorder("notes-assistant")
    assert recorder is not None
    recorder.send = send_to_store
    command.use_client(lambda server, cloud: Signed(remote))
    sessions.use_rebinder(lambda live, agent, request: _rebound(live, agent))
    try:
        yield runtime
    finally:
        command.use_client(None)
        sessions.use_rebinder(None)
        use_session_store(None)


async def _rebound(live: Any, agent: str) -> None:
    return None


def _open(
    client: TestClient, uid: str, opener: str = "Refactor the billing module"
) -> None:
    events_of(
        client.post(
            "/api/v1/apps/sessions",
            headers=as_("ada"),
            json={
                "agent": "notes-assistant",
                "app_uid": "app-1",
                "version": 3,
                "opener": opener,
                "session": uid,
            },
        )
    )


def test_list_and_show(fake: Runtime, remote: TestClient) -> None:  # noqa: F811 - the fixture
    _open(remote, "session-k001")
    remote.post("/api/v1/apps/sessions/session-k001/stop", headers=as_("ada"))
    _open(remote, "session-k002", opener="Two")
    result = runner.invoke(command.app, ["list", "--cloud"])
    assert result.exit_code == 0, result.output
    lines = result.output.strip().splitlines()
    assert any(
        line.startswith(
            "session-k001  paused  notes-assistant  1 turn  on runtime local  — Refactor the billing module"
        )
        for line in lines
    )
    assert any(
        line.startswith(
            "session-k002  open    notes-assistant  1 turn  on runtime local  — Two"
        )
        for line in lines
    )
    assert (
        runner.invoke(command.app, ["list", "--state", "paused"]).output.count(
            "session-k00"
        )
        == 1
    )
    refused = runner.invoke(command.app, ["list", "--state", "stopped"])
    assert (
        refused.exit_code == 1
        and "There is no session state 'stopped': one of open, paused, ended."
        in refused.output
    )
    shown = runner.invoke(command.app, ["show", "session-k001"])
    assert shown.exit_code == 0, shown.output
    assert (
        "uid        session-k001" in shown.output
        and "state      paused  turn idle  held yes" in shown.output
    )
    assert "title      Refactor the billing module" in shown.output
    assert runner.invoke(command.app, ["show", "session-none"]).exit_code == 1


def test_swap_clone_export_import_resume_end(
    fake: Runtime,
    remote: TestClient,  # noqa: F811 - the fixture
    tmp_path: Path,
) -> None:
    from agent_shield.policy import Harnesses, Policy

    from agent_runtimes.guardrails import managed_policies
    from agent_runtimes.tests.test_shield_policies import FakeIam, served

    managed_policies.use_source(
        FakeIam(
            served(Policy(scope="organization", harnesses=Harnesses(admit=["codex"])))
        )
    )
    try:
        _open(remote, "session-k010")
        swapped = runner.invoke(
            command.app, ["swap", "session-k010", "--agent", HARNESS_AGENT]
        )
        assert swapped.exit_code == 0, swapped.output
        assert (
            f'{HARNESS_AGENT} is told: "This conversation was with notes-assistant until turn 1; from here it is with Codex.'
            in swapped.output
        )
        assert f"Swapped. {HARNESS_AGENT} answers from turn 2." in swapped.output
        cloned = runner.invoke(
            command.app, ["clone", "session-k010", "--at", "1", "--title", "Before"]
        )
        assert cloned.exit_code == 0, cloned.output
        clone_uid = cloned.output.split("Cloned as ")[1].split(" ")[0]
        assert (
            f"(paused, 1 turn). Resume it: loop sessions resume {clone_uid}"
            in cloned.output
        )
        too_far = runner.invoke(command.app, ["clone", "session-k010", "--at", "9"])
        assert (
            too_far.exit_code == 1
            and "there is no turn 9 to clone it at" in too_far.output
        )
        out = tmp_path / "before.session.jsonl"
        exported = runner.invoke(
            command.app, ["export", "session-k010", "-o", str(out)]
        )
        assert exported.exit_code == 0, exported.output
        assert (
            "Exported 1 turn" in exported.output
            and f"→ {out} (sha256:" in exported.output
        )
        head = json.loads(out.read_text().split("\n", 1)[0])
        assert head["uid"] == "session-k010" and head["agent"] == HARNESS_AGENT
        unknown = runner.invoke(
            command.app, ["export", "session-k010", "--format", "omnigent-jsonl/1"]
        )
        assert (
            unknown.exit_code == 1
            and "There is no session file format 'omnigent-jsonl/1'" in unknown.output
        )
        imported = runner.invoke(
            command.app, ["import", str(out), "--agent", "notes-assistant"]
        )
        assert imported.exit_code == 0, imported.output
        new_uid = imported.output.split("Imported as ")[1].split(" ")[0]
        assert (
            "(paused, 1 turn, " in imported.output
            and f"Resume it: loop sessions resume {new_uid}" in imported.output
        )
        assert (
            runner.invoke(
                command.app, ["import", str(tmp_path / "nope.jsonl")]
            ).exit_code
            == 1
        )
        resumed = runner.invoke(
            command.app, ["resume", new_uid, "--agent", "notes-assistant"]
        )
        assert resumed.exit_code == 0, resumed.output
        assert (
            f"Resuming {new_uid} on runtime local (notes-assistant): 1 turn replayed."
            in resumed.output
        )
        ended = runner.invoke(command.app, ["end", new_uid])
        assert ended.exit_code == 0 and f"Ended {new_uid}." in ended.output
        again = runner.invoke(
            command.app, ["resume", new_uid, "--agent", "notes-assistant"]
        )
        assert (
            again.exit_code == 1
            and "an ended session is not resumed — clone it to go on from it"
            in again.output
        )
    finally:
        managed_policies.use_source(None)


def test_the_retired_verbs_answer_with_their_sentence() -> None:
    threads = runner.invoke(apps_app, ["threads"])
    assert threads.exit_code == 1
    assert (
        "`loop apps threads` is retired: list your conversations with `loop sessions list [--app <id>]`."
        in threads.output
    )
    feedback = runner.invoke(apps_app, ["feedback", "session-x"])
    assert feedback.exit_code != 0
    assert (
        "`loop apps feedback` is retired" in feedback.output
        or "No such option" in feedback.output
        or "Got unexpected extra argument" in feedback.output
    )
