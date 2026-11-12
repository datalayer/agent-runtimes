# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An open session is joined where it runs, not resumed on a new runtime.

Picked on the start screen or named by `loop --resume <uid>`: open on a
runtime on Datalayer that still runs, it is joined there — no environment
asked, nothing launched, left running when the prompt ends. Its runtime
gone, it is resumed as a paused one. Where a terminal cannot join it (a run
in AgentCore, a running team run's seat), or when it is somebody else's,
one sentence says so before anything is launched.
"""

from __future__ import annotations

from typing import Any, List

import pytest

from agent_runtimes.loop import launch
from agent_runtimes.loop.paused import (
    ON_DATALAYER,
    ON_THIS_MACHINE,
    Paused,
    RunsElsewhere,
    joined_runtime,
    paused_of,
)
from agent_runtimes.loop.picker import why_not


def _open(**fields: Any) -> Paused:
    given = {
        "uid": "01M78A",
        "kind": "application",
        "agent": "worker-steward-aws",
        "title": "Cost check",
        "where": ON_DATALAYER,
        "store": "record",
        "started_at": "2026-11-12T15:30:13Z",
        "app_uid": "01M785Z6PVBDHXQ53EZ8QPAJX6",
        "app_name": "Cost check",
        "deployment_uid": "dep-1",
        "state": "open",
        "runs_on": "runtime",
        "runs_on_id": "pool-runtime-7",
        "address": "https://datalayer.ai/apps/cost-check?thread=01M78A",
    }
    given.update(fields)
    return Paused(**given)


def _never() -> List[str]:
    raise AssertionError("The runtimes are not listed for this session.")


def test_open_on_a_running_runtime_is_joined_there() -> None:
    assert (
        joined_runtime(_open(), lambda: ["other", "pool-runtime-7"]) == "pool-runtime-7"
    )


def test_open_on_a_runtime_that_is_gone_is_resumed_as_a_paused_one() -> None:
    assert joined_runtime(_open(), lambda: ["other"]) == ""


def test_paused_and_this_machines_are_not_joined() -> None:
    assert joined_runtime(_open(state="paused"), _never) == ""
    assert joined_runtime(_open(where=ON_THIS_MACHINE, store="file"), _never) == ""
    assert joined_runtime(_open(runs_on_id="local"), _never) == ""


def test_a_run_in_agentcore_and_a_running_team_run_are_said_in_a_sentence() -> None:
    with pytest.raises(RunsElsewhere) as agentcore:
        joined_runtime(
            _open(runs_on="agentcore", runs_on_id="arn:aws:bedrock-agentcore:…"), _never
        )
    assert str(agentcore.value) == (
        "Session 01M78A is running now in AgentCore, where a terminal cannot join a run: "
        "open it at https://datalayer.ai/apps/cost-check?thread=01M78A. "
        "Once its run ends it is paused, and resumed from here."
    )
    with pytest.raises(RunsElsewhere) as seat:
        joined_runtime(
            _open(
                team_run="exec_400b",
                runs_on="team_run",
                address="https://datalayer.ai/executions/exec_400b",
            ),
            _never,
        )
    assert "`agent-teams sessions show exec_400b`" in str(seat.value)


def test_the_record_says_where_it_runs() -> None:
    [row] = paused_of(
        [
            {
                "uid": "s-1",
                "state": "open",
                "app_uid": "agent:example-simple",
                "agent": "example-simple",
                "runs_on": {"kind": "agentcore", "arn": "arn:aws:x"},
            }
        ],
        "record",
        {},
        {},
        ("open",),
        lambda spec: True,
    )
    assert (row.runs_on, row.runs_on_id) == ("agentcore", "arn:aws:x")


def test_somebody_elses_open_session_is_refused_in_a_sentence() -> None:
    [row] = paused_of(
        [
            {
                "uid": "s-2",
                "state": "open",
                "app_uid": "app-9",
                "deployment_uid": "dep-of-somebody-else",
                "agent": "cog-crawler",
                "runs_on": {"kind": "runtime", "uid": "theirs"},
            }
        ],
        "record",
        {},
        {},
        ("open",),
    )
    assert why_not("resume", row) == (
        "Session s-2 is a session of somebody else's deployment: a terminal starts a "
        "runtime for a deployment of its owner's only."
    )


class _Relay:
    url = "http://127.0.0.1:9"

    def __init__(self) -> None:
        self.stopped = False

    def stop(self) -> None:
        self.stopped = True


class _Client:
    def stop_runtime(self, name: str) -> bool:
        raise AssertionError("A joined runtime is not stopped.")


def _joined() -> launch.CloudLaunch:
    return launch.CloudLaunch(
        runtime_name="pool-runtime-7",
        environment="ai-agents-env",
        minutes=20,
        ingress="https://r1.example/pool-runtime-7",
        relay=_Relay(),  # type: ignore[arg-type]
        client=_Client(),
        jupyter_token="t",
        attached=True,
        joined=True,
    )


def test_a_joined_runtime_is_left_running_and_nobody_asked() -> None:
    joined = _joined()
    said: List[str] = []

    def never(*args: Any) -> bool:
        raise AssertionError("Nobody is asked to stop a joined runtime.")

    launch.finish_cloud(joined, can_ask=True, ask=never, say=said.append)
    assert joined.relay.stopped  # type: ignore[attr-defined]
    assert said == [
        "Left pool-runtime-7: it keeps running its session, as it was before you joined."
    ]


def test_an_applications_open_session_is_joined_with_no_launch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from agent_runtimes.chat import tux
    from agent_runtimes.commands import apps

    joined = _joined()
    monkeypatch.setattr(
        apps,
        "resumed_application",
        lambda app_uid: (
            {
                "id": "decide",
                "name": "Decide",
                "kind": "chat",
                "agent": "example-simple",
            },
            "",
        ),
    )
    monkeypatch.setattr(launch, "join_runtime", lambda runtime, status: joined)

    def no_launch(*args: Any, **kwargs: Any) -> Any:
        raise AssertionError("Nothing is launched, no environment asked.")

    monkeypatch.setattr(launch, "launch_cloud", no_launch)
    monkeypatch.setattr(launch, "choose_environment", no_launch)
    monkeypatch.setattr(launch, "speak_ag_ui", lambda url: True)
    monkeypatch.setattr(
        apps,
        "configure_on",
        lambda *args, **kwargs: (_ for _ in ()).throw(
            AssertionError("A joined runtime is not configured again.")
        ),
    )
    ran: List[Any] = []

    async def run_tux(url: str, base: str, **kwargs: Any) -> None:
        ran.append((url, base, kwargs["resume"], kwargs["cloud_runtime"]))

    monkeypatch.setattr(tux, "run_tux", run_tux)
    monkeypatch.setattr(launch, "interactive", lambda: True)
    apps.resume_application_session(
        "decide", "01M78A", cloud=True, runtime="pool-runtime-7"
    )
    assert ran and ran[0][2:] == ("01M78A", "pool-runtime-7")
    assert joined.relay.stopped  # type: ignore[attr-defined]


def test_loop_stops_before_any_launch_when_it_cannot_join(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    import typer

    from agent_runtimes.chat import cli

    monkeypatch.setattr(launch, "running_runtimes", lambda: ["other"])
    assert cli._joined_runtime(_open()) == ""
    with pytest.raises(typer.Exit) as stopped:
        cli._joined_runtime(_open(runs_on="agentcore", runs_on_id="arn"))
    assert stopped.value.exit_code == 1
    assert "running now in AgentCore" in capsys.readouterr().err

    def offline() -> List[str]:
        raise OSError("Name or service not known")

    monkeypatch.setattr(launch, "running_runtimes", offline)
    with pytest.raises(typer.Exit):
        cli._joined_runtime(_open())
    assert "nothing was launched" in capsys.readouterr().err
