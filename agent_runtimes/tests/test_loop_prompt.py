# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""``loop --prompt``: one session, its lines run in order, then stopped.

The lines run in the real ``CliTux`` through ``run_line``, the function the
interactive prompt runs its lines through. On this machine the session talks
to the runtime's own agents and configure routes (as in
``test_model_switch``), with an AG-UI route whose events are the ``ag_ui``
package's own classes, encoded by its encoder. On Datalayer the API is the
fake client of ``test_loop_cloud`` and the runtime its fake behind the real
relay.
"""

from __future__ import annotations

import asyncio
import io
import re
from typing import Any, List

import httpx
import pytest
from fastapi import FastAPI
from rich.console import Console
from starlette.requests import Request
from starlette.responses import StreamingResponse

from agent_runtimes.chat import cli
from agent_runtimes.loop import launch
from agent_runtimes.models.offered import InferenceModels, set_inference_models
from agent_runtimes.routes import agents as agents_route

from .test_agents_create_integration import creation_spy  # noqa: F401
from .test_loop_cloud import (  # noqa: F401
    AGENTS,
    ENVIRONMENTS,
    Env,
    FakeDatalayer,
    cloud_runtime,
    datalayer,
)
from .test_model_switch import (  # noqa: F401
    AGENT,
    OPUS,
    QWEN,
    SONNET,
    THROUGH_AI_INFERENCE,
    _configure,
    runtime,
)

ANSI = re.compile(r"\x1b\[")


def _answering(app: FastAPI) -> FastAPI:
    """Give the runtime an AG-UI route: its agent says which model it runs on."""
    from ag_ui.core import (
        EventType,
        RunErrorEvent,
        RunFinishedEvent,
        RunStartedEvent,
        TextMessageContentEvent,
        TextMessageEndEvent,
        TextMessageStartEvent,
    )
    from ag_ui.encoder import EventEncoder

    async def agui(request: Request) -> StreamingResponse:
        body = await request.json()
        asked = body["messages"][-1]["content"]
        model = agents_route._agentspecs[AGENT]["model"]
        thread, run = body["thread_id"], body["run_id"]
        encoder = EventEncoder()

        def events() -> Any:
            yield RunStartedEvent(
                type=EventType.RUN_STARTED, thread_id=thread, run_id=run
            )
            if asked == "fail":
                yield RunErrorEvent(type=EventType.RUN_ERROR, message="model down")
                return
            yield TextMessageStartEvent(
                type=EventType.TEXT_MESSAGE_START, message_id="m", role="assistant"
            )
            for delta in ("I am the agent ", f"on {model}."):
                yield TextMessageContentEvent(
                    type=EventType.TEXT_MESSAGE_CONTENT, message_id="m", delta=delta
                )
            yield TextMessageEndEvent(type=EventType.TEXT_MESSAGE_END, message_id="m")
            yield RunFinishedEvent(
                type=EventType.RUN_FINISHED, thread_id=thread, run_id=run
            )

        return StreamingResponse(
            (encoder.encode(event) for event in events()),
            media_type="text/event-stream",
        )

    app.add_api_route(f"/api/v1/ag-ui/{AGENT}/", agui, methods=["POST"])
    return app


def _local_session(app: FastAPI, monkeypatch: pytest.MonkeyPatch) -> Any:
    """Return ``loop``'s real session, on the runtime's routes, as piped output."""
    from agent_runtimes.chat.tux import CliTux

    real = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **kwargs: real(transport=httpx.ASGITransport(app=app), **kwargs),
    )
    tux = CliTux(
        agent_url=f"http://runtime/api/v1/ag-ui/{AGENT}/",
        server_url="http://runtime",
        agent_id=AGENT,
    )
    tux.console = Console(file=io.StringIO(), width=200, soft_wrap=True)
    tux._stderr_console = Console(file=io.StringIO(), width=200, soft_wrap=True)
    return tux


def _out(console: Console) -> str:
    file = console.file
    assert isinstance(file, io.StringIO)
    return file.getvalue()


@pytest.fixture
def served(
    runtime: FastAPI,  # noqa: F811
    creation_spy: dict[str, object],  # noqa: F811
) -> FastAPI:
    """``example-simple`` on Sonnet, ai-inference serving Sonnet and Qwen."""
    set_inference_models(
        InferenceModels(served=(SONNET, QWEN), url="u", note="serves both")
    )
    _configure(runtime, agent_id=AGENT, agent_spec=THROUGH_AI_INFERENCE)
    return _answering(runtime)


def test_the_lines_run_in_order_in_one_session(
    served: FastAPI,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture,
) -> None:
    tux = _local_session(served, monkeypatch)
    code = asyncio.run(
        cli._run_lines(
            tux,
            [
                "/models",
                f"/models {QWEN}",
                "Who are you and which model are you? One sentence.",
                f"/models {OPUS}",
            ],
        )
    )
    assert code == 0
    out = _out(tux.console)
    # The listing, the switch, the answer on the model switched to, and the
    # refusal — in that order, on standard output.
    listing = out.index(f"● {SONNET}")
    switched = out.index("Model: Alibaba Qwen-Max")
    answered = out.index(f"I am the agent on {QWEN}.")
    refused = out.index(f"does not offer {OPUS} to this agent: nothing was switched.")
    assert listing < switched < answered < refused
    assert agents_route._agentspecs[AGENT]["model"] == QWEN
    # Progress is on standard error: each step, and the turn's footer.
    status = capsys.readouterr().err
    assert "[1/4] /models" in status and f"[4/4] /models {OPUS}" in status
    assert "tokens used" in _out(tux._stderr_console)
    assert "tokens used" not in out
    assert not ANSI.search(out) and not ANSI.search(status)


def test_an_answer_that_is_an_error_stops_the_run(
    served: FastAPI, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture
) -> None:
    tux = _local_session(served, monkeypatch)
    code = asyncio.run(cli._run_lines(tux, ["fail", "/models"]))
    assert code == 1
    assert "Error: model down" in _out(tux._stderr_console)
    err = capsys.readouterr().err
    assert "Stopped at step 1 of 2: Error: model down" in err
    assert "[2/2]" not in err


def test_an_unknown_command_is_an_error(
    served: FastAPI, monkeypatch: pytest.MonkeyPatch
) -> None:
    tux = _local_session(served, monkeypatch)
    assert asyncio.run(tux.run_line("/nope")) is False
    assert tux.last_error == "Unknown command: /nope"
    # A refusal is the command doing its job.
    assert asyncio.run(tux.run_line(f"/models {OPUS}")) is True
    assert asyncio.run(tux.run_line("")) is True


# --- launching and stopping -------------------------------------------------------


@pytest.fixture
def on_datalayer(
    datalayer: FakeDatalayer,  # noqa: F811
    cloud_runtime: Any,  # noqa: F811
    monkeypatch: pytest.MonkeyPatch,
) -> FakeDatalayer:
    """A runtime launched on Datalayer is the fake runtime, behind a real relay."""
    fake, _ = cloud_runtime
    monkeypatch.setattr(
        "agent_runtimes.client.agent_client.build_agent_runtimes_base_url",
        lambda ingress: fake.url,
    )
    for name in ("FORCE_COLOR", "TTY_COMPATIBLE", "TTY_INTERACTIVE"):
        monkeypatch.delenv(name, raising=False)
    return datalayer


def test_a_cloud_run_stops_the_runtime_unless_kept(
    on_datalayer: FakeDatalayer, capsys: pytest.CaptureFixture
) -> None:
    code = cli.run_prompts(["/models", "/help"], agent_id=None, cloud=True, minutes=5)
    assert code == 0
    assert on_datalayer.created == {
        "environment": "ai-agents-env",
        "time_reservation": 5,
        "agent_spec_id": "example-simple",
    }
    assert on_datalayer.stopped == ["runtime-1"]
    captured = capsys.readouterr()
    # What the commands print is on standard output, plain.
    assert "Models on runtime-1 on Datalayer (ai-agents-env) (2)" in captured.out
    assert "Launching" not in captured.out
    # The launch, the steps and the stop are on standard error.
    assert "The runtime's agent is example-simple" in captured.err
    assert "[2/2] /help" in captured.err
    assert "Stopped runtime-1." in captured.err
    assert not ANSI.search(captured.out) and not ANSI.search(captured.err)

    on_datalayer.stopped.clear()
    assert cli.run_prompts(["/help"], agent_id=None, cloud=True, keep=True) == 0
    assert on_datalayer.stopped == []
    assert "keeps running until its reservation ends" in capsys.readouterr().err


def test_a_failed_line_or_an_interrupt_still_stops_the_runtime(
    on_datalayer: FakeDatalayer,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture,
) -> None:
    # The fake runtime has no agent route: the message is answered with a 404.
    assert cli.run_prompts(["Hello"], agent_id=None, cloud=True) == 1
    assert on_datalayer.stopped == ["runtime-1"]
    assert "Stopped at step 1 of 1" in capsys.readouterr().err

    async def interrupted(tux: Any, lines: List[str]) -> int:
        raise KeyboardInterrupt

    monkeypatch.setattr(cli, "_run_lines", interrupted)
    on_datalayer.stopped.clear()
    assert cli.run_prompts(["/help"], agent_id=None, cloud=True) == 130
    assert on_datalayer.stopped == ["runtime-1"]


def test_a_refused_launch_exits_non_zero_and_runs_nothing(
    on_datalayer: FakeDatalayer,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture,
) -> None:
    ran: List[Any] = []

    async def never(tux: Any, lines: List[str]) -> int:
        ran.append(lines)
        return 0

    monkeypatch.setattr(cli, "_run_lines", never)
    on_datalayer.credits = 0.0
    assert cli.run_prompts(["/models"], agent_id=None, cloud=True) == 1
    assert "No credits left on Datalayer" in capsys.readouterr().err
    assert on_datalayer.created == {} and ran == []

    on_datalayer.credits = 100.0
    assert cli.run_prompts(["/models"], agent_id=None, cloud=True, minutes=0) == 1
    assert "Between 1 and" in capsys.readouterr().err
    assert ran == []


def test_a_choice_that_would_need_asking_is_refused() -> None:
    other = Env("gpu-agents-env", "GPU agents", 0.001, AGENTS)
    third = Env("big-agents-env", "Big agents", 0.002, AGENTS)
    with pytest.raises(launch.CloudRefused, match="name one with --environment"):
        launch.choose_environment([other, third], can_ask=False)
    # One that fits, or the default among several, is taken.
    assert launch.choose_environment([other], can_ask=False).name == "gpu-agents-env"
    assert (
        launch.choose_environment([*ENVIRONMENTS, other], can_ask=False).name
        == "ai-agents-env"
    )


def test_on_this_machine_the_agent_is_named_and_the_server_stopped(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture
) -> None:
    assert cli.run_prompts(["/models"], agent_id=None, local=True) == 2
    assert "-a <agentspec>" in capsys.readouterr().err

    class Process:
        terminated = False

        def is_alive(self) -> bool:
            return not self.terminated

        def terminate(self) -> None:
            self.terminated = True

        def join(self, timeout: float = 0.0) -> None:
            return None

    process = Process()
    monkeypatch.setattr(
        cli, "_start_agent_runtime_server", lambda agent_id, **kwargs: (process, 9)
    )
    monkeypatch.setattr(cli, "_wait_for_server", lambda host, port, timeout: False)
    assert cli.run_prompts(["/models"], agent_id="example-simple") == 1
    assert "did not start on this machine" in capsys.readouterr().err
    assert process.terminated


# --- the command line -------------------------------------------------------------


def test_prompt_is_an_option_of_loop_and_of_loop_chat(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from typer.testing import CliRunner

    import agent_runtimes.__main__ as main
    from agent_runtimes.loop import entrypoint

    called: List[tuple] = []

    def run_prompts(prompts: List[str], **kwargs: Any) -> int:
        called.append((prompts, kwargs))
        return 3

    monkeypatch.setattr(cli, "run_prompts", run_prompts)
    result = CliRunner().invoke(
        cli.app,
        [
            "--cloud",
            "-a",
            "example-simple",
            "-m",
            "10",
            "-q",
            "/models",
            "--prompt",
            "Hi",
        ],
    )
    assert result.exit_code == 3, result.output
    prompts, options = called[0]
    assert prompts == ["/models", "Hi"]
    assert options["cloud"] and options["agent_id"] == "example-simple"
    assert options["minutes"] == 10 and not options["keep"]

    help_text = re.sub(
        r"\x1b\[[0-9;]*m", "", CliRunner().invoke(cli.app, ["--help"]).output
    )
    assert "--prompt" in help_text and "-q" in help_text

    forwarded: List[list] = []
    monkeypatch.setattr(entrypoint, "opens_workspace", lambda: True)
    monkeypatch.setattr(cli, "app", lambda args: forwarded.append(args))
    result = CliRunner().invoke(
        main.app, ["--cloud", "--keep", "-q", "/models", "--prompt", "Hi"]
    )
    assert result.exit_code == 0, result.output
    assert forwarded == [["--cloud", "--keep", "--prompt", "/models", "--prompt", "Hi"]]
