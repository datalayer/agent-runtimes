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

from agent_runtimes.loop.apps.frames import OrganizationFrames
from agent_runtimes.loop.apps.guards import (
    AppCheckBlockedError,
    AppChecks,
    AppChecksCapability,
    credentials_in,
    denied_fields_in,
    holds,
    permissions_needed,
    redact,
)
from agent_runtimes.loop.apps.rules import Decision
from agent_runtimes.types import AppSpec

AWS = "AKIA" + "ABCDEFGHIJKLMNOP"
GITHUB = "ghp_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0"

#: The catalogue's Guards of a session's start, and the Gate that reads them.
PREFLIGHT_GUARDS = [
    "required-frame-guard:0.0.1",
    "permission-guard:0.0.1",
    "data-source-authorization-guard:0.0.1",
]
CONFIGURATION_CHECK = ["configuration-check:0.0.1"]


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


def app_with(**fields: Any) -> AppSpec:
    """An application naming the preflight Guards and their Gate, with more fields."""
    return AppSpec.model_validate(
        {
            **app(guards=PREFLIGHT_GUARDS, gates=CONFIGURATION_CHECK).model_dump(
                by_alias=True, exclude_defaults=True
            ),
            **fields,
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


# --- at a session's start (preflight) ------------------------------------------


def test_the_preflight_guards_are_executed_and_pass_a_sound_application():
    checks = AppChecks.of(app_with(context=["datalayer:0.0.1"]))
    assert checks.unexecuted == []
    verdicts = checks.preflight({})
    assert [(v.guard, v.passed, v.action) for v in verdicts] == [
        ("built-in", True, "proceed"),
        ("required-frame-guard", True, "proceed"),
        ("permission-guard", True, "proceed"),
        ("data-source-authorization-guard", True, "proceed"),
    ]


def test_a_context_that_is_not_there_fails_the_required_frame_guard():
    checks = AppChecks.of(app_with(context=["no-such-frame:0.0.1", "org-acme-tone"]))
    failed = {v.guard: v for v in checks.preflight({}) if v.passed is False}
    verdict = failed["required-frame-guard"]
    assert verdict.action == "stop" and verdict.gate == "configuration-check"
    assert "no-such-frame" in verdict.sentence
    assert "no organization that was said" in verdict.sentence
    # Its organization known, its own context resolves; the catalogue's still does not.
    organization = OrganizationFrames(
        organization_uid="org-1", versions={"org-acme-tone": {"id": "org-acme-tone"}}
    )
    failed = {
        v.guard: v
        for v in checks.preflight({"organization": organization})
        if v.passed is False
    }
    assert "org-acme-tone" not in failed["required-frame-guard"].sentence
    assert "no-such-frame" in failed["required-frame-guard"].sentence


def test_what_its_guardrail_does_not_allow_fails_the_permission_guard():
    spec = app_with(
        connections=[{"server": "slack:0.0.1", "access": "write", "as": "user"}],
        permissions={
            "spaces": [{"space": "sales", "access": "write"}],
            "computer": {"shell": True, "browse": True},
        },
    )
    assert set(permissions_needed(spec)) == {
        "read_data",
        "write_data",
        "execute_code",
        "access_internet",
        "send_email",
    }
    failed = {v.guard: v for v in AppChecks.of(spec).preflight({}) if v.passed is False}
    verdict = failed["permission-guard"]
    # default-platform-user grants reading, code and the internet; not sending or writing.
    assert (
        "`send:email`" in verdict.sentence
        and "slack.slack_post_message" in verdict.sentence
    )
    assert (
        "`write:data`" in verdict.sentence and "the Space `sales`" in verdict.sentence
    )
    assert (
        "execute:code" not in verdict.sentence
        and "access:internet" not in verdict.sentence
    )
    assert verdict.gate == "configuration-check"


def test_a_source_outside_its_guardrails_scope_fails_the_data_source_authorization_guard():
    spec = app_with(connections=[{"server": "tavily:0.0.1"}])
    failed = {
        v.guard: v
        for v in AppChecks.of(spec).preflight({"prompt": "What is the SSN of Bob?"})
        if v.passed is False
    }
    verdict = failed["data-source-authorization-guard"]
    assert "`tavily` is not among the systems" in verdict.sentence
    assert "`SSN`" in verdict.sentence and "denied" in verdict.sentence
    # The permission guard reads tavily as reading, which is allowed.
    assert "permission-guard" not in failed
    clean = AppChecks.of(app_with()).preflight({"prompt": "What is the weather?"})
    assert all(v.passed for v in clean)


def test_instructions_holding_a_token_stop_the_session_before_its_model_is_asked():
    spec = app_with(instructions=f"Call GitHub with {GITHUB}.")
    verdicts = AppChecks.of(spec).preflight({})
    assert verdicts[0].guard == "built-in" and verdicts[0].action == "stop"
    assert "GitHub token" in verdicts[0].sentence
    assert GITHUB not in verdicts[0].sentence


async def test_a_session_is_preflighted_once_and_each_guard_recorded():
    recorded: list = []
    capability = AppChecksCapability(
        checks=AppChecks.of(app_with()),
        record=lambda stage, verdict: recorded.append(
            (stage, verdict.guard, verdict.passed)
        ),
    )
    await capability.preflight("s1", "hello")
    await capability.preflight("s1", "again")
    await capability.preflight("s2")
    one = [
        ("preflight", "required-frame-guard", True),
        ("preflight", "permission-guard", True),
        ("preflight", "data-source-authorization-guard", True),
    ]
    assert recorded == one + one


async def test_a_run_whose_instructions_hold_a_token_never_asks_its_model():
    asked: list = []

    def model(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        asked.append(messages)
        return ModelResponse(parts=[TextPart("done")])

    agent: Agent = Agent(
        FunctionModel(model),
        capabilities=[
            AppChecksCapability(
                checks=AppChecks.of(app_with(instructions=f"Use {GITHUB}."))
            )
        ],
    )
    with pytest.raises(AppCheckBlockedError, match="GitHub token"):
        await agent.run("hello")
    assert asked == []
    # And one that fails again on its next turn: nothing was let through.
    with pytest.raises(AppCheckBlockedError, match="GitHub token"):
        await agent.run("hello again")
    assert asked == []


def test_validate_no_longer_says_the_preflight_guards_are_not_run(tmp_path):
    import yaml

    from agent_runtimes.commands.apps import validate_file

    path = tmp_path / "app.yaml"
    path.write_text(
        yaml.safe_dump(
            {
                "schema": "loop.app/v1",
                "id": "desk",
                "name": "Desk",
                "kind": "chat",
                "agent": "cog-crawler:0.0.1",
                "checks": {"guards": PREFLIGHT_GUARDS, "gates": CONFIGURATION_CHECK},
            }
        )
    )
    report = validate_file(path)
    assert not any("does not run yet" in note for note in report.attention)
