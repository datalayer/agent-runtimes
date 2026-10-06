# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Code where plain words are not enough: `@app.tool`, `@app.check`, `@app.test` (LOOP P-06)."""

import json
from pathlib import Path
from typing import Any

import pytest
import yaml
from pydantic_ai import Agent
from typer.testing import CliRunner

from agent_runtimes.commands.apps import NEEDS_ATTENTION, validate_file
from agent_runtimes.commands.apps import app as apps_cli
from agent_runtimes.loop.apps import (
    AppHost,
    Application,
    Conversation,
    MemoryChannel,
    Session,
)
from agent_runtimes.loop.apps.build import build, code_marks
from agent_runtimes.loop.apps.enforcement import AppRuleBlockedError
from agent_runtimes.loop.apps.guards import AppCheckBlockedError
from agent_runtimes.loop.apps.loading import AppNotRunnable
from agent_runtimes.loop.apps.own import (
    FAILED,
    NOT_RUN,
    PASSED,
    refusal_of,
    run_code_tests,
    verdict_of,
)
from agent_runtimes.loop.apps.plugins import reaction_of
from agent_runtimes.loop.apps.record import AppRecorder
from agent_runtimes.loop.apps.rules import decision_for
from agent_runtimes.tests.test_apps_guards import scripted

pytest.importorskip("agentspecs.apps")

runner = CliRunner()


def desk() -> Application:
    app = Application(id="order-desk", kind="chat", agent="cog-crawler:0.0.1")

    @app.tool(does="read")
    def lookup_order(number: str) -> dict:
        """Find an order by its number."""
        return {"number": number, "status": "shipped"}

    @app.tool(does=["write", "buy"], description="Refund an order.")
    async def refund(number: str, amount: float = 0) -> str:
        return f"refunded {number}"

    @app.check("answer")
    def no_prices(text: str) -> Any:
        """It never quotes a price."""
        return "It quoted a price." if "$" in text else None

    @app.check("tool_call", description="Refunds stay under 100.")
    def small_refunds(tool: str, arguments: dict) -> bool:
        return tool != "refund" or float(arguments.get("amount") or 0) < 100

    return app


def hosted(app: Application, *turns: Any) -> tuple[AppHost, MemoryChannel, list]:
    sent: list = []

    async def send(body: dict) -> None:
        sent.append(body)

    channel = MemoryChannel()
    spec = app.spec.model_copy(
        update={
            "record": app.spec.record.model_copy(
                update={"include": ["checks", "outputs"]}
            )
        }
    )
    host = AppHost(
        app,
        channel,
        agent=lambda spec: Agent(scripted(*turns)),
        recorder=AppRecorder(app=spec, app_uid="app-1", send=send),
    )
    return host, channel, sent


# --- declared in the spec ---------------------------------------------------------


def test_tools_checks_and_tests_are_declared_in_the_spec() -> None:
    app = desk()

    @app.test("It never asks a leading question", ask="Interview me.")
    def no_leading_question(conversation: Conversation) -> bool:
        return True

    document = app.document
    assert document["tools"] == [
        {
            "name": "lookup_order",
            "description": "Find an order by its number.",
            "parameters": {
                "properties": {"number": {"type": "string"}},
                "required": ["number"],
                "type": "object",
            },
            "does": ["read"],
        },
        {
            "name": "refund",
            "description": "Refund an order.",
            "parameters": {
                "properties": {
                    "number": {"type": "string"},
                    "amount": {"default": 0, "type": "number"},
                },
                "required": ["number"],
                "type": "object",
            },
            "does": ["write", "buy"],
        },
    ]
    assert document["checks"] == {
        "code": [
            {
                "name": "no_prices",
                "on": "answer",
                "description": "It never quotes a price.",
            },
            {
                "name": "small_refunds",
                "on": "tool_call",
                "description": "Refunds stay under 100.",
            },
        ]
    }
    assert document["tests"] == {
        "cases": [
            {
                "ask": "Interview me.",
                "expect": "It never asks a leading question",
                "code": "no_leading_question",
            }
        ]
    }
    spec = app.spec  # validated as any spec is
    assert [tool.name for tool in spec.tools] == ["lookup_order", "refund"]
    assert spec.tool("refund").does == ["write", "buy"]
    assert [check.on for check in spec.checks.code] == ["answer", "tool_call"]
    assert spec.tests.cases[0].code == "no_leading_question"
    assert set(app.tools) == {"lookup_order", "refund"}
    assert set(app.checks) == {"no_prices", "small_refunds"}
    assert set(app.tests) == {"no_leading_question"}


def test_what_cannot_be_declared_is_refused_in_a_sentence() -> None:
    app = desk()
    with pytest.raises(TypeError, match="Say what the tool 'bare' does"):

        @app.tool
        def bare() -> None:
            """Bare."""

    with pytest.raises(TypeError, match="Say what the tool does"):
        app.tool()
    with pytest.raises(
        ValueError, match="Say what the tool 'quiet' does, for the agent"
    ):

        @app.tool(does="read")
        def quiet() -> None:
            pass

    with pytest.raises(ValueError, match="already has a tool 'refund'"):

        @app.tool(does="read")
        def refund() -> None:
            """Again."""

    with pytest.raises(ValueError, match="A check runs on answer or tool_call"):
        app.check("start")
    with pytest.raises(ValueError, match="Say what the check 'silent' checks"):

        @app.check("answer")
        def silent(text: str) -> None:
            pass

    @app.tool(does="fly")
    def flies() -> None:
        """Flies."""

    with pytest.raises(AppNotRunnable, match="tools.2.does"):
        app.spec  # noqa: B018


def test_build_marks_each_as_code_and_a_spec_alone_says_what_it_lacks(
    tmp_path: Path,
) -> None:
    source = tmp_path / "app.py"
    source.write_text(
        "from agent_runtimes.loop.apps import Application\n"
        "app = Application(id='order-desk', kind='chat', agent='cog-crawler:0.0.1')\n"
        "@app.tool(does='read')\n"
        "def lookup_order(number: str) -> dict:\n"
        "    '''Find an order.'''\n"
        "    return {}\n"
        "@app.check('answer')\n"
        "def no_prices(text: str):\n"
        "    '''It never quotes a price.'''\n"
        "@app.test('It greets', ask='Hello')\n"
        "def greets(conversation) -> bool:\n"
        "    return True\n"
    )
    built = build(source)
    assert [mark.line() for mark in built.marks] == [
        "# loop:code tool lookup_order: lookup_order (app.py:3)",
        "# loop:code check no_prices: no_prices (app.py:7)",
        "# loop:code test greets: greets (app.py:10)",
    ]
    assert [mark.moment for mark in code_marks(built.application)][
        0
    ] == "tool lookup_order"
    # The app.py has its code: nothing to say. Its spec alone says what it lacks.
    assert validate_file(source).attention == []
    alone = tmp_path / "app.yaml"
    alone.write_text(built.text)
    report = validate_file(alone)
    assert report.verdict == NEEDS_ATTENTION
    assert report.attention == [
        "Its tool lookup_order is written in its code: run from this spec alone, "
        "its agent is not given it.",
        "Its check no_prices (It never quotes a price.) is written in its code: "
        "run from this spec alone, nothing checks it.",
        "Its test “It greets” is decided by its code (greets): run from this spec "
        "alone, it is judged by its words.",
    ]


# --- its tools ---------------------------------------------------------------------


async def test_the_agent_calls_its_tools_and_the_rules_decide_them() -> None:
    app = desk()
    host, channel, _ = hosted(
        app,
        ("lookup_order", {"number": "42"}),
        "Order 42 has shipped.",
        ("refund", {"number": "42", "amount": 10}),
        "Not refunded.",
    )
    session = await host.open()
    answer = await session.agent.run("Where is order 42?")
    assert answer.text == "Order 42 has shipped."
    returns = [
        part.content
        for message in session.agent.history
        for part in message.parts
        if part.part_kind == "tool-return"
    ]
    assert returns == [{"number": "42", "status": "shipped"}]
    # It writes and buys: no rule says so, so the person is asked first.
    assert decision_for(app.spec, "refund").behaviour == "ask_first"
    assert decision_for(app.spec, "lookup_order").behaviour == "do_it"
    channel.reply("Refuse")
    with pytest.raises(AppRuleBlockedError):
        await session.agent.run("Refund it.")
    assert channel.questions[-1].options == ("Allow", "Refuse")


async def test_a_rule_names_its_tool_by_its_name() -> None:
    app = desk()
    app.rule("Refund an order", applies_to="refund", behaviour="do_it")
    assert decision_for(app.spec, "refund").behaviour == "do_it"
    host, channel, _ = hosted(
        app, ("refund", {"number": "42", "amount": 10}), "Refunded."
    )
    session = await host.open()
    assert (await session.agent.run("Refund it.")).text == "Refunded."
    assert channel.questions == []


# --- its checks --------------------------------------------------------------------


async def test_an_answer_its_check_refuses_is_asked_again_and_recorded() -> None:
    host, _, sent = hosted(desk(), "It costs $40.", "It is affordable.")
    session = await host.open()
    answer = await session.agent.run("How much is it?")
    assert answer.text == "It is affordable."
    retried = [
        part.content
        for message in session.agent.history
        for part in message.parts
        if part.part_kind == "retry-prompt"
    ]
    assert retried == ["It quoted a price. Answer again without it."]
    await host.recorder.flush(session.id)
    checks = [e for body in sent for e in body["entries"] if e["kind"] == "check"]
    assert [(e["summary"], e["payload"]["stage"]) for e in checks] == [
        ("It quoted a price.", "post_run")
    ]


async def test_a_tool_call_its_check_refuses_is_stopped() -> None:
    app = desk()
    app.rule("Refund an order", applies_to="refund", behaviour="do_it")
    host, _, sent = hosted(app, ("refund", {"number": "42", "amount": 500}), "Done.")
    session = await host.open()
    with pytest.raises(
        AppCheckBlockedError, match="The check small_refunds refused it."
    ):
        await session.agent.run("Refund 500.")
    await host.recorder.flush(session.id)
    checks = [e for body in sent for e in body["entries"] if e["kind"] == "check"]
    assert [(e["summary"], e["payload"]["stage"]) for e in checks] == [
        ("The check small_refunds refused it.", "in_flight")
    ]


def test_what_a_check_and_a_test_say_is_read_strictly() -> None:
    assert refusal_of("c", None) is None and refusal_of("c", True) is None
    assert refusal_of("c", False) == "The check c refused it."
    assert refusal_of("c", " Too long. ") == "Too long."
    with pytest.raises(TypeError, match="returns None or True"):
        refusal_of("c", 0)
    assert verdict_of("t", True) == (True, "")
    assert verdict_of("t", False) == (False, "t says it failed.")
    assert verdict_of("t", "It asked twice.") == (False, "It asked twice.")
    with pytest.raises(TypeError, match="returns True or False"):
        verdict_of("t", None)


async def test_a_later_plugin_answers_in_place_of_its_tool() -> None:
    app = desk()
    host, _, _ = hosted(app)
    original = reaction_of(app.id, "tool", "lookup_order", host.registry)
    assert original is app.tools["lookup_order"]
    assert (
        reaction_of(app.id, "check", "no_prices", host.registry)
        is app.checks["no_prices"]
    )
    host.dispose()
    assert reaction_of(app.id, "tool", "lookup_order", host.registry) is None


# --- its tests ---------------------------------------------------------------------


def interviewer() -> Application:
    app = Application(id="interviewer", kind="chat", agent="cog-crawler:0.0.1")

    @app.message
    async def reply(session: Session, text: str) -> None:
        async with session.step("Thinking"):
            pass
        await session.send("Don't you think onboarding is slow?")
        await session.send("Tell me more.")

    @app.test("It never asks a leading question", ask="Interview me.")
    def no_leading_question(conversation: Conversation) -> Any:
        assert conversation.ask == "Interview me."
        assert [step.name for step in conversation.steps] == ["Thinking"]
        if "don't you think" in conversation.answer.lower():
            return "It asked a leading question."
        return True

    @app.test("It invites more", ask="Interview me.")
    def invites(conversation: Conversation) -> bool:
        return len(conversation.messages) == 2 and conversation.answer.endswith("more.")

    @app.test("It says nothing undecided", ask="Hi")
    def undecided(conversation: Conversation) -> None:
        return None

    return app


async def test_its_tests_are_run_and_decided_by_its_code() -> None:
    results = await run_code_tests(interviewer())
    assert [(r.name, r.state, r.says) for r in results] == [
        ("no_leading_question", FAILED, "It asked a leading question."),
        ("invites", PASSED, ""),
        (
            "undecided",
            NOT_RUN,
            "undecided raised TypeError: The test undecided returned None: a test "
            "returns True or False, or a sentence saying why it failed.",
        ),
    ]


def test_validate_lists_its_tests_and_runs_them_here(tmp_path: Path) -> None:
    source = tmp_path / "app.py"
    source.write_text(
        "from agent_runtimes.loop.apps import Application, Session\n"
        "app = Application(id='greeter', kind='chat', agent='cog-crawler:0.0.1')\n"
        "@app.message\n"
        "async def reply(session: Session, text: str) -> None:\n"
        "    await session.send(f'Hello, {text}!')\n"
        "@app.test('It greets by name', ask='Ana')\n"
        "def greets(conversation) -> bool:\n"
        "    return conversation.answer == 'Hello, Ana!'\n"
        "@app.test('It shouts', ask='Ana')\n"
        "def shouts(conversation):\n"
        "    return True if conversation.answer.isupper() else 'It did not shout.'\n"
    )
    listed = runner.invoke(apps_cli, ["validate", str(source), "--tests", "--json"])
    assert listed.exit_code == 0, listed.output
    report = json.loads(listed.output)[0]
    assert report["tests_says"].startswith("Its code's tests: 2, not run.")
    assert [test["name"] for test in report["tests"]] == ["greets", "shouts"]
    ran = runner.invoke(apps_cli, ["validate", str(source), "--tests", "--local"])
    assert ran.exit_code == 1, ran.output
    assert "✓ It greets by name (greets)" in ran.output
    assert "✗ It shouts (shouts) — It did not shout." in ran.output
    assert "Its code's tests: 1 of 2 passed." in ran.output
    # From its spec alone, a test of its code is not run: it is judged by its words.
    spec = tmp_path / "app.yaml"
    spec.write_text(build(source).text)
    alone = runner.invoke(
        apps_cli, ["validate", str(spec), "--tests", "--local", "--json"]
    )
    assert alone.exit_code == 0, alone.output
    assert (
        "validate the app.py to run them" in json.loads(alone.output)[0]["tests_says"]
    )
    refused = runner.invoke(apps_cli, ["validate", str(source), "--tests", "--cloud"])
    assert refused.exit_code != 0
    assert runner.invoke(apps_cli, ["validate", str(source), "--local"]).exit_code != 0
    assert yaml.safe_load(spec.read_text())["tests"]["cases"][1]["code"] == "shouts"
