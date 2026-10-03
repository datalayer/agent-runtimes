# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application's checks, executed (LOOP R-06): built-ins, Guards and Gates."""

import json
from typing import Any

import pytest
from pydantic_ai import Agent
from pydantic_ai.messages import (
    ModelMessage,
    ModelResponse,
    PartDeltaEvent,
    PartStartEvent,
    TextPart,
    TextPartDelta,
    ToolCallPart,
)
from pydantic_ai.models.function import AgentInfo, DeltaToolCall, FunctionModel

from agent_runtimes.loop.apps.guards import (
    AppCheckBlockedError,
    AppChecks,
    AppChecksCapability,
    credentials_in,
    denied_fields_in,
    holds,
    redact,
)
from agent_runtimes.loop.apps.rules import Decision
from agent_runtimes.types import AppSpec

AWS = "AKIA" + "ABCDEFGHIJKLMNOP"


def app(**checks: Any) -> AppSpec:
    return AppSpec.model_validate(
        {
            "id": "desk",
            "name": "Desk",
            "kind": "chat",
            "agent": "cog-crawler:0.0.1",
            "checks": checks,
        }
    )


@pytest.mark.parametrize(
    "condition, signals, expected",
    [
        ("always", {}, True),
        ("tool_violation", {"tool_violation": True}, True),
        ("tool_violation", {"tool_violation": False}, False),
        ("tool_violation", {}, None),
        ("confidence < 0.80", {"confidence": 0.5}, True),
        ("confidence < 0.80", {"confidence": 0.9}, False),
        (
            "schema_valid == false or unsupported_claims > 0",
            {"schema_valid": False},
            True,
        ),
        (
            "schema_valid == false or unsupported_claims > 0",
            {"schema_valid": True},
            None,
        ),
        ("a or b", {"a": False, "b": False}, False),
        ("a and b", {"a": True, "b": False}, False),
    ],
)
def test_a_gate_reads_its_signals_as_the_catalogue_writes_them(
    condition, signals, expected
):
    assert holds(condition, signals) is expected


def test_credentials_are_found_and_ordinary_text_is_not():
    assert credentials_in({"q": f"key {AWS}"}) == ["an AWS access key"]
    assert credentials_in("-----BEGIN RSA PRIVATE KEY-----\n...") == ["a private key"]
    assert credentials_in("sk-" + "a" * 30) == ["an API key"]
    assert credentials_in("The weather in Brussels, with skies and keys.") == []
    assert denied_fields_in(
        {"user": {"Password": "x", "name": "y"}}, ["*Password*"]
    ) == ["Password"]


def test_a_guard_this_runtime_cannot_run_is_said_not_passed():
    checks = AppChecks.of(
        app(
            guards=[
                "sensitive-data-guard:0.0.1",
                "consensus-guard:0.0.1",
                "no-such-guard",
            ]
        )
    )
    assert [guard.id for guard in checks.guards] == ["sensitive-data-guard"]
    assert any("Consensus Guard" in s and "a Cog" in s for s in checks.unexecuted)
    assert any("no-such-guard" in s for s in checks.unexecuted)


def test_built_in_nothing_sensitive_leaves_in_a_call_or_an_answer():
    checks = AppChecks.of(app())
    stopped = checks.verdict_at("in_flight", {"tool": "send", "args": {"body": AWS}})
    assert stopped.action == "stop" and "AWS access key" in stopped.sentence
    retried = checks.verdict_at("post_run", {"output": f"here: {AWS}"})
    assert retried.action == "retry"
    assert (
        checks.verdict_at("in_flight", {"tool": "search", "args": {"q": "news"}}).action
        == "proceed"
    )


def test_the_sensitive_data_stop_gate_stops_a_denied_field():
    checks = AppChecks.of(
        app(guards=["sensitive-data-guard:0.0.1"], gates=["sensitive-data-stop:0.0.1"])
    )
    verdict = checks.verdict_at(
        "in_flight", {"tool": "update", "args": {"record": {"IBAN": "BE00"}}}
    )
    assert verdict.action == "stop" and verdict.gate == "sensitive-data-stop"
    assert "IBAN" in verdict.sentence


def test_the_tool_violation_gate_sends_the_step_back():
    checks = AppChecks.of(
        app(
            guards=["tool-use-policy-guard:0.0.1"], gates=["tool-violation-retry:0.0.1"]
        )
    )
    unclassed = Decision("leave_to_me", "mystery", (), "unclassed")
    verdict = checks.verdict_at(
        "in_flight", {"tool": "mystery", "args": {}, "decision": unclassed}
    )
    assert verdict.action == "retry" and "mystery" in verdict.sentence
    classed = Decision("do_it", "search", (), "")
    assert (
        checks.verdict_at(
            "in_flight", {"tool": "search", "args": {}, "decision": classed}
        ).action
        == "proceed"
    )


# --- in a run ------------------------------------------------------------------


def scripted(*responses: Any) -> FunctionModel:
    """A model that answers in turn: a text, or a tool call as `(name, args)`.

    Streamed and not: the checks watch what is shown, so a run streams.
    """
    turns = list(responses)

    def next_turn(messages: list[ModelMessage]) -> Any:
        asked = sum(1 for message in messages if message.kind == "request")
        return turns[min(asked, len(turns)) - 1]

    def model(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        turn = next_turn(messages)
        if isinstance(turn, tuple):
            return ModelResponse(parts=[ToolCallPart(turn[0], turn[1])])
        return ModelResponse(
            parts=[TextPart("".join(turn) if isinstance(turn, list) else turn)]
        )

    async def stream(messages: list[ModelMessage], info: AgentInfo):
        turn = next_turn(messages)
        if isinstance(turn, tuple):
            yield {0: DeltaToolCall(name=turn[0], json_args=json.dumps(turn[1]))}
        else:
            for chunk in turn if isinstance(turn, list) else [turn]:
                yield chunk

    return FunctionModel(model, stream_function=stream)


def _agent(model: FunctionModel, checks: AppChecks, sent: list) -> Agent:
    agent: Agent = Agent(model, capabilities=[AppChecksCapability(checks=checks)])

    @agent.tool_plain
    def send(body: str) -> str:
        sent.append(body)
        return "sent"

    return agent


async def test_a_run_never_sends_a_credential_out():
    sent: list = []
    agent = _agent(
        scripted(("send", {"body": f"the key is {AWS}"}), "done"),
        AppChecks.of(app()),
        sent,
    )
    with pytest.raises(AppCheckBlockedError, match="AWS access key"):
        await agent.run("send the key")
    assert sent == []


async def test_an_ordinary_call_goes_through():
    sent: list = []
    agent = _agent(
        scripted(("send", {"body": "hello"}), "done"), AppChecks.of(app()), sent
    )
    assert (await agent.run("say hello")).output == "done"
    assert sent == ["hello"]


async def test_an_answer_holding_a_credential_is_asked_again():
    agent = _agent(
        scripted(f"Your key: {AWS}", "I cannot share keys."), AppChecks.of(app()), []
    )
    assert (await agent.run("my key?")).output == "I cannot share keys."


async def test_a_streamed_answer_never_shows_a_credential():
    chunks = [
        "Here is ",
        "the key ",
        AWS[:6],
        AWS[6:],
        " and a block -----BEGIN ",
        "PRIVATE KEY-----\nabc",
    ]
    agent = _agent(scripted(chunks, "I will not show keys."), AppChecks.of(app()), [])
    shown = ""
    async with agent.run_stream_events("what is there?") as events:
        async for event in events:
            if isinstance(event, PartStartEvent) and isinstance(event.part, TextPart):
                shown += event.part.content
            elif isinstance(event, PartDeltaEvent) and isinstance(
                event.delta, TextPartDelta
            ):
                shown += event.delta.content_delta
            assert AWS[:10] not in shown
            assert "BEGIN" not in shown
    # Withheld as it streamed; then, the answer holding one, asked again.
    assert shown == (
        "Here is the key [a credential, withheld] and a block [a credential, withheld]"
        "I will not show keys."
    )


def test_redaction_withholds_each_kind():
    assert redact(f"a {AWS} b") == "a [a credential, withheld] b"
    assert redact(
        "x -----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY----- y"
    ) == ("x [a credential, withheld] y")


def test_validate_says_a_guard_the_runtime_does_not_run(tmp_path):
    import yaml

    from agent_runtimes.commands.apps import NEEDS_ATTENTION, validate_file

    path = tmp_path / "app.yaml"
    path.write_text(
        yaml.safe_dump(
            {
                "schema": "loop.app/v1",
                "id": "desk",
                "name": "Desk",
                "kind": "chat",
                "agent": "cog-crawler:0.0.1",
                "checks": {
                    "guards": ["sensitive-data-guard:0.0.1", "consensus-guard:0.0.1"]
                },
            }
        )
    )
    report = validate_file(path)
    assert report.verdict == NEEDS_ATTENTION
    assert report.attention == [
        "The Consensus Guard is judged by a Cog the runtime does not run yet: "
        "nothing is checked by it."
    ]
