# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Where ``loop`` runs its agent: here, or on Datalayer (LOOP L-01 to L-06)."""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, List

import httpx
import pytest

from agent_runtimes.loop import launch
from agent_runtimes.loop.launch import (
    CLOUD,
    DEFAULT_MINUTES,
    LOCAL,
    CloudLaunch,
    NotSignedIn,
    Relay,
    choose_environment,
    choose_minutes,
    choose_where,
    finish_cloud,
    minutes_problem,
)

#: What the platform's agents environment declares (``ai-agents-env``).
AGENT_CAPABILITIES = {"capabilities": [{"name": "agent", "enabled": True}]}


@dataclass
class Env:
    name: str
    title: str = ""
    burning_rate: float = 0.01
    metadata: Any = None


def test_the_flags_answer_where_and_a_script_runs_here(tmp_path: Path) -> None:
    prefs = tmp_path / "loop.json"
    assert choose_where(local=True, preferences=prefs) == LOCAL
    assert choose_where(cloud=True, preferences=prefs) == CLOUD
    with pytest.raises(ValueError):
        choose_where(local=True, cloud=True, preferences=prefs)
    # Nobody at the terminal: never something billed by surprise.
    assert choose_where(can_ask=False, preferences=prefs) == LOCAL


def test_a_person_is_asked_where_and_the_answer_is_offered_first_next_time(
    tmp_path: Path,
) -> None:
    prefs = tmp_path / "loop.json"
    defaults: List[str] = []

    def ask(question: str, choices: list, default: str) -> str:
        defaults.append(default)
        assert [value for _, value in choices] == [LOCAL, CLOUD]
        return CLOUD

    assert choose_where(can_ask=True, ask=ask, preferences=prefs) == CLOUD
    assert choose_where(can_ask=True, ask=ask, preferences=prefs) == CLOUD
    assert defaults == [LOCAL, CLOUD]
    with pytest.raises(KeyboardInterrupt):
        choose_where(can_ask=True, ask=lambda *_: None, preferences=prefs)


def test_the_environment_and_the_minutes() -> None:
    envs = [
        Env(
            "python-cpu-env", "Python", metadata={"capabilities": [{"name": "sandbox"}]}
        ),
        Env("ai-agents-env", "Agents", metadata=AGENT_CAPABILITIES),
    ]
    assert choose_environment(envs, can_ask=False).name == "ai-agents-env"
    with pytest.raises(launch.CloudRefused, match="cannot launch an agent"):
        choose_environment(envs, environment="python-cpu-env", can_ask=True)
    with pytest.raises(launch.CloudRefused, match="no environment named"):
        choose_environment(envs, environment="nope", can_ask=False)
    offered: List[list] = []

    def pick(question: str, choices: list, default: str) -> str:
        offered.append(choices)
        assert default == "ai-agents-env"
        return default

    assert choose_environment(envs, can_ask=True, ask=pick).name == "ai-agents-env"
    # Shown both, the agent-capable first; the other greyed with why.
    assert [(c[1], c[2]) for c in offered[0]] == [
        ("ai-agents-env", ""),
        ("python-cpu-env", launch.NO_AGENT),
    ]

    assert choose_minutes(envs[1], can_ask=False) == DEFAULT_MINUTES
    assert choose_minutes(envs[1], minutes=12, can_ask=True) == 12
    with pytest.raises(ValueError):
        choose_minutes(envs[1], minutes=0, can_ask=False)
    asked: List[str] = []

    def ask(question: str, default: str, validate: Any) -> str:
        asked.append(question)
        assert validate("abc") is not True and validate("45") is True
        return "45"

    assert choose_minutes(envs[1], can_ask=True, ask=ask) == 45
    assert "0.60 credits a minute" in asked[0]
    assert minutes_problem("10") is None and minutes_problem("999")


def _upstream() -> tuple[Any, str]:
    """A runtime stand-in: says what it was asked, and streams."""
    import uvicorn
    from starlette.applications import Starlette
    from starlette.requests import Request
    from starlette.responses import JSONResponse, StreamingResponse
    from starlette.routing import Route

    async def echo(request: Request) -> JSONResponse:
        return JSONResponse(
            {
                "path": request.url.path,
                "query": request.url.query,
                "auth": request.headers.get("authorization"),
                "body": (await request.body()).decode(),
            }
        )

    async def stream(request: Request) -> StreamingResponse:
        async def events():
            for index in range(3):
                yield f"data: {index}\n\n".encode()

        return StreamingResponse(events(), media_type="text/event-stream")

    port = launch._free_port()
    app = Starlette(
        routes=[
            Route("/agent-runtimes/pool/runtime/stream", stream),
            Route("/{path:path}", echo, methods=["GET", "POST"]),
        ]
    )
    server = uvicorn.Server(
        uvicorn.Config(app, host="127.0.0.1", port=port, log_level="error")
    )
    threading.Thread(target=server.run, daemon=True).start()
    deadline = time.monotonic() + 10
    while not server.started and time.monotonic() < deadline:
        time.sleep(0.05)
    return server, f"http://127.0.0.1:{port}/agent-runtimes/pool/runtime"


def test_the_relay_reaches_the_runtime_as_the_person_and_streams() -> None:
    server, target = _upstream()
    relay = Relay(target=target, token="the-token").start()
    try:
        answer = httpx.post(
            f"{relay.url}/api/v1/ag-ui/default/?x=1",
            content="hello",
            headers={"Authorization": "Bearer somebody-else"},
        ).json()
        assert answer == {
            "path": "/agent-runtimes/pool/runtime/api/v1/ag-ui/default/",
            "query": "x=1",
            # The person's token, never what the caller sent.
            "auth": "Bearer the-token",
            "body": "hello",
        }
        with httpx.stream("GET", f"{relay.url}/stream") as response:
            assert response.headers["content-type"].startswith("text/event-stream")
            assert "".join(response.iter_text()) == "data: 0\n\ndata: 1\n\ndata: 2\n\n"
    finally:
        relay.stop()
        server.should_exit = True


class FakeClient:
    def __init__(self, stops: bool = True):
        self.stopped: List[str] = []
        self.created: dict = {}
        self.stops = stops

    def _get_api_key(self) -> str:
        return "the-token"

    def list_environments(self) -> list:
        return [Env("ai-agents-env", "Agents", 0.02, AGENT_CAPABILITIES)]

    def create_runtime(self, **kwargs: Any) -> Any:
        self.created = kwargs
        return type(
            "Runtime",
            (),
            {
                "runtime_name": "runtime-1",
                "ingress": "https://r1.example/jupyter/server/pool/runtime-1",
                "jupyter_token": "the-jupyter-token",
            },
        )()

    def stop_runtime(self, name: str) -> bool:
        self.stopped.append(name)
        return self.stops


def test_launch_reserves_what_was_chosen_and_reaches_it_through_a_relay(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = FakeClient()
    monkeypatch.setattr(launch, "make_client", lambda: (client, "the-token"))
    monkeypatch.setattr(launch, "wait_until_ready", lambda url, timeout=180.0: True)
    monkeypatch.setattr(launch, "wait_until_set_up", lambda url, timeout=180.0: True)
    monkeypatch.setattr(launch, "speak_ag_ui", lambda url, timeout=120.0: True)
    started = launch.launch_cloud("crawler", minutes=15, can_ask=False)
    try:
        assert client.created == {
            "environment": "ai-agents-env",
            "time_reservation": 15,
            "agent_spec_id": "crawler",
        }
        assert (
            started.relay.target == "https://r1.example/agent-runtimes/pool/runtime-1"
        )
        assert started.agent_url == f"{started.relay.url}/api/v1/ag-ui/default/"
        assert started.credits == pytest.approx(0.02 * 60 * 15)
    finally:
        started.relay.stop()


def test_a_runtime_that_never_answers_is_stopped(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = FakeClient()
    monkeypatch.setattr(launch, "make_client", lambda: (client, "the-token"))
    monkeypatch.setattr(launch, "wait_until_ready", lambda url, timeout=180.0: False)
    with pytest.raises(RuntimeError, match="did not answer"):
        launch.launch_cloud("crawler", can_ask=False)
    assert client.stopped == ["runtime-1"]


def test_without_credentials_nothing_is_launched(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from agent_runtimes.client import agent_client

    class NoKey:
        def __init__(self, *args: Any, **kwargs: Any):
            raise ValueError("An API key is required.")

    monkeypatch.setattr(agent_client, "AgentClient", NoKey)
    with pytest.raises(NotSignedIn):
        launch.make_client()


def _launched(client: FakeClient) -> CloudLaunch:
    relay = Relay(target="http://127.0.0.1:1", token="t")
    return CloudLaunch(
        "runtime-1",
        "ai-agents-env",
        10,
        "https://r1.example/jupyter/server/p/runtime-1",
        relay,
        client,
        "the-jupyter-token",
    )


def test_the_end_of_a_session_stops_the_runtime_unless_it_is_kept() -> None:
    said: List[str] = []
    client = FakeClient()
    finish_cloud(_launched(client), can_ask=False, say=said.append)
    assert client.stopped == ["runtime-1"] and said[-1] == "Stopped runtime-1."

    client = FakeClient()
    finish_cloud(_launched(client), keep=True, say=said.append)
    assert client.stopped == [] and "loop agents terminate runtime-1" in said[-1]

    client = FakeClient()
    finish_cloud(
        _launched(client), can_ask=True, ask=lambda q, d: False, say=said.append
    )
    assert client.stopped == []
    assert (
        "loop connect https://r1.example/agent-runtimes/p/runtime-1/api/v1/ag-ui/default/"
        in said[-1]
    )

    client = FakeClient(stops=False)
    finish_cloud(
        _launched(client), can_ask=True, ask=lambda q, d: True, say=said.append
    )
    assert said[-1].startswith("Could not stop runtime-1")


def test_an_application_is_configured_on_the_runtime_or_refused_in_sentences(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import typer

    from agent_runtimes.commands import apps as commands

    calls: List[tuple] = []

    def post(url: str, json: dict, timeout: float) -> httpx.Response:
        calls.append((url, json))
        if json["app"].get("id") == "refused":
            return httpx.Response(
                422,
                json={"detail": {"problems": ["There is no agent or Cog named 'x'."]}},
                request=httpx.Request("POST", url),
            )
        return httpx.Response(
            200, json={"setup": []}, request=httpx.Request("POST", url)
        )

    monkeypatch.setattr(httpx, "post", post)
    assert commands.configure_on("http://relay", {"id": "web-research"}) == {
        "setup": []
    }
    assert calls[0][0] == "http://relay/api/v1/apps/configure"
    with pytest.raises(typer.BadParameter, match="no agent or Cog named"):
        commands.configure_on("http://relay", {"id": "refused"})


@dataclass
class Running:
    runtime_name: str
    environment: str
    ingress: str
    expired_at: Any
    jupyter_token: str = "the-jupyter-token"


def test_minutes_left_read_from_what_the_platform_says() -> None:
    now = 1_760_000_000.0  # 2025-10-09T08:53:20Z
    assert launch.minutes_left(now + 600, now=now) == 10
    assert launch.minutes_left((now + 120) * 1000, now=now) == 2
    assert launch.minutes_left("2025-10-09T09:03:20Z", now=now) == 10
    assert launch.minutes_left("soon", now=now) is None
    assert launch.minutes_left(now - 60, now=now) == 0


def test_a_running_agent_runtime_is_offered_before_a_new_one(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    runtimes = [
        Running(
            "kernel-1", "python-cpu-env", "https://x/jupyter/server/p/kernel-1", None
        ),
        Running(
            "runtime-9",
            "ai-agents-env",
            "https://r1.example/jupyter/server/p/runtime-9",
            time.time() + 900,
        ),
    ]
    offered: List[list] = []

    def ask(question: str, choices: list, default: str) -> str:
        offered.append(choices)
        return default

    picked = launch.choose_running(runtimes, can_ask=True, ask=ask)
    assert picked is runtimes[1]
    # Only agent runtimes, and a new one always possible.
    assert [value for _, value in offered[0]] == ["runtime-9", "__new__"]
    assert "min left" in offered[0][0][0]
    assert (
        launch.choose_running(runtimes, can_ask=True, ask=lambda *_: "__new__") is None
    )
    assert launch.choose_running(runtimes, can_ask=False) is None

    client = FakeClient()
    client.list_runtimes = lambda: runtimes
    monkeypatch.setattr(launch, "make_client", lambda: (client, "the-token"))
    monkeypatch.setattr(
        launch, "_select", lambda question, choices, default: "runtime-9"
    )
    monkeypatch.setattr(launch, "wait_until_ready", lambda url, timeout=180.0: True)
    monkeypatch.setattr(launch, "wait_until_set_up", lambda url, timeout=180.0: True)
    monkeypatch.setattr(launch, "speak_ag_ui", lambda url, timeout=120.0: True)
    monkeypatch.setattr(launch, "ensure_agentspec", lambda *args, **kwargs: False)
    back = launch.launch_cloud("crawler", can_ask=True)
    try:
        # Nothing launched: the runtime that runs is the one reached.
        assert client.created == {}
        assert back.runtime_name == "runtime-9" and back.minutes >= 14
        assert back.relay.target == "https://r1.example/agent-runtimes/p/runtime-9"
    finally:
        back.relay.stop()


# --- a runtime set up for the account before anything is configured on it (STUDIO A-08)


def test_the_record_datalayer_sets_a_runtime_up_with_is_told_from_the_pools() -> None:
    import inspect

    from agent_runtimes.app import _create_and_register_cli_agent
    from agent_runtimes.routes.agents import CreateAgentRequest

    # What configure-from-spec records: the request the agent was created from.
    configured = CreateAgentRequest(
        name="default", agent_spec_id="example-simple"
    ).model_dump()
    configured.pop("jupyter_sandbox", None)
    assert launch.set_up_by_datalayer(configured)
    assert launch.set_up_by_datalayer({**configured, "sandbox": None})

    # What a pooled pod records at boot, from the image's agentspec.
    booted_source = inspect.getsource(_create_and_register_cli_agent)
    assert '"id": getattr(agent_spec, "id", agent_id)' in booted_source
    assert '"selected_mcp_servers"' not in booted_source
    booted = {
        "id": "example-simple",
        "agent_spec_id": "example-simple",
        "mcp_servers": [],
    }
    assert not launch.set_up_by_datalayer(booted)
    assert not launch.set_up_by_datalayer(None)


def test_nothing_is_configured_before_datalayer_set_the_runtime_up(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = FakeClient()
    calls: List[str] = []
    monkeypatch.setattr(launch, "make_client", lambda: (client, "the-token"))
    monkeypatch.setattr(launch, "wait_until_ready", lambda url, timeout=180.0: True)

    def set_up(url: str, timeout: float = 180.0) -> bool:
        calls.append("set up")
        return True

    def speaks(url: str, timeout: float = 120.0) -> bool:
        calls.append("ag-ui")
        return True

    monkeypatch.setattr(launch, "wait_until_set_up", set_up)
    monkeypatch.setattr(launch, "speak_ag_ui", speaks)
    started = launch.launch_cloud("crawler", can_ask=False)
    try:
        assert calls == ["set up", "ag-ui"]
    finally:
        started.relay.stop()


def test_a_runtime_datalayer_never_sets_up_is_stopped_in_a_sentence(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = FakeClient()
    monkeypatch.setattr(launch, "make_client", lambda: (client, "the-token"))
    monkeypatch.setattr(launch, "wait_until_ready", lambda url, timeout=180.0: True)
    monkeypatch.setattr(launch, "wait_until_set_up", lambda url, timeout=180.0: False)
    with pytest.raises(RuntimeError, match="did not set up runtime-1 in time.*stopped"):
        launch.launch_cloud("crawler", can_ask=False)
    assert client.stopped == ["runtime-1"]
