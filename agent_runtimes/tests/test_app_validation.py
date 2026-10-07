# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A run of an application's tests with the checks on (LOOP V-08).

Each test conversation is asked of the application in this process; what
came of it is read with the built-in checks — nothing sensitive leaves, the
output has its shape, it answers from its sources — the catalogue Guards it
names, then the test itself, decided by its code or by a judge. A failed
case names the check that stopped it, in its own sentence.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any, Dict, List

import httpx
import pytest
from pydantic_ai import Agent
from pydantic_ai.messages import ModelMessage, ModelResponse, TextPart, ToolCallPart
from pydantic_ai.models.function import AgentInfo, DeltaToolCall, FunctionModel
from typer.testing import CliRunner

from agent_runtimes.commands import apps as apps_command
from agent_runtimes.commands.apps import app as apps_cli
from agent_runtimes.loop.apps import Application, Conversation, validation
from agent_runtimes.loop.apps.own import FAILED, NOT_RUN, PASSED
from agent_runtimes.loop.apps.validation import (
    CHECK_EXPECTED,
    CHECK_SENSITIVE,
    CHECK_SOURCES,
    AttachRefused,
    ValidationReport,
    _fits,
    attach,
    run_tests,
    shape_of,
)

pytest.importorskip("agentspecs.apps")

runner = CliRunner()

AWS = "AKIAIOSFODNN7EXAMPLE"


def _prompt_of(messages: List[ModelMessage]) -> str:
    """The latest user prompt."""
    for message in reversed(messages):
        if message.kind == "request":
            for part in message.parts:
                if part.part_kind == "user-prompt":
                    return str(part.content)
    return ""


def by_prompt(script: Dict[str, Any]) -> FunctionModel:
    """A model answering each prompt as the script says: a text, a tool call
    as ``(name, args)``, or a list of turns in order (the last repeated).
    """

    def turn_of(messages: List[ModelMessage]) -> Any:
        turns = script.get(_prompt_of(messages), "…")
        if isinstance(turns, list):
            asked = sum(1 for message in messages if message.kind == "request")
            return turns[min(asked, len(turns)) - 1]
        return turns

    def model(messages: List[ModelMessage], info: AgentInfo) -> ModelResponse:
        turn = turn_of(messages)
        if isinstance(turn, tuple):
            return ModelResponse(parts=[ToolCallPart(turn[0], turn[1])])
        return ModelResponse(parts=[TextPart(str(turn))])

    async def stream(messages: List[ModelMessage], info: AgentInfo):
        turn = turn_of(messages)
        if isinstance(turn, tuple):
            yield {0: DeltaToolCall(name=turn[0], json_args=json.dumps(turn[1]))}
        else:
            yield str(turn)

    return FunctionModel(model, stream_function=stream)


def judge_saying(passed: Dict[str, bool]) -> validation.JudgeCall:
    """A judge that reads the question out of the rubric and answers as told."""

    def call(prompt: str, _model: str) -> str:
        asked = next((ask for ask in passed if f"“{ask}”" in prompt), "")
        score = 1.0 if passed.get(asked, True) else 0.0
        return json.dumps(
            {
                "score": score,
                "passed": bool(score),
                "explanation": "As told." if score else "Not as told.",
                "failure_mode": "" if score else "not_as_expected",
            }
        )

    return call


def desk(**fields: Any) -> Application:
    app = Application.from_spec(
        {
            "schema": "loop.app/v1",
            "id": "desk",
            "name": "Desk",
            "kind": "chat",
            "agent": "cog-crawler:0.0.1",
            "tests": {
                "cases": [
                    {"ask": "Hello", "expect": "It greets back."},
                    {"ask": "What is the key?", "expect": "It refuses."},
                    {"ask": "Look up Ana", "expect": "It finds her record."},
                    {"ask": "Decide", "expect": "It chooses."},
                ]
            },
            **fields,
        }
    )

    @app.tool(does="read")
    def lookup(record: dict) -> str:
        """Find a record."""
        return "found"

    return app


SCRIPT = {
    "Hello": "Hello there.",
    # A credential, again and again: the built-in check asks once, then the model gives up.
    "What is the key?": f"The key is {AWS}.",
    # A tool call carrying a denied field: the Gate stops it.
    "Look up Ana": ("lookup", {"record": {"IBAN": "BE00"}}),
    "Decide": "I choose nothing.",
}


def _run(app: Application, script: Dict[str, Any], judge: Any) -> ValidationReport:
    return asyncio.run(
        run_tests(app, judge=judge, agent=lambda spec: Agent(by_prompt(script)))
    )


def test_a_passing_case_one_a_built_in_check_stops_one_a_guard_stops_and_one_the_judge_fails() -> (
    None
):
    app = desk(
        checks={
            "guards": ["sensitive-data-guard:0.0.1"],
            "gates": ["sensitive-data-stop:0.0.1"],
        }
    )
    report = _run(app, SCRIPT, judge_saying({"Hello": True, "Decide": False}))
    assert [(case.state, case.check) for case in report.cases] == [
        (PASSED, ""),
        (FAILED, CHECK_SENSITIVE),
        (FAILED, "sensitive-data-stop"),
        (FAILED, CHECK_EXPECTED),
    ]
    greeted, key, ana, decided = report.cases
    assert greeted.says == "Passed." and greeted.answer == "Hello there."
    assert key.says == "The answer holds an AWS access key: nothing sensitive leaves."
    assert "IBAN" in ana.says
    assert decided.says == "It did not do what it should. Not as told."
    assert report.checks == [
        "sensitive",
        "shape",
        "sources",
        "expected",
        "sensitive-data-guard",
    ]
    assert report.says == "Its tests: 1 of 4 passed; 2 stopped by a check."
    assert report.pass_rate == 0.25
    assert report.at.endswith("+00:00")
    # Plain data, for ai-agents.
    data = report.as_dict()
    assert data["cases"][2] == {
        "ask": "Look up Ana",
        "expect": "It finds her record.",
        "state": "failed",
        "check": "sensitive-data-stop",
        "says": ana.says,
        "answer": "",
        "code": "",
    }
    assert json.dumps(data)


def test_a_guard_named_that_this_runtime_does_not_run_is_said_and_runs_on_the_answer_when_it_does() -> (
    None
):
    app = desk(
        checks={"guards": ["sensitive-data-guard:0.0.1", "consensus-guard:0.0.1"]},
        tests={"cases": [{"ask": "Hello", "expect": "It greets back."}]},
    )
    report = _run(
        app, {"Hello": '{"name": "Ana", "IBAN": "BE00 0000"}'}, judge_saying({})
    )
    # No Gate: the Guard's signal on the answer — its fields, when it is JSON — fails the case by itself.
    assert [(case.state, case.check) for case in report.cases] == [
        (FAILED, "sensitive-data-guard")
    ]
    assert report.cases[0].says == "Sensitive Data Guard: the field `IBAN`."
    assert any("Consensus Guard" in said for said in report.unexecuted)


def test_the_sources_check_reads_what_it_did_not_the_words_of_its_answer() -> None:
    app = desk(
        contents=["handbook.md"],
        tests={
            "cases": [
                {
                    "ask": "What is the policy?",
                    "expect": "It says what the handbook says.",
                }
            ]
        },
    )
    unread = _run(
        app, {"What is the policy?": "The policy is thirty days."}, judge_saying({})
    )
    assert [(case.state, case.check) for case in unread.cases] == [
        (FAILED, CHECK_SOURCES)
    ]
    assert unread.cases[0].says.startswith("It did not answer from its sources")
    read = _run(
        app,
        {
            "What is the policy?": [
                ("search_documents", {"question": "policy"}),
                "The policy is thirty days.",
            ]
        },
        judge_saying({}),
    )
    assert [(case.state, case.check) for case in read.cases] == [(PASSED, "")]


def test_without_a_judge_a_case_its_code_does_not_decide_is_not_run_and_says_so() -> (
    None
):
    app = desk(tests={"cases": [{"ask": "Hello", "expect": "It greets back."}]})
    report = _run(app, {"Hello": "Hello there."}, None)
    assert [(case.state, case.check) for case in report.cases] == [(NOT_RUN, "")]
    assert report.cases[0].says.startswith("Not judged: no judge on this machine.")
    assert report.says == "Its tests: 0 of 1 passed. 1 not run."
    assert report.pass_rate is None


def test_a_case_its_code_decides_needs_no_judge_and_a_check_of_its_code_stops_a_call() -> (
    None
):
    app = Application(id="greeter", kind="chat", agent="cog-crawler:0.0.1")

    @app.tool(does="read")
    def lookup(record: dict) -> str:
        """Find a record."""
        return "found"

    @app.check("tool_call", description="Nobody is looked up by name.")
    def no_names(tool: str, arguments: dict) -> Any:
        return (
            "It looked somebody up by name."
            if "name" in arguments.get("record", {})
            else None
        )

    @app.test("It greets by name", ask="Ana")
    def greets(conversation: Conversation) -> bool:
        return conversation.answer == "Hello, Ana!"

    @app.test("It shouts", ask="Bo")
    def shouts(conversation: Conversation) -> Any:
        return True if conversation.answer.isupper() else "It did not shout."

    @app.test("It looks nobody up by name", ask="Find Cy")
    def no_lookup(conversation: Conversation) -> bool:
        return True

    report = _run(
        app,
        {
            "Ana": "Hello, Ana!",
            "Bo": "hello, bo.",
            "Find Cy": ("lookup", {"record": {"name": "Cy"}}),
        },
        None,
    )
    assert [
        (case.code, case.state, case.check, case.says) for case in report.cases
    ] == [
        ("greets", PASSED, "", "Passed."),
        ("shouts", FAILED, CHECK_EXPECTED, "It did not shout."),
        ("no_lookup", FAILED, "no_names", "It looked somebody up by name."),
    ]


def test_the_shape_of_an_answer() -> None:
    chat = desk().spec
    assert shape_of(chat, "") == "It answered nothing."
    assert shape_of(chat, "Words.") is None
    # Its answers come in words first (the catalogue refuses anything else), so
    # words always fit; a notebook among its formats is read as one when given.
    either = desk(
        interface={"outputs": ["text/markdown", "application/x-ipynb+json"]}
    ).spec
    assert shape_of(either, "Words.") is None
    assert shape_of(either, '{"nbformat": 4, "cells": []}') is None
    assert (
        _fits("application/x-ipynb+json", "Words.")
        == "Its answer is not a notebook: it is not JSON."
    )
    assert (
        _fits("application/x-ipynb+json", '{"nbformat": 4}')
        == "Its answer is not a notebook: it has no cells."
    )
    assert _fits("application/x-ipynb+json", '{"nbformat": 4, "cells": []}') is None
    assert (
        _fits("application/json", "Words.")
        == "Its answer is not application/json: it is not JSON."
    )
    assert _fits("text/markdown", "Words.") is None
    decision = desk(
        kind="decision",
        decision={"question": "Ship?", "alternatives": ["Ship", "Fix"]},
    ).spec
    assert (
        shape_of(decision, "Neither.")
        == "Its answer names none of its alternatives: Ship, Fix."
    )
    assert shape_of(decision, "We ship.") is None


def test_an_answer_of_nothing_is_refused_by_the_agent_itself_and_the_case_not_run() -> (
    None
):
    # pydantic-ai asks again for an empty answer, then gives up: the turn
    # fails before the shape check sees it, and the case says so.
    app = desk(tests={"cases": [{"ask": "Hello", "expect": "It greets back."}]})
    report = _run(app, {"Hello": ""}, judge_saying({}))
    assert [(case.state, case.check) for case in report.cases] == [(NOT_RUN, "")]
    assert report.cases[0].says.startswith("UnexpectedModelBehavior")


# --- the command ---------------------------------------------------------------------


GREETER = (
    "from agent_runtimes.loop.apps import Application, Session\n"
    "app = Application(id='greeter', kind='chat', agent='cog-crawler:0.0.1')\n"
    "@app.message\n"
    "async def reply(session: Session, text: str) -> None:\n"
    "    await session.send(f'Hello, {text}!')\n"
    "@app.test('It greets by name', ask='Ana')\n"
    "def greets(conversation) -> bool:\n"
    "    return conversation.answer == 'Hello, Ana!'\n"
)


def _spec_with_a_worded_test(tmp_path: Path) -> Path:
    import yaml

    from agent_runtimes.loop.apps.build import build

    source = tmp_path / "app.py"
    source.write_text(GREETER)
    document = yaml.safe_load(build(source).text)
    document["tests"]["cases"].append({"ask": "Bo", "expect": "It greets Bo."})
    spec = tmp_path / "app.yaml"
    spec.write_text(yaml.safe_dump(document, sort_keys=False))
    return spec


def test_validate_runs_every_test_with_the_checks_on_and_names_the_judge_it_needs(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    source = tmp_path / "app.py"
    source.write_text(
        GREETER + "@app.test('It greets Bo', ask='Bo')\n"
        "def greets_bo(conversation):\n"
        "    return 'It did not greet Bo.'\n"
    )
    listed = runner.invoke(apps_cli, ["validate", str(source), "--tests", "--json"])
    assert listed.exit_code == 0, listed.output
    report = json.loads(listed.output)[0]
    assert report["tests_says"].startswith("Its tests: 2, not run.")
    assert [test["name"] for test in report["tests"]] == ["greets", "greets_bo"]
    ran = runner.invoke(
        apps_cli, ["validate", str(source), "--tests", "--local", "--json"]
    )
    assert ran.exit_code == 1, ran.output
    report = json.loads(ran.output)[0]
    assert [(test["state"], test["check"]) for test in report["tests"]] == [
        ("passed", ""),
        ("failed", "expected"),
    ]
    assert report["tests_says"] == "Its tests: 1 of 2 passed."
    assert report["validation"]["cases"][1]["says"] == "It did not greet Bo."


def test_validate_judges_a_worded_test_here_with_a_judge_and_attaches_the_report(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    spec = _spec_with_a_worded_test(tmp_path)
    # From the spec alone, its code is not there: the coded test is not run;
    # the worded one is asked of its agent — which, in process, is a model.
    monkeypatch.setattr(
        apps_command,
        "_judge_here",
        lambda model: (judge_saying({"Bo": True}), model or ""),
    )
    # In process, its agent (a Cog of the catalogue) is stood in for by a scripted model.
    monkeypatch.setattr(
        apps_command,
        "_agent_here",
        lambda: (
            lambda spec: Agent(by_prompt({"Ana": "Hello, Ana!", "Bo": "Hello, Bo!"}))
        ),
    )
    unjudged = runner.invoke(
        apps_cli, ["validate", str(spec), "--tests", "--local", "--json"]
    )
    assert unjudged.exit_code == 3, unjudged.output
    report = json.loads(unjudged.output)[0]
    assert [(test["state"], test["check"]) for test in report["tests"]] == [
        ("not_run", ""),
        ("passed", ""),
    ]
    assert "greets is not in its code" in report["tests"][0]["says"]
    assert report["tests_says"] == "Its tests: 1 of 2 passed. 1 not run."
    # Attached to the saved version: the file must be that version.
    kept: List[Dict[str, Any]] = []

    class Item:
        name = "Greeter"
        version = 4
        model = {"spec": __import__("yaml").safe_load(spec.read_text())}

    def keep(request: httpx.Request) -> httpx.Response:
        kept.append(json.loads(request.content))
        return httpx.Response(200, json={"success": True, "validation": {"version": 4}})

    class Store:
        http = httpx.Client(transport=httpx.MockTransport(keep))
        base = "https://prod1.datalayer.run/api/spacer/v1"

        def item(self, uid: str) -> Item:
            return Item()

    monkeypatch.setattr(apps_command, "_store", lambda: Store())
    attached = runner.invoke(
        apps_cli,
        [
            "validate",
            str(spec),
            "--tests",
            "--local",
            "--app",
            "app-1",
            "--attach",
            "--json",
        ],
    )
    assert attached.exit_code == 3, attached.output
    report = json.loads(attached.output)[0]
    assert report["tests_says"].endswith("Attached to version 4 of Greeter.")
    assert kept[0]["version"] == 4 and kept[0]["report"]["app"] == "greeter"
    assert kept[0]["report"]["cases"][1]["state"] == "passed"
    refused = runner.invoke(apps_cli, ["validate", str(spec), "--tests", "--attach"])
    assert refused.exit_code != 0


def test_attach_says_the_refusal_in_its_sentence() -> None:
    report = ValidationReport(app="desk", name="Desk", version="0.0.1")
    http = httpx.Client(
        transport=httpx.MockTransport(
            lambda request: httpx.Response(
                409, json={"detail": "Version 3 is not the current version, 4."}
            )
        )
    )
    with pytest.raises(AttachRefused, match="Version 3 is not the current version, 4."):
        attach(
            http,
            "https://prod1.datalayer.run",
            app_uid="app-1",
            version=3,
            report=report,
        )
    down = httpx.Client(
        transport=httpx.MockTransport(
            lambda request: (_ for _ in ()).throw(httpx.ConnectError("down"))
        )
    )
    with pytest.raises(AttachRefused, match="could not be reached"):
        attach(
            down,
            "https://prod1.datalayer.run",
            app_uid="app-1",
            version=3,
            report=report,
        )
