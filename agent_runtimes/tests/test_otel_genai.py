# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""GenAI spans AgentCore Evaluations reads (AC-12), and where they go (AC-13).

A pydantic-ai agent on a function model calls one tool and answers; its
spans, exported to an in-memory exporter, are read back: the scope every
one of them is under, ``gen_ai.operation.name`` on each, and the tool's
name, arguments and result. A missing attribute fails the test.
"""

from __future__ import annotations

import json
from typing import Any, Iterator

import pytest
from opentelemetry.sdk.trace import ReadableSpan
from opentelemetry.sdk.trace import TracerProvider as SDKTracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import (
    InMemorySpanExporter,
)
from pydantic_ai import Agent
from pydantic_ai.messages import (
    ModelMessage,
    ModelResponse,
    TextPart,
    ToolCallPart,
    ToolReturnPart,
)
from pydantic_ai.models.function import AgentInfo, FunctionModel

from agent_runtimes.apps import visitors
from agent_runtimes.otel import genai
from agent_runtimes.otel.genai import (
    SCOPE,
    agentcore_export_from_env,
    agentcore_span_exporter,
    enable_genai_instrumentation,
    genai_tracer_provider,
    instrumentation_settings,
)


def weather(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
    """Call the ``forecast`` tool once, then answer with what it said."""
    returned = [
        part
        for message in messages
        for part in getattr(message, "parts", [])
        if isinstance(part, ToolReturnPart)
    ]
    if not returned:
        return ModelResponse(parts=[ToolCallPart("forecast", {"city": "Paris"})])
    return ModelResponse(parts=[TextPart(f"It will be {returned[-1].content}.")])


def _agent(settings: Any) -> Agent:
    agent = Agent(FunctionModel(weather), name="forecaster")
    if settings is not None:
        agent.instrument = settings

    @agent.tool_plain
    def forecast(city: str) -> str:
        """Say the weather of a city."""
        return f"sunny in {city}"

    return agent


@pytest.fixture()
def exported() -> Iterator[tuple[SDKTracerProvider, InMemorySpanExporter]]:
    memory = InMemorySpanExporter()
    provider = SDKTracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(memory))
    yield provider, memory
    provider.shutdown()


def _by_operation(spans: tuple[ReadableSpan, ...]) -> dict[str, list[ReadableSpan]]:
    found: dict[str, list[ReadableSpan]] = {}
    for span in spans:
        operation = (span.attributes or {})["gen_ai.operation.name"]
        found.setdefault(str(operation), []).append(span)
    return found


def test_a_run_with_one_tool_call_is_three_kinds_of_spans_under_our_scope(
    exported: tuple[SDKTracerProvider, InMemorySpanExporter],
) -> None:
    provider, memory = exported
    settings = instrumentation_settings(provider, environ={})

    result = _agent(settings).run_sync("Weather in Paris?")

    assert result.output == "It will be sunny in Paris."
    spans = memory.get_finished_spans()
    assert spans
    assert {span.instrumentation_scope.name for span in spans} == {SCOPE}
    assert SCOPE.startswith("opentelemetry.instrumentation.")
    operations = _by_operation(spans)
    assert set(operations) == {"invoke_agent", "execute_tool", "chat"}
    assert len(operations["invoke_agent"]) == 1
    assert len(operations["chat"]) == 2

    (tool,) = operations["execute_tool"]
    attributes = tool.attributes or {}
    assert attributes["gen_ai.tool.name"] == "forecast"
    assert json.loads(str(attributes["gen_ai.tool.call.arguments"])) == {
        "city": "Paris"
    }
    assert attributes["gen_ai.tool.call.result"] == "sunny in Paris"

    (run,) = operations["invoke_agent"]
    assert (run.attributes or {})["gen_ai.agent.name"] == "forecaster"
    chats = operations["chat"]
    assert all("gen_ai.input.messages" in (c.attributes or {}) for c in chats)
    assert "Weather in Paris?" in str(
        (chats[0].attributes or {})["gen_ai.input.messages"]
    )
    assert all(
        "gen_ai.output.messages" in (c.attributes or {}) for c in operations["chat"]
    )


def test_content_is_not_captured_when_the_setting_says_false(
    exported: tuple[SDKTracerProvider, InMemorySpanExporter],
) -> None:
    provider, memory = exported
    settings = instrumentation_settings(
        provider,
        environ={"OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT": "false"},
    )

    _agent(settings).run_sync("Weather in Paris?")

    (tool,) = _by_operation(memory.get_finished_spans())["execute_tool"]
    attributes = tool.attributes or {}
    assert attributes["gen_ai.tool.name"] == "forecast"
    assert "gen_ai.tool.call.arguments" not in attributes
    assert "gen_ai.tool.call.result" not in attributes


def test_a_visitor_s_turn_is_never_captured(
    exported: tuple[SDKTracerProvider, InMemorySpanExporter],
) -> None:
    provider, memory = exported
    settings = instrumentation_settings(provider, environ={})
    assert settings.include_content is True

    reset = visitors.enter_visitor_run("visitor-1")
    try:
        assert settings.include_content is False
        _agent(settings).run_sync("Weather in Paris?")
    finally:
        visitors.leave_visitor_run(reset)

    spans = memory.get_finished_spans()
    (tool,) = _by_operation(spans)["execute_tool"]
    assert "gen_ai.tool.call.arguments" not in (tool.attributes or {})
    written = json.dumps([dict(span.attributes or {}) for span in spans])
    assert "Weather in Paris?" not in written
    assert "sunny in Paris" not in written
    assert settings.include_content is True


def test_every_agent_is_instrumented_once_switched_on(
    exported: tuple[SDKTracerProvider, InMemorySpanExporter],
) -> None:
    provider, memory = exported
    before = Agent._instrument_default
    try:
        enable_genai_instrumentation(provider, environ={})
        _agent(None).run_sync("Weather in Paris?")
    finally:
        Agent.instrument_all(before)
    assert set(_by_operation(memory.get_finished_spans())) == {
        "invoke_agent",
        "execute_tool",
        "chat",
    }


# --- AC-13: AgentCore Observability -----------------------------------------------------


def test_the_endpoint_agentcore_sets_is_read_from_the_otlp_variables() -> None:
    assert agentcore_export_from_env({}) is None
    traces = agentcore_export_from_env(
        {"OTEL_EXPORTER_OTLP_TRACES_ENDPOINT": "http://collector.local/v1/traces"}
    )
    assert traces is not None and traces.endpoint == "http://collector.local/v1/traces"
    assert traces.sigv4_region is None
    general = agentcore_export_from_env(
        {"OTEL_EXPORTER_OTLP_ENDPOINT": "http://collector.local/"}
    )
    assert general is not None
    assert general.endpoint == "http://collector.local/v1/traces"
    assert (
        agentcore_export_from_env(
            {
                "OTEL_EXPORTER_OTLP_ENDPOINT": "http://collector.local",
                "OTEL_TRACES_EXPORTER": "none",
            }
        )
        is None
    )


def test_with_observability_on_and_no_endpoint_the_spans_go_to_x_ray_signed() -> None:
    xray = agentcore_export_from_env(
        {"AGENT_OBSERVABILITY_ENABLED": "true", "AWS_REGION": "us-west-2"}
    )
    assert xray is not None
    assert xray.endpoint == "https://xray.us-west-2.amazonaws.com/v1/traces"
    assert xray.sigv4_region == "us-west-2"
    with pytest.raises(ValueError, match="AWS_REGION does not say"):
        agentcore_export_from_env({"AGENT_OBSERVABILITY_ENABLED": "true"})


def test_only_http_protobuf_is_spoken() -> None:
    with pytest.raises(ValueError, match="http/protobuf"):
        agentcore_export_from_env(
            {
                "OTEL_EXPORTER_OTLP_ENDPOINT": "http://collector.local",
                "OTEL_EXPORTER_OTLP_PROTOCOL": "grpc",
            }
        )


def test_the_exporter_takes_agentcore_s_headers_and_signs_for_x_ray(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "OTEL_EXPORTER_OTLP_TRACES_HEADERS",
        "x-aws-log-group=/aws/bedrock-agentcore/runtimes/seat,x-aws-log-stream=spans",
    )
    export = agentcore_export_from_env(
        {"OTEL_EXPORTER_OTLP_ENDPOINT": "http://collector.local"}
    )
    assert export is not None
    exporter: Any = agentcore_span_exporter(export)
    assert exporter._endpoint == "http://collector.local/v1/traces"
    assert exporter._client._headers["x-aws-log-group"] == (
        "/aws/bedrock-agentcore/runtimes/seat"
    )

    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "AKIDEXAMPLE")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "secret")
    xray = agentcore_export_from_env(
        {"AGENT_OBSERVABILITY_ENABLED": "true", "AWS_REGION": "eu-west-1"}
    )
    assert xray is not None
    signed: Any = agentcore_span_exporter(xray)
    session = signed._client._transport._session
    assert type(session).__name__ == "SigV4Session"

    sent: dict[str, Any] = {}

    def capture(self: Any, method: str, url: str, *args: Any, **kwargs: Any) -> Any:
        sent.update(kwargs.get("headers") or {})
        return None

    import requests

    monkeypatch.setattr(requests.Session, "request", capture)
    session.request("POST", xray.endpoint, data=b"spans", headers={"a": "b"})
    assert sent["Authorization"].startswith("AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/")
    assert "/eu-west-1/xray/aws4_request" in sent["Authorization"]


def test_on_agentcore_the_spans_reach_both_exporters() -> None:
    datalayer = InMemorySpanExporter()
    process = SDKTracerProvider()
    process.add_span_processor(SimpleSpanProcessor(datalayer))
    agentcore = InMemorySpanExporter()

    assert (
        genai_tracer_provider(
            {"OTEL_EXPORTER_OTLP_ENDPOINT": "http://collector.local"},
            exporter=agentcore,
        )
        is None
    )
    provider = genai_tracer_provider(
        {
            "AGENT_RUNTIMES_TARGET": "agentcore",
            "OTEL_EXPORTER_OTLP_ENDPOINT": "http://collector.local",
        },
        exporter=agentcore,
        provider_of=lambda: process,
    )
    assert provider is not None
    _agent(instrumentation_settings(provider, environ={})).run_sync("Weather?")
    provider.force_flush()

    to_agentcore = agentcore.get_finished_spans()
    to_datalayer = datalayer.get_finished_spans()
    assert {s.name for s in to_agentcore} == {s.name for s in to_datalayer}
    assert len(to_agentcore) == len(to_datalayer) == 4
    assert {s.instrumentation_scope.name for s in to_agentcore} == {SCOPE}
    provider.shutdown()


def test_on_agentcore_every_span_of_an_invocation_carries_its_session() -> None:
    """AgentCore Evaluations judges a session by the spans carrying its session.id."""
    agentcore = InMemorySpanExporter()
    provider = genai_tracer_provider(
        {
            "AGENT_RUNTIMES_TARGET": "agentcore",
            "OTEL_EXPORTER_OTLP_ENDPOINT": "http://collector.local",
        },
        exporter=agentcore,
        provider_of=SDKTracerProvider,
    )
    assert provider is not None
    session = "datalayer-session-padded-01m74zgt47dgz67933p9efkg40"
    with genai.use_session_id(session):
        _agent(instrumentation_settings(provider, environ={})).run_sync("Weather?")
    _agent(instrumentation_settings(provider, environ={})).run_sync("Weather?")
    provider.force_flush()

    spans = agentcore.get_finished_spans()
    assert len(spans) == 8
    assert [s.attributes.get("session.id") for s in spans[:4]] == [session] * 4
    assert all("session.id" not in s.attributes for s in spans[4:])
    provider.shutdown()


def test_without_an_endpoint_on_agentcore_there_is_one_exporter() -> None:
    assert genai_tracer_provider({"AGENT_RUNTIMES_TARGET": "agentcore"}) is None
    assert genai.content_setting({}) is True
