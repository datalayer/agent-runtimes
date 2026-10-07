# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""``loop`` on Datalayer: what the cloud offers, attaching, refusals, and the
slash commands reading the cloud runtime (LOOP L-01, L-02, L-04, L-06, L-07).

The Datalayer API is a fake client; the cloud runtime is a small Starlette
application behind the real relay, so every request a slash command makes
crosses the same relay, with the same token, as on Datalayer.
"""

from __future__ import annotations

import asyncio
import threading
import time
from dataclasses import dataclass, field
from typing import Any, List, Optional, TypeVar

import httpx
import pytest

from agent_runtimes.loop import launch
from agent_runtimes.loop.launch import (
    CLOUD,
    LOCAL,
    CloudLaunch,
    CloudOffer,
    CloudRefused,
    Relay,
    agent_capable,
    check_credits,
    choose_environment,
    choose_where,
    ensure_agentspec,
    environment_choices,
    find_running,
    finish_cloud,
    offer_lines,
    read_offer,
)

_T = TypeVar("_T")


def _kept(store: list[Any], item: Any, result: _T) -> _T:
    """Keep ``item`` in ``store`` and answer ``result``, as a stub recording its calls."""
    store.append(item)
    return result


AGENTS = {"capabilities": [{"name": "agent", "enabled": True}]}
SANDBOX = {"capabilities": [{"name": "sandbox", "enabled": True}]}


@dataclass
class Env:
    name: str
    title: str = ""
    burning_rate: float = 0.0008  # credits a second: 0.048 a minute
    metadata: Any = None


@dataclass
class Running:
    runtime_name: str
    environment: str
    ingress: str = "https://r1.example/jupyter/server/pool/runtime-9"
    jupyter_token: str = "the-jupyter-token"
    expired_at: Any = None
    uid: str = ""
    name: str = ""


ENVIRONMENTS = [
    Env("ai-agents-env", "AI Agents Environment", 0.0008, AGENTS),
    Env(
        "kaggle-cpu",
        "Kaggle CPU",
        0.0,
        {**SANDBOX, "description": "<p>Kaggle notebook sessions</p>"},
    ),
    Env("eric/geospatial-analysis", "Geospatial analysis", 0.0008, {}),
]


@dataclass
class FakeDatalayer:
    """The Datalayer API, as `AgentClient` presents it."""

    credits: Optional[float] = 100.0
    running: List[Any] = field(default_factory=list)
    refuse: Optional[str] = None
    created: dict = field(default_factory=dict)
    stopped: List[str] = field(default_factory=list)

    def _get_api_key(self) -> str:
        return "the-token"

    def list_environments(self) -> list:
        return list(ENVIRONMENTS)

    def list_runtimes(self) -> list:
        return list(self.running)

    def _get_usage_credits(self) -> dict:
        if self.credits is None:
            return {"success": False, "message": "down"}
        return {"success": True, "credits": {"credits": self.credits}}

    def create_runtime(self, **kwargs: Any) -> Any:
        if self.refuse:
            raise RuntimeError(self.refuse)
        self.created = kwargs
        return Running("runtime-1", kwargs["environment"])

    def stop_runtime(self, name: str) -> bool:
        self.stopped.append(name)
        return True


@pytest.fixture
def datalayer(monkeypatch: pytest.MonkeyPatch) -> FakeDatalayer:
    client = FakeDatalayer()
    monkeypatch.setattr(launch, "make_client", lambda: (client, "the-token"))
    monkeypatch.setattr(launch, "wait_until_ready", lambda url, timeout=180.0: True)
    monkeypatch.setattr(launch, "wait_until_set_up", lambda url, timeout=180.0: True)
    monkeypatch.setattr(launch, "speak_ag_ui", lambda url, timeout=120.0: True)
    return client


# --- what Datalayer offers ------------------------------------------------------


def test_datalayer_is_not_offered_to_somebody_not_signed_in(tmp_path: Any) -> None:
    def ask(*args: Any) -> str:
        raise AssertionError("nobody is asked")

    prefs = tmp_path / "loop.json"
    assert (
        choose_where(can_ask=True, ask=ask, cloud_offered=False, preferences=prefs)
        == LOCAL
    )
    # The flag still says so, and is refused later in a sentence (L-04).
    assert choose_where(cloud=True, cloud_offered=False, preferences=prefs) == CLOUD


def test_only_environments_that_hold_an_agent_are_offered(
    datalayer: FakeDatalayer,
) -> None:
    datalayer.running = [
        Running("kernel-1", "python-cpu-env"),
        Running("runtime-9", "ai-agents-env", expired_at=time.time() + 900),
    ]
    offer = read_offer(datalayer)
    assert [e.name for e in offer.agent_environments] == ["ai-agents-env"]
    assert [r.runtime_name for r in offer.agent_runtimes] == ["runtime-9"]
    assert agent_capable(ENVIRONMENTS[0]) and not agent_capable(ENVIRONMENTS[1])

    lines = offer_lines(offer)
    assert lines[0] == "Credits: 100.00 left."
    assert (
        "1 of your environments say nothing about agents and are not listed: "
        "--environment <name> to try one." in lines
    )
    # The environments are offered in the picker, not here.
    assert not any("ai-agents-env —" in line for line in lines)
    assert any(line.startswith("  ● runtime-9 — ai-agents-env, 1") for line in lines)
    # The cloud's models are the runtime's, never this machine's keys.
    assert "not this machine's keys" in lines[-1]

    datalayer.credits = None
    assert read_offer(datalayer).credits is None
    assert offer_lines(read_offer(datalayer))[0].startswith("Credits: not known")


def test_credits_are_checked_before_anything_is_reserved() -> None:
    env = ENVIRONMENTS[0]
    check_credits(None, env, 30)  # unknown: the platform decides
    check_credits(10.0, env, 30)  # 1.44 at most
    with pytest.raises(CloudRefused, match="No credits left"):
        check_credits(0.0, env, 30)
    with pytest.raises(CloudRefused, match="costs at most 1.44 credits"):
        check_credits(1.0, env, 30)


def test_the_cloud_environments_are_offered_with_what_they_cost() -> None:
    choices = environment_choices(ENVIRONMENTS)
    # The SDK's environments that say what they can do; agent-capable first.
    assert choices == [
        (
            "ai-agents-env — AI Agents Environment, 0.048 credits a minute",
            "ai-agents-env",
            "",
        ),
        (
            "kaggle-cpu — Kaggle notebook sessions, not priced",
            "kaggle-cpu",
            launch.NO_AGENT,
        ),
    ]
    # A user environment says nothing about agents: left out of the list.
    assert "eric/geospatial-analysis" not in [value for _, value, _ in choices]


def test_an_environment_that_cannot_hold_an_agent_is_refused() -> None:
    assert choose_environment(ENVIRONMENTS, can_ask=False).name == "ai-agents-env"
    with pytest.raises(CloudRefused, match="kaggle-cpu cannot launch an agent"):
        choose_environment(ENVIRONMENTS, environment="kaggle-cpu", can_ask=False)
    # A user environment says nothing of its capabilities: named, it is tried.
    named = choose_environment(
        ENVIRONMENTS, environment="eric/geospatial-analysis", can_ask=False
    )
    assert named.name == "eric/geospatial-analysis"
    with pytest.raises(CloudRefused, match="no environment named"):
        choose_environment(ENVIRONMENTS, environment="nope", can_ask=False)
    with pytest.raises(CloudRefused, match="No environment that can launch"):
        choose_environment(ENVIRONMENTS[1:], can_ask=False)


def test_a_runtime_is_found_by_name_or_refused_in_a_sentence() -> None:
    offer = CloudOffer(
        [],
        [
            Running("kernel-1", "python-cpu-env"),
            Running("runtime-9", "ai-agents-env", uid="01K9"),
        ],
    )
    assert find_running(offer, "runtime-9").runtime_name == "runtime-9"
    assert find_running(offer, "01K9").runtime_name == "runtime-9"
    with pytest.raises(CloudRefused, match="holds no agent"):
        find_running(offer, "kernel-1")
    with pytest.raises(CloudRefused, match=r"running: runtime-9\)"):
        find_running(offer, "runtime-0")


# --- launching and attaching ----------------------------------------------------


def test_attaching_launches_nothing_and_makes_the_agent_the_chosen_one(
    datalayer: FakeDatalayer, monkeypatch: pytest.MonkeyPatch
) -> None:
    datalayer.running = [Running("runtime-9", "ai-agents-env")]
    asked: List[tuple] = []
    monkeypatch.setattr(
        launch,
        "ensure_agentspec",
        lambda url, spec, runtime_name, token: _kept(asked, (spec, token), True),
    )
    back = launch.launch_cloud("crawler", runtime="runtime-9", can_ask=False)
    try:
        assert datalayer.created == {}
        assert back.attached and back.agent_spec_id == "crawler"
        assert asked == [("crawler", "the-token")]
        assert back.label == "runtime-9 on Datalayer (ai-agents-env)"
    finally:
        back.relay.stop()

    with pytest.raises(CloudRefused, match="No agent runtime named runtime-0"):
        launch.launch_cloud("crawler", runtime="runtime-0", can_ask=False)


def test_a_new_runtime_asks_for_an_environment_never_an_agentspec(
    datalayer: FakeDatalayer, monkeypatch: pytest.MonkeyPatch
) -> None:
    asked: List[str] = []

    def select(question: str, choices: list, default: str) -> str:
        asked.append(question)
        return default

    monkeypatch.setattr(launch, "_select", select)
    monkeypatch.setattr(launch, "_text", lambda q, default, validate: "10")
    notes: List[str] = []
    started = launch.launch_cloud(
        None, reconnect=False, can_ask=True, note=notes.append
    )
    try:
        assert asked == [
            "In which environment? (only those that can launch an agent can be picked)"
        ]
        assert datalayer.created == {
            "environment": "ai-agents-env",
            "time_reservation": 10,
            "agent_spec_id": "example-simple",
        }
        # The default agent, said once, with how to choose another.
        assert len(notes) == 1 and "example-simple" in notes[0] and "-a" in notes[0]
        assert started.agent_spec_id == "example-simple"
        assert started.credits == pytest.approx(0.0008 * 60 * 10)
    finally:
        started.relay.stop()

    # -a names the agent, and nothing is said about a default.
    notes.clear()
    started = launch.launch_cloud(
        "crawler", minutes=5, can_ask=False, note=notes.append
    )
    try:
        assert datalayer.created["agent_spec_id"] == "crawler" and notes == []
    finally:
        started.relay.stop()


def test_refusals_launch_nothing(datalayer: FakeDatalayer) -> None:
    datalayer.credits = 0.0
    with pytest.raises(CloudRefused, match="No credits left"):
        launch.launch_cloud("crawler", can_ask=False)
    assert datalayer.created == {}

    datalayer.credits = 100.0
    datalayer.refuse = (
        "Runtime creation failed (environment='ai-agents-env'): pool empty"
    )
    with pytest.raises(
        CloudRefused, match="Datalayer refused the launch: .*pool empty"
    ):
        launch.launch_cloud("crawler", can_ask=False)


def test_an_agentspec_the_runtime_lacks_stops_the_runtime_in_a_sentence(
    datalayer: FakeDatalayer, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(launch, "speak_ag_ui", lambda url, timeout=120.0: False)
    monkeypatch.setattr(launch, "library_has", lambda url, spec: False)
    with pytest.raises(CloudRefused, match="not available on runtime-1.*was stopped"):
        launch.launch_cloud("brand-new-spec", can_ask=False)
    assert datalayer.stopped == ["runtime-1"]


def test_a_runtime_gone_back_to_is_left_running_without_somebody_to_ask() -> None:
    client = FakeDatalayer()
    relay = Relay(target="http://127.0.0.1:1", token="t")
    attached = CloudLaunch(
        "runtime-9",
        "ai-agents-env",
        10,
        "https://r1.example/jupyter/server/p/runtime-9",
        relay,
        client,
        "the-jupyter-token",
        attached=True,
    )
    said: List[str] = []
    finish_cloud(attached, can_ask=False, say=said.append)
    assert client.stopped == [] and "loop agents terminate runtime-9" in said[-1]


# --- a cloud runtime, behind the relay --------------------------------------------


class FakeRuntime:
    """A cloud agent runtime: what the slash commands read, and who asked."""

    def __init__(self, spec_id: str = "example-simple", library: tuple = ()):
        self.spec_id = spec_id
        self.library = set(library) | {spec_id}
        self.seen: List[tuple[str, str, Optional[str]]] = []
        self.configured: List[dict] = []
        self.models_asked_for: List[Optional[str]] = []
        self.server: Any = None
        self.url = ""

    def app(self) -> Any:
        from starlette.applications import Starlette
        from starlette.requests import Request
        from starlette.responses import JSONResponse
        from starlette.routing import Route

        prefix = "/agent-runtimes/pool/runtime-9"
        runtime = self

        async def route(request: Request) -> JSONResponse:
            path = request.url.path[len(prefix) :]
            runtime.seen.append(
                (request.method, path, request.headers.get("authorization"))
            )
            if path == "/health":
                return JSONResponse({"status": "ok"})
            if path == "/health/startup":
                return JSONResponse(
                    {"agent": {"id": "default", "model": "bedrock:claude"}}
                )
            if path == "/api/v1/configure/models":
                runtime.models_asked_for.append(request.query_params.get("agent_id"))
                return JSONResponse(
                    {
                        "source": "ai-inference",
                        "note": "ai-inference at https://x/api/ai-inference/v1 serves bedrock:us.anthropic.claude-sonnet-4-6.",
                        "models": [
                            {
                                "id": "bedrock:us.anthropic.claude-sonnet-4-6",
                                "name": "Claude Sonnet 4.6",
                                "available": True,
                            },
                            {
                                "id": "openai:gpt-5",
                                "name": "GPT-5",
                                "available": False,
                                "missing_env_vars": ["OPENAI_API_KEY"],
                            },
                        ],
                        "decision_models": [],
                        "decisions_note": "Answers a decision's typed questions.",
                    }
                )
            if path == "/api/v1/configure/skills":
                return JSONResponse(
                    {
                        "skills": [
                            {"id": "pdf", "name": "PDF", "description": "Read PDFs"}
                        ]
                    }
                )
            if path == "/api/v1/configure/agents/default/spec":
                return JSONResponse(
                    {"agent_spec_id": runtime.spec_id, "skills": ["pdf"]}
                )
            if path == "/api/v1/agents":
                return JSONResponse({"agents": [{"id": "default"}]})
            if path == "/api/v1/agents/default":
                return JSONResponse(
                    {
                        "toolsets": {
                            "tools": [{"name": "cloud_search", "description": "x"}]
                        }
                    }
                )
            if path == "/api/v1/mcp/servers":
                return JSONResponse(
                    [
                        {
                            "id": "tavily",
                            "name": "Tavily",
                            "is_running": True,
                            "tools": [],
                        }
                    ]
                )
            if path.startswith("/api/v1/agents/library/"):
                spec = path.rsplit("/", 1)[-1]
                if spec in runtime.library:
                    return JSONResponse({"id": spec})
                return JSONResponse({"detail": "not found"}, status_code=404)
            if path == "/api/v1/agents/configure-from-spec":
                body = await request.json()
                runtime.configured.append(body)
                if body["agent_spec_id"] not in runtime.library:
                    return JSONResponse({"detail": "not found"}, status_code=404)
                runtime.spec_id = body["agent_spec_id"]
                return JSONResponse({"ok": True})
            return JSONResponse({"detail": f"no route {path}"}, status_code=404)

        return Starlette(
            routes=[Route("/{path:path}", route, methods=["GET", "POST", "PUT"])]
        )

    def start(self) -> "FakeRuntime":
        import uvicorn

        port = launch._free_port()
        self.server = uvicorn.Server(
            uvicorn.Config(self.app(), host="127.0.0.1", port=port, log_level="error")
        )
        threading.Thread(target=self.server.run, daemon=True).start()
        deadline = time.monotonic() + 10
        while not self.server.started and time.monotonic() < deadline:
            time.sleep(0.05)
        self.url = f"http://127.0.0.1:{port}/agent-runtimes/pool/runtime-9"
        return self

    def stop(self) -> None:
        self.server.should_exit = True


@pytest.fixture
def cloud_runtime() -> Any:
    runtime = FakeRuntime(library=("crawler",)).start()
    relay = Relay(target=runtime.url, token="the-token").start()
    yield runtime, relay
    relay.stop()
    runtime.stop()


def test_going_back_with_another_agentspec_reconfigures_the_runtimes_agent(
    cloud_runtime: Any,
) -> None:
    runtime, relay = cloud_runtime
    assert not ensure_agentspec(
        relay.url, "example-simple", runtime_name="runtime-9", token="the-token"
    )
    assert runtime.configured == []
    assert ensure_agentspec(
        relay.url, "crawler", runtime_name="runtime-9", token="the-token"
    )
    assert runtime.configured == [
        {"agent_spec_id": "crawler", "transport": "ag-ui", "user_token": "the-token"}
    ]
    with pytest.raises(CloudRefused, match="agentspec nope is not available on"):
        ensure_agentspec(relay.url, "nope", runtime_name="runtime-9", token="t")


def test_the_relay_says_when_the_cloud_runtime_does_not_answer() -> None:
    relay = Relay(target=f"http://127.0.0.1:{launch._free_port()}", token="t").start()
    try:
        response = httpx.get(f"{relay.url}/api/v1/configure/models")
        assert response.status_code == 502
        assert response.json()["detail"].startswith(launch.RUNTIME_SILENT)
    finally:
        relay.stop()


def _tux(server_url: str) -> Any:
    from rich.console import Console

    from agent_runtimes.chat.tux import CliTux

    tux = CliTux(
        agent_url=f"{server_url}/api/v1/ag-ui/default/",
        server_url=server_url,
        agent_id="default",
        where="runtime-9 on Datalayer (ai-agents-env)",
    )
    tux.console = Console(record=True, width=160, color_system=None)
    return tux


def _said(tux: Any) -> str:
    return tux.console.export_text()


def test_the_slash_commands_read_the_cloud_runtime_as_the_person(
    cloud_runtime: Any,
) -> None:
    runtime, relay = cloud_runtime
    tux = _tux(relay.url)

    async def run() -> None:
        for command in ("/models", "/skills", "/tools", "/mcp"):
            assert await tux.handle_command(command) == ""

    asyncio.run(run())
    said = _said(tux)
    assert "Models on runtime-9 on Datalayer (ai-agents-env) (2)" in said
    assert "bedrock:us.anthropic.claude-sonnet-4-6" in said
    assert "missing OPENAI_API_KEY" in said
    # What the runtime said of its models, and for the session's agent.
    assert "serves bedrock:us.anthropic.claude-sonnet-4-6." in said
    assert runtime.models_asked_for == ["default"]
    assert "pdf" in said
    assert "cloud_search" in said
    assert "Tavily" in said or "tavily" in said
    paths = {path for _, path, _ in runtime.seen}
    assert {
        "/api/v1/configure/models",
        "/api/v1/configure/skills",
        "/api/v1/agents/default",
        "/api/v1/mcp/servers",
    } <= paths
    # Every request reached the runtime with the person's token.
    assert {auth for _, _, auth in runtime.seen} == {"Bearer the-token"}


def test_a_model_the_cloud_runtime_cannot_run_is_refused_there(
    cloud_runtime: Any,
) -> None:
    runtime, relay = cloud_runtime
    tux = _tux(relay.url)
    asyncio.run(tux.handle_command("/models openai:gpt-5"))
    assert (
        "openai:gpt-5 cannot be used on runtime-9 on Datalayer (ai-agents-env) "
        "(has no OPENAI_API_KEY for it): nothing was switched." in _said(tux)
    )
    assert not any(
        path == "/api/v1/agents/configure-from-spec" for _, path, _ in runtime.seen
    )

    asyncio.run(tux.handle_command("/models bedrock:us.anthropic.claude-sonnet-4-6"))
    assert runtime.configured[-1]["agent_spec"]["model"] == (
        "bedrock:us.anthropic.claude-sonnet-4-6"
    )
    # The runtime's one agent, recreated from the agentspec it runs.
    assert runtime.configured[-1]["agent_spec_id"] == runtime.spec_id
    assert runtime.configured[-1]["agent_id"] == "default"
    # Switching on Datalayer never moves the sandbox to this machine.
    assert runtime.configured[-1]["agent_spec"].get("sandbox_variant") != "local-eval"


def test_a_cloud_runtime_that_does_not_answer_runs_no_command() -> None:
    relay = Relay(target=f"http://127.0.0.1:{launch._free_port()}", token="t").start()
    try:
        tux = _tux(relay.url)
        ran: List[str] = []
        spec = tux.commands["models"]

        async def handler(args: str) -> None:
            ran.append(args)

        object.__setattr__(spec, "handler", handler)
        asyncio.run(tux.handle_command("/models"))
        assert ran == []
        # An error: said on standard error when piped, and kept as the line's.
        assert "does not answer (status 502)" in str(tux.last_error)
        # What needs no runtime still runs.
        assert asyncio.run(tux.handle_command("/help")) == ""
    finally:
        relay.stop()


# --- the startup flow -------------------------------------------------------------


def test_where_is_asked_before_the_agentspec(monkeypatch: pytest.MonkeyPatch) -> None:
    from typer.testing import CliRunner

    from agent_runtimes.chat import cli

    order: List[str] = []
    monkeypatch.setattr(
        cli,
        "_choose_where_at_start",
        lambda local, cloud: _kept(order, f"where cloud={cloud}", CLOUD),
    )

    def launched(agent_id: Any, **kwargs: Any) -> Any:
        order.append(f"launch {agent_id} runtime={kwargs.get('runtime')}")
        raise SystemExit(0)

    monkeypatch.setattr(cli, "_launch_on_datalayer", launched)
    monkeypatch.setattr(
        cli,
        "_pick_agentspec_interactive",
        lambda cloud=False: _kept(order, "pick", "x"),
    )
    result = CliRunner().invoke(cli.app, ["--runtime", "runtime-9"])
    assert result.exit_code == 0
    # --runtime is --cloud, and no local agentspec list is shown first.
    assert order == ["where cloud=True", "launch None runtime=runtime-9"]

    result = CliRunner().invoke(cli.app, ["--runtime", "runtime-9", "--local"])
    assert result.exit_code != 0


def test_a_refusal_is_one_sentence_and_the_exit(
    datalayer: FakeDatalayer, capsys: pytest.CaptureFixture
) -> None:
    import typer

    from agent_runtimes.chat import cli

    datalayer.credits = 0.0
    with pytest.raises(typer.Exit):
        cli._launch_on_datalayer(
            "example-simple", environment=None, minutes=None, runtime=None
        )
    out = capsys.readouterr().out
    assert "Credits: 0.00 left." in out
    assert "No credits left on Datalayer" in out
    assert datalayer.created == {}


def test_on_datalayer_no_agentspec_list_is_shown(
    datalayer: FakeDatalayer,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture,
) -> None:
    from agent_runtimes.chat import cli

    def never(*args: Any, **kwargs: Any) -> str:
        raise AssertionError("no agentspec list on Datalayer")

    monkeypatch.setattr(cli, "_pick_agentspec_interactive", never)
    monkeypatch.setattr(launch, "interactive", lambda: False)
    started = cli._launch_on_datalayer(None, environment=None, minutes=5)
    try:
        out = capsys.readouterr().out
        assert "Credits: 100.00 left." in out
        assert "The runtime's agent is example-simple" in out
        assert datalayer.created["environment"] == "ai-agents-env"
    finally:
        started.relay.stop()


def test_loop_forwards_where_to_the_chat(monkeypatch: pytest.MonkeyPatch) -> None:
    from typer.testing import CliRunner

    import agent_runtimes.__main__ as main
    from agent_runtimes.chat import cli
    from agent_runtimes.loop import entrypoint

    forwarded: List[list] = []
    monkeypatch.setattr(entrypoint, "opens_workspace", lambda: True)
    monkeypatch.setattr(cli, "app", lambda args: forwarded.append(args))
    result = CliRunner().invoke(
        main.app,
        ["--runtime", "runtime-9", "-a", "crawler", "--minutes", "5", "--keep"],
    )
    assert result.exit_code == 0, result.output
    assert forwarded == [
        [
            "--agentspec-id",
            "crawler",
            "--runtime",
            "runtime-9",
            "--minutes",
            "5",
            "--keep",
        ]
    ]
