# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Credentials are never shown to the model (LOOP R-19).

A sentinel secret is given to the runtime the ways a real one is — an
environment variable, a configure's ``env_vars``, an MCP server's expanded
header, a deployment's user secret, the sandbox's token — and every path it
could take to the model, to the record, to a span or to an error sentence is
scanned for it: none holds it.
"""

import asyncio
import json
import logging
import traceback
import uuid
from typing import Any, Dict, List

import pytest
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import (
    InMemorySpanExporter,
)
from pydantic_ai import Agent, InstrumentationSettings, ModelRetry
from pydantic_ai.capabilities import Instrumentation
from pydantic_ai.messages import (
    ModelMessage,
    ModelMessagesTypeAdapter,
    ModelResponse,
    TextPart,
    ToolCallPart,
)
from pydantic_ai.models.function import AgentInfo, FunctionModel

from agent_runtimes.guardrails import credentials
from agent_runtimes.guardrails.credentials import (
    HELD,
    WITHHELD,
    CredentialsWithheldCapability,
    ToolErrorWithheld,
    credentials_in,
    credentials_withheld,
    hold,
    redact,
    release,
)
from agent_runtimes.tests.test_a2a_worker_pause_and_steer import (  # noqa: F401 - a fixture
    state,
)
from agent_runtimes.tests.test_agents_create_integration import (  # noqa: F401 - a fixture
    creation_spy,
)

#: Opaque, as most secrets are: no pattern of a credential finds it.
SENTINEL = "r19-sentinel-" + uuid.uuid4().hex
#: What looks like one, held by nobody: found by its shape.
SHAPED = "ghp_" + "A1b2C3d4E5" * 4


@pytest.fixture()
def secret(monkeypatch: pytest.MonkeyPatch):
    """The sentinel, as the value of a secret's environment variable.

    Yields
    ------
    str
        The sentinel.
    """
    monkeypatch.setenv("R19_PROBE_TOKEN", SENTINEL)
    yield SENTINEL
    release(SENTINEL)


@pytest.fixture()
def held():
    """The sentinel, held by the runtime though no variable names it.

    Yields
    ------
    str
        The sentinel.
    """
    hold(SENTINEL)
    yield SENTINEL
    release(SENTINEL)


def _clean(text: str) -> None:
    assert SENTINEL not in text
    assert SHAPED not in text


# --- what a secret is --------------------------------------------------------------


@pytest.mark.parametrize(
    "name",
    [
        "DATALAYER_API_KEY",
        "EARTHDATA_TOKEN",
        "TAVILY_API_KEY",
        "GITHUB_PERSONAL_ACCESS_TOKEN",
        "SLACK_BOT_TOKEN",
        "AWS_SECRET_ACCESS_KEY",
        "ODOO_PASSWORD",
        "GOOGLE_OAUTH_CLIENT_SECRET",
        "DATALAYER_APP_USER_SECRET_01KDEP",
        "JUPYTER_TOKEN",
        "OPENAI_APIKEY",
    ],
)
def test_a_variable_named_as_a_secret_is_one(name: str) -> None:
    assert credentials.is_secret_name(name)


@pytest.mark.parametrize(
    "name",
    [
        "DATALAYER_RUN_URL",
        "AWS_ACCESS_KEY_ID",
        "EARTHDATA_USERNAME",
        "DATALAYER_JWT_CACHE_VALIDATE",
        "GOOGLE_APPLICATION_CREDENTIALS_FILE",
        "HOME",
        "PATH",
    ],
)
def test_a_variable_that_says_where_or_who_is_not(name: str) -> None:
    assert not credentials.is_secret_name(name)


def test_a_held_secret_is_withheld_by_its_value_and_said_as_one(secret: str) -> None:
    said = redact(f"curl -H 'Authorization: Bearer {secret}' then {SHAPED}")
    _clean(said)
    assert said.count(WITHHELD) == 2
    assert credentials_in({"header": secret}) == [HELD]
    assert credentials_in(SHAPED) == ["a GitHub token"]


def test_a_short_value_or_a_path_is_never_withheld(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("R19_SHORT_TOKEN", "true")
    monkeypatch.setenv("R19_KEY", "/var/run/secrets/key.json")
    assert redact("true at /var/run/secrets/key.json") == (
        "true at /var/run/secrets/key.json"
    )


# --- what the model reads --------------------------------------------------------------


def _scanned_agent(
    tool_result: Any, exporter: InMemorySpanExporter
) -> tuple[Agent, List[tuple[List[ModelMessage], AgentInfo]]]:
    seen: List[tuple[List[ModelMessage], AgentInfo]] = []

    def model(messages: List[ModelMessage], info: AgentInfo) -> ModelResponse:
        seen.append((list(messages), info))
        if len(seen) == 1:
            return ModelResponse(
                parts=[
                    ToolCallPart("lookup", {}, tool_call_id="c1"),
                    ToolCallPart("flaky", {}, tool_call_id="c2"),
                ]
            )
        return ModelResponse(parts=[TextPart("done")])

    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    agent = Agent(
        FunctionModel(model),
        instructions=f"Call the API with {SENTINEL}.",
        capabilities=[
            Instrumentation(settings=InstrumentationSettings(tracer_provider=provider)),
            *credentials_withheld([]),
        ],
    )

    @agent.tool_plain(description=f"Reads the API, signed with {SENTINEL}.")
    def lookup() -> Any:
        return tool_result

    @agent.tool_plain
    def flaky() -> str:
        raise ModelRetry(f"401: Authorization: Bearer {SENTINEL} was refused")

    return agent, seen


def test_nothing_the_model_reads_or_the_run_keeps_holds_a_credential(
    secret: str,
) -> None:
    """Its instructions, the prompt, a tool's description, its result and a
    retry's sentence: none reaches the model, the history or a span."""
    exporter = InMemorySpanExporter()
    agent, seen = _scanned_agent(
        {"echo": f"token={secret}", "found": [SHAPED, 3]}, exporter
    )
    result = asyncio.run(agent.run(f"My key is {secret}; look it up."))
    assert result.output == "done"
    assert len(seen) == 2
    for messages, info in seen:
        _clean(ModelMessagesTypeAdapter.dump_json(messages).decode())
        _clean(repr(info.function_tools))
        _clean(str(info.instructions))
    # What came back reached the model, withheld: it was not dropped.
    returned = json.loads(ModelMessagesTypeAdapter.dump_json(seen[1][0]))
    said = json.dumps(returned)
    assert WITHHELD in said and '"found"' in said
    # What the run keeps, and every span of it.
    _clean(ModelMessagesTypeAdapter.dump_json(result.all_messages()).decode())
    spans = exporter.get_finished_spans()
    assert spans
    for span in spans:
        _clean(json.dumps(dict(span.attributes or {}), default=str))
        for event in span.events:
            _clean(json.dumps(dict(event.attributes or {}), default=str))


def test_a_tool_s_error_is_said_with_its_credential_withheld(held: str) -> None:
    """A tool that fails with the header it sent: the run fails, its sentence
    and its traceback without the secret, the original not chained."""

    def model(messages: List[ModelMessage], info: AgentInfo) -> ModelResponse:
        return ModelResponse(parts=[ToolCallPart("connect", {}, tool_call_id="c1")])

    agent = Agent(FunctionModel(model), capabilities=credentials_withheld([]))

    @agent.tool_plain
    def connect() -> str:
        raise RuntimeError(f"spawn failed: npx mcp-remote --header Bearer {held}")

    with pytest.raises(ToolErrorWithheld) as caught:
        asyncio.run(agent.run("Connect."))
    assert caught.value.kind == "RuntimeError"
    _clean(str(caught.value))
    _clean("".join(traceback.format_exception(caught.value)))
    assert WITHHELD in str(caught.value)


def test_every_agent_the_runtime_makes_withholds_credentials_last(
    creation_spy: Dict[str, Any],  # noqa: F811 - the fixture
) -> None:
    """The create route's agent, an application's (the terminal's builder),
    and a subagent: each has the capability once, last."""
    from agent_runtimes.loop.apps.agent import app_capabilities
    from agent_runtimes.loop.apps.loading import load_app
    from agent_runtimes.loop.apps.record import AppRecorder
    from agent_runtimes.routes.agents import CreateAgentRequest, create_agent
    from agent_runtimes.subagents.capability import _build_subagent_capabilities
    from agent_runtimes.tests.test_agents_create_integration import _DummyRequest

    asyncio.run(
        create_agent(
            CreateAgentRequest(name="r19-plain", transport="ag-ui"), _DummyRequest()
        )
    )
    created = list(creation_spy["pydantic_kwargs"]["capabilities"])
    assert isinstance(created[-1], CredentialsWithheldCapability)
    assert sum(isinstance(c, CredentialsWithheldCapability) for c in created) == 1

    app = load_app(APP)
    built = app_capabilities(app, recorder=AppRecorder(app=app), agent_id="r19")
    assert isinstance(built[-1], CredentialsWithheldCapability)
    assert isinstance(
        _build_subagent_capabilities("test")[-1], CredentialsWithheldCapability
    )
    again = credentials_withheld([*built, CredentialsWithheldCapability()])
    assert sum(isinstance(c, CredentialsWithheldCapability) for c in again) == 1


APP = {
    "schema": "loop.app/v1",
    "id": "r19-probe",
    "name": "R-19 probe",
    "kind": "chat",
    "agent": "jupyter-data-analyst:0.0.1",
    "goal": "Answer questions.",
}


# --- MCP servers ------------------------------------------------------------------------


def test_an_mcp_config_keeps_its_placeholders_where_the_routes_answer_it(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from agent_runtimes.mcp import config_mcp_servers
    from agent_runtimes.mcp.lifecycle import MCPLifecycleManager

    monkeypatch.setenv("R19_HEADER_VALUE", SENTINEL)
    user = {
        "command": "npx",
        "args": ["mcp-remote", "--header", "Authorization: Bearer ${R19_HEADER_VALUE}"],
        "env": {"R19_API_KEY": "${R19_HEADER_VALUE}"},
    }
    merged = MCPLifecycleManager().get_merged_server_config("r19", user_config=user)
    assert merged is not None
    _clean(merged.model_dump_json())
    assert "${R19_HEADER_VALUE}" in merged.args[2]
    monkeypatch.setattr(
        config_mcp_servers, "load_mcp_config", lambda: {"mcpServers": {"r19": user}}
    )
    _clean(json.dumps(config_mcp_servers.get_mcp_servers_from_config()))


def test_an_mcp_server_that_fails_with_its_command_line_says_it_withheld(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """The header is expanded from a variable no name says is a secret: the
    header holds it, and the failure, its log and the routes' status do not."""
    import fastmcp.client.transports as transports

    from agent_runtimes.mcp.lifecycle import MCPLifecycleManager
    from agent_runtimes.types import MCPServer

    class _Echoing:
        def __init__(self, command: str, args: List[str], env: Dict[str, str]):
            raise RuntimeError(f"cannot spawn {command} {' '.join(args)}")

    monkeypatch.setattr(transports, "StdioTransport", _Echoing)
    manager = MCPLifecycleManager()
    config = MCPServer(
        id="r19-remote",
        name="R-19 remote",
        command="npx",
        args=["mcp-remote", "--header", "Authorization: Bearer ${R19_HEADER_VALUE}"],
        transport="stdio",
        enabled=True,
        tools=[],
    )
    try:
        with caplog.at_level(logging.DEBUG):
            started = asyncio.run(
                manager.start_server(
                    "r19-remote", config, extra_env={"R19_HEADER_VALUE": SENTINEL}
                )
            )
        assert started is None
        failure = manager.get_failed_servers()["r19-remote"]
        assert "cannot spawn" in failure and WITHHELD in failure
        _clean(failure)
        _clean(json.dumps(manager.get_all_servers_status(), default=str))
        _clean(caplog.text)
        # Held from then on: wherever else it would be shown.
        assert redact(SENTINEL) == WITHHELD
    finally:
        release(SENTINEL)


def test_the_config_toolsets_info_withholds_an_argument_whole(
    monkeypatch: pytest.MonkeyPatch, held: str
) -> None:
    from agent_runtimes.mcp import toolsets

    long_token = "Z" * 64

    class _Server:
        command = "npx"
        args = ["mcp-remote", f"Authorization: Bearer {held}", long_token]

    class _Instance:
        server_id = "r19"
        pydantic_server = _Server()

    class _Manager:
        def get_all_running_servers(self) -> List[Any]:
            return [_Instance()]

    monkeypatch.setattr(toolsets, "get_mcp_lifecycle_manager", lambda: _Manager())
    [info] = toolsets.get_config_mcp_toolsets_info()
    said = json.dumps(info)
    _clean(said)
    assert long_token[:10] not in said
    assert info["args"][0] == "mcp-remote"


# --- the secrets the runtime is given ----------------------------------------------------


def test_the_secrets_given_to_the_runtime_are_held() -> None:
    from agent_runtimes.loop.apps.host_user import use_user_secret
    from agent_runtimes.routes.agent_node import set_runtime_credentials
    from agent_runtimes.services.code_sandbox_manager import CodeSandboxManager

    given = [SENTINEL + "-host", SENTINEL + "-node", SENTINEL + "-jupyter"]
    try:
        use_user_secret("dep-r19", given[0])
        set_runtime_credentials(given[1], None)
        CodeSandboxManager().configure(
            variant="jupyter-server",
            jupyter_url=f"http://127.0.0.1:1/?token={given[2]}",
            env_vars={"R19_SANDBOX_TOKEN": SENTINEL},
        )
        _clean(redact(" ".join(given)))
        assert redact(given[0]) == WITHHELD
    finally:
        use_user_secret("dep-r19", None)
        set_runtime_credentials(None, None)
        for value in [*given, SENTINEL]:
            release(value)
    assert redact(given[0]) == given[0]


# --- what is kept, shown and said ---------------------------------------------------------


def test_the_record_keeps_no_credential_whoever_writes_the_entry(secret: str) -> None:
    from agent_runtimes.loop.apps.loading import load_app
    from agent_runtimes.loop.apps.record import AppRecorder

    recorder = AppRecorder(
        app=load_app({**APP, "record": {"include": ["actions", "conversations"]}})
    )
    recorder.start("s-r19")
    recorder.add(
        "tool_call",
        f"connect called with {secret}",
        {"tool": "connect", "arguments": {"header": f"Bearer {secret}"}, "n": 2},
    )
    entries = recorder._pending["s-r19"]
    assert [e["kind"] for e in entries] == ["session", "tool_call"]
    _clean(json.dumps(entries, default=str))
    assert entries[1]["payload"]["n"] == 2


def test_a_step_is_shown_with_its_credential_withheld(secret: str) -> None:
    from datetime import datetime, timezone

    from agent_runtimes.loop.apps.session import Step, shown_step

    step = Step(
        id="st",
        session_id="s",
        name="Fetch",
        kind="tool",
        parent_id=None,
        input={"token": secret},
        output=[f"echo {secret}"],
        started_at=datetime.now(timezone.utc),
        error=f"401 for {secret}",
    )
    shown = shown_step(step)
    _clean(repr(shown))
    assert shown.output == [f"echo {WITHHELD}"]


def test_the_stage_s_span_of_a_tool_call_holds_no_credential(secret: str) -> None:
    from agent_runtimes.loop.apps.loading import load_app
    from agent_runtimes.loop.scenes.stage import Recording, StageMember, _SpanRecorder

    recording = Recording()
    recorder = _SpanRecorder(
        app=load_app(APP),
        recording=recording,
        member=StageMember(id="m", name="M"),
        ask_tools=frozenset(),
    )
    recorder.add(
        "tool_call",
        "connect called",
        {"tool": "connect", "arguments": {"key": secret}, "error": f"no {secret}"},
    )
    _clean(json.dumps(recording.spans, default=str))
    assert recording.spans


def test_a_turn_that_failed_is_said_without_the_credential(
    secret: str, caplog: pytest.LogCaptureFixture
) -> None:
    from agent_runtimes.loop.apps import sessions
    from agent_runtimes.loop.apps.callers import Caller
    from agent_runtimes.loop.apps.loading import load_app
    from agent_runtimes.loop.apps.record import AppRecorder

    async def nothing(_body: Any = None) -> None:
        return None

    async def turn() -> List[str]:
        app = load_app(APP)
        live = sessions.LiveSession(
            uid="session-r19",
            agent_id="r19-probe",
            app=app,
            instance={},
            opened_by=Caller(kind="person", uid="ada"),
            acts_as={"kind": "person", "uid": "ada"},
            recorder=AppRecorder(app=app, send=nothing),
        )

        async def work() -> None:
            raise RuntimeError(f"Spacer said 401 to Bearer {secret}")

        return [chunk async for chunk in live._start_turn(work, wraps_run=True)]

    with caplog.at_level(logging.ERROR):
        streamed = "".join(asyncio.run(turn()))
    assert "RUN_ERROR" in streamed and "The turn failed: Spacer said 401" in streamed
    _clean(streamed)
    _clean(caplog.text)


def test_an_a2a_task_that_failed_says_why_without_the_credential(
    secret: str,
    state: Any,  # noqa: F811 - the fixture
    caplog: pytest.LogCaptureFixture,
) -> None:
    from agent_runtimes.tests.test_a2a_worker_pause_and_steer import (
        _agent,
        _final_status,
        _message,
        _run,
    )

    async def script(prompt: str, context: Any) -> Any:
        raise RuntimeError(f"the gateway refused Bearer {secret}")
        yield  # pragma: no cover - a generator

    with caplog.at_level(logging.ERROR):
        _, events = asyncio.run(_run(state, _agent(script), _message("Go")))
    status = _final_status(events)
    assert status["state"] == "failed"
    said = json.dumps(status, default=str)
    assert "the gateway refused Bearer" in said and WITHHELD in said
    _clean(json.dumps(events, default=str))
    _clean(caplog.text)
