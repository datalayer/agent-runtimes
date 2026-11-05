# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application's checks, executed (R-06): built-ins, Guards and Gates."""

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

from agent_runtimes.apps.frames import OrganizationFrames
from agent_runtimes.apps.guards import (
    AppCheckBlockedError,
    AppChecks,
    AppChecksCapability,
    classes_needed,
    credentials_in,
    holds,
    personal_data_in,
    redact,
)
from agent_runtimes.apps.rules import Decision
from agent_runtimes.specs.guards import GUARD_CATALOGUE
from agent_runtimes.types import AppSpec, GuardSpec

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


def test_the_sensitive_data_stop_gate_stops_personal_data_in_a_call():
    checks = AppChecks.of(
        app(guards=["sensitive-data-guard:0.0.1"], gates=["sensitive-data-stop:0.0.1"])
    )
    verdict = checks.verdict_at(
        "in_flight",
        {"tool": "update", "args": {"record": {"ssn": "123-45-6789"}}},
    )
    assert verdict.action == "stop" and verdict.gate == "sensitive-data-stop"
    assert "a social security number" in verdict.sentence
    assert personal_data_in({"to": "bob@acme.com"}) == ["an email address"]
    # A field name alone is not sensitive data: a Policy names no denied fields.
    assert (
        checks.verdict_at(
            "in_flight", {"tool": "update", "args": {"record": {"IBAN": "BE00"}}}
        ).action
        == "proceed"
    )


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


def _under(guard_id: str, policy: str) -> GuardSpec:
    """The catalogue's Guard, extending another Policy of the catalogue."""
    return GuardSpec.model_validate(
        {**GUARD_CATALOGUE[guard_id].model_dump(), "policy": policy}
    )


def _checks_under(spec: AppSpec, policy: str) -> AppChecks:
    checks = AppChecks.of(spec)
    checks.guards = [_under(guard.id, policy) for guard in checks.guards]
    return checks


def _allowing(reason: str = "granted"):
    """An authorize hook that allows everything, as IAM would for a holder of every relation."""
    from agent_shield.policy import Authorization

    def hook(request):
        return Authorization(
            verdict="allow", reason=reason, authorizer="test", cached=False
        )

    return hook


def test_what_the_application_does_is_read_by_the_classes_a_policy_decides():
    spec = app_with(
        connections=[{"server": "slack:0.0.1", "access": "write", "as": "user"}],
        permissions={
            "spaces": [{"space": "sales", "access": "write"}],
            "computer": {"shell": True, "browse": True},
        },
    )
    needed = classes_needed(spec)
    assert set(needed) == {"read", "write", "execute", "send"}
    assert "the Space `sales`" in needed["write"]
    assert "slack.slack_post_message" in needed["send"]
    assert needed["execute"] == "its computer runs commands"


def test_the_default_policy_asks_rather_than_denies_so_the_permission_guard_passes():
    spec = app_with(
        connections=[{"server": "slack:0.0.1", "access": "write", "as": "user"}],
        permissions={
            "spaces": [{"space": "sales", "access": "write"}],
            "computer": {"shell": True},
        },
    )
    # `default:0.0.1`: reading and editing inside are done, a command and
    # sending are asked first; nothing is denied, nobody needs authorizing.
    assert GUARD_CATALOGUE["permission-guard"].policy == "default:0.0.1"
    verdicts = AppChecks.of(spec).preflight({})
    assert all(v.passed for v in verdicts)


def test_what_its_policy_denies_or_leaves_unauthorized_fails_the_permission_guard():
    spec = app_with(
        connections=[{"server": "slack:0.0.1", "access": "write", "as": "user"}],
        permissions={"computer": {"shell": True}},
        tools=[{"name": "purge", "description": "Purges", "does": ["delete"]}],
    )
    # The organization's baseline: nothing is deleted, and reading, writing,
    # running a command and sending need an authorization beside the Rules.
    checks = _checks_under(spec, "organization-baseline:0.0.1")
    failed = {v.guard: v for v in checks.preflight({}) if v.passed is False}
    verdict = failed["permission-guard"]
    assert verdict.gate == "configuration-check"
    assert "organization-baseline:0.0.1 denies" in verdict.sentence
    assert "it deletes through purge" in verdict.sentence
    # Nobody launched it that was said: nothing is authorized unsaid.
    assert "no authorizer is configured" in verdict.sentence
    assert "it reads" in verdict.sentence and "it can send" in verdict.sentence
    # The launching identity authorized for every class: only the deletion stays denied.
    from agent_shield.policy import Subject

    authorized = {
        v.guard: v
        for v in checks.preflight(
            {"subject": Subject(type="account", id="alice"), "authorize": _allowing()}
        )
        if v.passed is False
    }
    sentence = authorized["permission-guard"].sentence
    assert "it deletes through purge" in sentence and "nothing is deleted" in sentence
    assert "it reads" not in sentence and "it can send" not in sentence


def test_reading_its_policy_does_not_let_it_fails_the_data_source_authorization_guard():
    spec = app_with(connections=[{"server": "tavily:0.0.1"}], contents=["pipeline"])
    # The baseline lends every server by name (none listed): tavily is lent;
    # reading `pipeline` needs an authorization nobody gave.
    failed = {
        v.guard: v
        for v in _checks_under(spec, "organization-baseline:0.0.1").preflight({})
        if v.passed is False
    }
    verdict = failed["data-source-authorization-guard"]
    assert "`tavily` is not among" not in verdict.sentence
    assert "reading `pipeline` is denied by organization-baseline:0.0.1" in (
        verdict.sentence
    )
    # Under the default Policy everything it reads is read: nothing fails.
    assert GUARD_CATALOGUE["data-source-authorization-guard"].policy == "default:0.0.1"
    clean = AppChecks.of(spec).preflight({"prompt": "What is the weather?"})
    assert all(v.passed for v in clean)


def test_a_policy_lending_servers_by_name_lends_those_alone(monkeypatch):
    from agent_runtimes.specs import guards as catalogue
    from agent_runtimes.specs.policies import POLICY_CATALOGUE

    lent = POLICY_CATALOGUE["default"].model_copy(
        update={
            "policy": {
                **POLICY_CATALOGUE["default"].policy,
                "mcp": {"allow": ["slack"]},
            }
        }
    )
    monkeypatch.setitem(catalogue.POLICY_CATALOGUE, "default", lent)
    spec = app_with(connections=[{"server": "tavily:0.0.1"}, {"server": "slack:0.0.1"}])
    failed = {v.guard: v for v in AppChecks.of(spec).preflight({}) if v.passed is False}
    verdict = failed["data-source-authorization-guard"]
    assert (
        "`tavily` is not among the servers default:0.0.1 lends (slack)"
        in verdict.sentence
    )
    assert "`slack`" not in verdict.sentence


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
