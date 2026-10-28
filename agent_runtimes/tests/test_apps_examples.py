# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The examples written in Python (E-02): each `app.py` of agentspecs'
catalogue builds the spec committed beside it, and its code runs in process,
the person played by a `MemoryChannel` and the model scripted.
"""

import asyncio
from pathlib import Path
from typing import Any, List

import pytest
from pydantic_ai import Agent
from pydantic_ai.models.test import TestModel

from agent_runtimes.apps import (
    AppHost,
    InvalidAnswer,
    MemoryChannel,
    UploadedFile,
    load_application,
)
from agent_runtimes.apps.build import build
from agent_runtimes.apps.record import AppRecorder

CATALOGUE = Path(pytest.importorskip("agentspecs.apps").__file__).parent

PYTHON_EXAMPLES = sorted(path.parent.name for path in CATALOGUE.glob("*/app.py"))


def test_the_catalogue_has_its_three_python_examples() -> None:
    assert PYTHON_EXAMPLES == [
        "customer-interview",
        "exchange-desk",
        "report-from-a-file",
    ]


def test_the_catalogue_says_how_each_example_was_built() -> None:
    """E-05: Python where an `app.py` sits beside the spec, the Canvas where
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
        session = await host.open(opened_by="ada")
        assert session.state["goal"] == "why people leave after the trial"
        await host.message(session, "The setup took a week.")
        assert channel.messages[-1].text == "What happened in week one?"
        await host.press(
            session, "save", {"insight": "setup is slow", "quote": "a week"}
        )
        await host.press(session, "finish", {})
        assert session.state["insights"] == [
            {"insight": "setup is slow", "quote": "a week"}
        ]
        assert records

        declined, channel = _host("customer-interview", "unused", [])
        channel.reply("No")
        session = await declined.open(opened_by="bob")
        await declined.message(session, "Hello")
        assert session.state == {"consent": False}
        assert "not consented" in channel.messages[-1].text

    asyncio.run(scenario())


def test_the_report_from_a_file_takes_a_csv_and_refuses_anything_else() -> None:
    async def scenario() -> None:
        host, channel = _host("report-from-a-file", "3 rows, 2 columns.", [])
        session = await host.open(opened_by="ada", settings={"report": "Full"})
        channel.reply(UploadedFile("orders.csv", "text/csv", b"a,b\n1,2\n3,4\n5,6\n"))
        await host.message(session, "Run")
        assert channel.messages[-1].text == "3 rows, 2 columns."

        host, channel = _host("report-from-a-file", "unused", [])
        session = await host.open()
        channel.reply(UploadedFile("a.pdf", "application/pdf", b"%PDF"))
        with pytest.raises(InvalidAnswer):
            await host.message(session, "Run")

    asyncio.run(scenario())


def test_the_exchange_desk_exchanges_at_manzanita_once_per_confirmed_operation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Decided 2026-10-13 (PI-42): its exchange_order exchanges
    against the hosted Manzanita's back office, keyed by the confirmed
    operation's ticket; a stand-in answers as Manzanita does."""
    import importlib.util

    import httpx

    from agent_runtimes.apps.pap_company import (
        PapTurn,
        enter_pap_turn,
        leave_pap_turn,
    )

    loaded = importlib.util.spec_from_file_location(
        "exchange_desk_app", CATALOGUE / "exchange-desk" / "app.py"
    )
    assert loaded is not None and loaded.loader is not None
    module = importlib.util.module_from_spec(loaded)
    loaded.loader.exec_module(module)
    done: dict = {}
    asked: List[Any] = []

    def manzanita(request: httpx.Request) -> httpx.Response:
        import json

        asked.append((str(request.url), json.loads(request.content)))
        body = json.loads(request.content)
        if body["order_id"] != "ord_7Hk2":
            return httpx.Response(404, json={"error": "no such order"})
        said = {
            "order_id": "ord_7Hk2",
            "to": f"Ridge Jacket, size {body['size']}",
            "status": "exchanged",
        }
        if body["idempotency_key"] in done:
            return httpx.Response(
                200, json={**done[body["idempotency_key"]], "already": True}
            )
        done[body["idempotency_key"]] = said
        return httpx.Response(200, json=said)

    real = httpx.AsyncClient
    monkeypatch.setattr(
        module.httpx,
        "AsyncClient",
        lambda **kwargs: real(transport=httpx.MockTransport(manzanita), **kwargs),
    )

    async def scenario() -> tuple:
        token = enter_pap_turn(PapTurn(ticket="ticket-1"))
        try:
            first = await module.exchange_order("ord_7Hk2", "L")
            again = await module.exchange_order("ord_7Hk2", "L")
            with pytest.raises(ValueError, match="no such order"):
                await module.exchange_order("ord_0000", "L")
        finally:
            leave_pap_turn(token)
        return first, again

    first, again = asyncio.run(scenario())
    assert first == {
        "order_id": "ord_7Hk2",
        "to": "Ridge Jacket, size L",
        "status": "exchanged",
    }
    assert again["already"] is True and len(done) == 1
    url, body = asked[0]
    assert url == "https://manzanita.examples.datalayer.run/back-office/exchanges"
    assert body == {"order_id": "ord_7Hk2", "size": "L", "idempotency_key": "ticket-1"}
