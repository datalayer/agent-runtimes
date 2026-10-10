# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The parity check (LOOP P-27): Chainlit's cookbook examples rebuilt with
LOOP's API (``examples/chainlit-parity``) do what Chainlit's do — each run
through an `AppHost`, its model scripted, its words, steps, components,
actions and window messages checked against the example it rebuilds.
"""

import base64
import importlib.util
import json
from pathlib import Path
from typing import Any, Dict, Iterator, List

import pytest
from fastapi.testclient import TestClient
from pydantic_ai import Agent

from agent_runtimes.loop.apps import (
    AppHost,
    FileQuestion,
    MemoryChannel,
    Step,
    UploadedFile,
    load_application,
    mounting,
)
from agent_runtimes.tests.test_app_sessions import (  # noqa: F401 - fixtures
    Runtime,
    answer_of,
    events_of,
    runtime,
)
from agent_runtimes.tests.test_apps_guards import scripted

pytest.importorskip("agentspecs.apps")

EXAMPLES = Path(__file__).parents[2] / "examples" / "chainlit-parity"


def hosted(name: str, *turns: Any) -> tuple:
    """An example, hosted in this process, its agent answering ``turns``."""
    application = load_application(EXAMPLES / f"{name}.py")
    channel = MemoryChannel()
    host = AppHost(application, channel, agent=lambda spec: Agent(scripted(*turns)))
    return application, host, channel


def steps_of(channel: MemoryChannel) -> List[Step]:
    """The steps that ended, in the order they ended."""
    return [
        event for event in channel.events if isinstance(event, Step) and event.ended_at
    ]


def components_of(message: Any) -> List[str]:
    """What a message shows, by component."""
    return [node["component"] for node in message.components]


async def test_document_qa_asks_for_the_file_then_answers_from_its_passages() -> None:
    application, host, channel = hosted(
        "document_qa", "The refund window is 30 days (source_0)."
    )
    channel.reply(
        UploadedFile(
            "policy.txt",
            "text/plain",
            b"Refunds are accepted within 30 days of purchase. Shipping is free.",
        )
    )
    session = await host.open()
    # Asked as Chainlit's AskFileMessage asks: its kinds, its size, its words.
    [question] = channel.questions
    assert isinstance(question, FileQuestion)
    assert question.accept == ("text/plain", "application/pdf")
    assert question.prompt.startswith("Welcome to the Document QA demo!")
    # "Processing…", then the same message updated.
    assert [message.text for message in channel.messages] == [
        "`policy.txt` processed. You can now ask questions!"
    ]
    await host.message(session, "How long is the refund window?")
    [retrieving] = steps_of(channel)
    assert (retrieving.name, retrieving.kind, retrieving.output) == (
        "Retrieving",
        "retrieval",
        "source_0",
    )
    answer = channel.messages[-1]
    assert answer.text == (
        "The refund window is 30 days (source_0).\nSources: source_0"
    )
    assert components_of(answer) == ["Evidence"]
    assert answer.data["sources"][0]["passage"].startswith("Refunds are accepted")


async def test_text_to_sql_chains_three_steps_and_its_button_takes_action() -> None:
    application, host, channel = hosted(
        "text_to_sql",
        "```sql\nSELECT * FROM orders WHERE order_id = 1003\n```",
        "Order 1003 is still processing; its delivery is due on 2026-10-06.",
    )
    session = await host.open()
    await host.message(session, "Where is order 1003?")
    assert [(step.name, step.kind) for step in steps_of(channel)] == [
        ("gen_query", "tool"),
        ("execute_query", "tool"),
        ("analyze", "tool"),
        ("chain", "run"),
    ]
    gen_query, execute_query = steps_of(channel)[:2]
    assert gen_query.output == "SELECT * FROM orders WHERE order_id = 1003"
    assert "| 1003 | 2026-10-01 | 2026-10-06 | processing |" in execute_query.output
    answer = channel.messages[-1]
    assert answer.text.startswith("Order 1003 is still processing")
    assert components_of(answer) == ["Table", "Button", "Text"]
    assert answer.data["rows"] == [
        {
            "order_id": 1003,
            "order_date": "2026-10-01",
            "estimated_delivery_date": "2026-10-06",
            "status": "processing",
        }
    ]
    await host.action(session, "take_action", {})
    assert channel.messages[-1].text == "Contacting shipping carrier..."


async def test_the_assistant_calls_its_tools_through_the_rules() -> None:
    application, host, channel = hosted(
        "assistant_with_tools",
        ("calculator", {"operation": "multiply", "operand1": 6, "operand2": 7}),
        ("get_current_weather", {"location": "San Francisco, CA"}),
        "6 × 7 is 42, and it is 74 °F, sunny and windy, in San Francisco.",
    )
    # Declared in the spec, as the Canvas lists them; both only read.
    assert {tool.name: tool.does for tool in application.spec.tools} == {
        "get_current_weather": ["read"],
        "calculator": ["read"],
    }
    parameters = {tool.name: tool.parameters for tool in application.spec.tools}
    assert parameters["calculator"]["required"] == ["operation", "operand1", "operand2"]
    assert parameters["calculator"]["properties"]["operation"]["enum"] == [
        "add",
        "subtract",
        "multiply",
        "divide",
    ]
    session = await host.open()
    await host.message(session, "What is 6 times 7, and the weather in San Francisco?")
    assert channel.messages[-1].text == (
        "6 × 7 is 42, and it is 74 °F, sunny and windy, in San Francisco."
    )
    called = application.tools
    assert json.loads(called["calculator"]("divide", 1, 0)) == {
        "error": "Division by zero is not allowed"
    }
    assert json.loads(called["calculator"]("multiply", 6, 7))["result"] == 42


async def test_file_analysis_computes_charts_and_explains_a_csv_sent() -> None:
    application, host, channel = hosted(
        "file_analysis", "The close rose from 100 to 130 over three days."
    )
    assert application.spec.interface.uploads.kinds[0].type == ".csv"
    session = await host.open()
    csv = (
        b"Date,Open,Close\n2026-10-01,99,100\n2026-10-02,101,120\n2026-10-03,119,130\n"
    )
    await host.files(session, [UploadedFile("prices.csv", "text/csv", csv)], "")
    [reading] = steps_of(channel)
    assert reading.output["rows"] == 3
    assert reading.output["figures"]["Close"] == {
        "min": 100.0,
        "max": 130.0,
        "first": 100.0,
        "last": 130.0,
    }
    answer = channel.messages[-1]
    assert components_of(answer) == ["Chart"]
    assert answer.data["points"][-1] == {"Date": "2026-10-03", "Close": 130.0}


async def test_the_voice_assistant_hears_a_voice_note_and_answers_it_spoken(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    application, host, channel = hosted(
        "voice_assistant", "Paris is the capital of France."
    )

    class Speech:
        content = b"RIFF-the-answer"

    class Audio:
        class transcriptions:  # noqa: N801 - OpenAI's shape
            @staticmethod
            async def create(**kwargs: Any) -> Any:
                assert kwargs["model"] == "whisper-1"
                return type("Heard", (), {"text": "What is the capital of France?"})

        class speech:  # noqa: N801 - OpenAI's shape
            @staticmethod
            async def create(**kwargs: Any) -> Any:
                assert kwargs["input"] == "Paris is the capital of France."
                return Speech

    class Client:
        audio = Audio

    reaction = application.handler("file")
    monkeypatch.setitem(reaction.__globals__, "openai_client", lambda: Client)
    session = await host.open()
    assert channel.messages[0].text == (
        "Welcome to the voice example! Send a voice note to talk."
    )
    await host.files(
        session, [UploadedFile("note.webm", "audio/webm", b"\x1aE\xdf\xa3")], ""
    )
    assert [step.name for step in steps_of(channel)] == [
        "speech_to_text",
        "text_to_speech",
    ]
    heard, answer = channel.messages[-2:]
    assert (heard.author, heard.text) == ("You", "What is the capital of France?")
    assert answer.text == "Paris is the capital of France."
    [player] = answer.components
    assert player["component"] == "AudioPlayer"
    assert (
        player["url"]
        == "data:audio/wav;base64," + base64.b64encode(b"RIFF-the-answer").decode()
    )
    # Words typed are not a voice note.
    await host.message(session, "hello")
    assert channel.messages[-1].text == (
        "This is a voice demo: send a voice note to start!"
    )


def _copilot_module() -> Any:
    spec = importlib.util.spec_from_file_location(
        "copilot_parity", EXAMPLES / "copilot.py"
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture()
def copilot(
    runtime: Runtime,  # noqa: F811 - the fixture
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[TestClient]:
    async def create(app: Any, payload: Dict[str, Any], api_prefix: str) -> None:
        runtime.make(payload["name"], payload["app_spec"], {})

    monkeypatch.setattr(mounting, "create_agent", create)
    module = _copilot_module()
    with TestClient(module.api, client=("127.0.0.1", 50000)) as client:
        yield client


def test_the_copilot_sits_in_the_host_page_and_talks_to_it(
    copilot: TestClient,
) -> None:
    page = copilot.get("/").text
    # One script tag and one element, in the developer's own page.
    assert "<h1>Copilot Demo</h1>" in page
    assert '<script src="https://datalayer.ai/embed/datalayer-app.js" async>' in page
    assert '<datalayer-app server="http://testserver/copilot">' in page
    # A bubble in the corner of that page.
    assert '"mode": "bubble"' in page
    started = events_of(
        copilot.post(
            "/copilot/api/v1/apps/sessions",
            json={"agent": "copilot", "session": "session-c-001", "opener": "Hi"},
        )
    )
    assert answer_of(started) == "Hello, world!"
    [told] = [event for event in started if event.get("name") == "loop.window"]
    assert told["value"] == {"data": "Server: Normal message received: Hi"}
    answered = events_of(
        copilot.post(
            "/copilot/api/v1/apps/sessions/session-c-001/window",
            json={"data": "Client: hello from the page"},
        )
    )
    assert answer_of(answered) == "Window message received: Client: hello from the page"
    [told] = [event for event in answered if event.get("name") == "loop.window"]
    assert told["value"] == {
        "data": "Server: Window message received: Client: hello from the page"
    }
