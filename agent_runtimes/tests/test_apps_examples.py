# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The examples written in Python (LOOP E-02): each `app.py` of agentspecs'
catalogue builds the spec committed beside it, and its code runs in process,
the person played by a `MemoryChannel` and the model scripted.
"""

import asyncio
from pathlib import Path
from typing import Any, List

import pytest
from pydantic_ai import Agent
from pydantic_ai.models.test import TestModel

from agent_runtimes.loop.apps import (
    AppHost,
    InvalidAnswer,
    MemoryChannel,
    UploadedFile,
    load_application,
)
from agent_runtimes.loop.apps.build import build
from agent_runtimes.loop.apps.record import AppRecorder

CATALOGUE = Path(pytest.importorskip("agentspecs.apps").__file__).parent

PYTHON_EXAMPLES = sorted(path.parent.name for path in CATALOGUE.glob("*/app.py"))


def test_the_catalogue_has_its_two_python_examples() -> None:
    assert PYTHON_EXAMPLES == ["customer-interview", "report-from-a-file"]


def test_the_catalogue_says_how_each_example_was_built() -> None:
    """LOOP E-05: Python where an `app.py` sits beside the spec, the Canvas where
    the page says it was composed there, written otherwise."""
    from agent_runtimes.specs.apps import APP_BUILT, APP_CATALOGUE

    assert set(APP_BUILT) == set(APP_CATALOGUE)
    assert sorted(i for i, b in APP_BUILT.items() if b == "python") == PYTHON_EXAMPLES
    assert [i for i, b in APP_BUILT.items() if b == "canvas"] == ["support-desk"]
    assert set(APP_BUILT.values()) == {"python", "canvas", "written"}


@pytest.mark.parametrize("identity", PYTHON_EXAMPLES)
def test_an_example_s_app_py_builds_the_spec_committed_beside_it(identity: str) -> None:
    built = build(CATALOGUE / identity / "app.py")
    assert built.document["id"] == identity
    assert built.text == (CATALOGUE / f"{identity}.yaml").read_text()


def _host(identity: str, says: str, records: List[Any]) -> tuple:
    application = load_application(CATALOGUE / identity / "app.py")
    channel = MemoryChannel()

    async def send(body: Any) -> None:
        records.append(body)

    host = AppHost(
        application,
        channel,
        agent=lambda spec: Agent(TestModel(custom_output_text=says)),
        recorder=AppRecorder(app=application.spec, send=send),
    )
    return host, channel


def test_the_customer_interview_asks_consent_then_interviews_and_keeps_its_result() -> (
    None
):
    async def scenario() -> None:
        records: List[Any] = []
        host, channel = _host(
            "customer-interview", "What happened in week one?", records
        )
        channel.reply("Yes")
        channel.reply("why people leave after the trial")
        session = await host.open(user="ada")
        assert session.state["goal"] == "why people leave after the trial"
        await host.message(session, "The setup took a week.")
        assert channel.messages[-1].text == "What happened in week one?"
        await host.action(
            session, "save", {"insight": "setup is slow", "quote": "a week"}
        )
        await host.action(session, "finish", {})
        assert session.state["insights"] == [
            {"insight": "setup is slow", "quote": "a week"}
        ]
        assert records

        declined, channel = _host("customer-interview", "unused", [])
        channel.reply("No")
        session = await declined.open(user="bob")
        await declined.message(session, "Hello")
        assert session.state == {"consent": False}
        assert "not consented" in channel.messages[-1].text

    asyncio.run(scenario())


def test_the_report_from_a_file_takes_a_csv_and_refuses_anything_else() -> None:
    async def scenario() -> None:
        host, channel = _host("report-from-a-file", "3 rows, 2 columns.", [])
        session = await host.open(user="ada", settings={"report": "Full"})
        channel.reply(UploadedFile("orders.csv", "text/csv", b"a,b\n1,2\n3,4\n5,6\n"))
        await host.message(session, "Run")
        assert channel.messages[-1].text == "3 rows, 2 columns."

        host, channel = _host("report-from-a-file", "unused", [])
        session = await host.open()
        channel.reply(UploadedFile("a.pdf", "application/pdf", b"%PDF"))
        with pytest.raises(InvalidAnswer):
            await host.message(session, "Run")

    asyncio.run(scenario())
