# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What a person sends (LOOP P-21): images, files and audio, limited by kind
and size by the Appspec, refused by the runtime when the page was bypassed,
and a file sent without being asked handed to ``@app.file``.
"""

from typing import Any, Dict, Iterator, List

import pytest
from fastapi.testclient import TestClient
from pydantic_ai.messages import BinaryContent, ModelMessage, UserPromptPart

from agent_runtimes.loop.apps import (
    Application,
    FileQuestion,
    Session,
    UploadedFile,
    sessions,
    uploads,
)
from agent_runtimes.loop.apps.loading import load_app
from agent_runtimes.tests import test_app_sessions
from agent_runtimes.tests.test_app_sessions import (  # noqa: F401 - fixtures
    ASSISTANT,
    REPORT,
    Runtime,
    Said,
    answer_of,
    data_url,
    events_of,
    local,
    runtime,
)

pytest.importorskip("agentspecs.apps")


class Seen(Said):
    """A model that also keeps what it was given whole: each file's media type."""

    seen: List[str] = []

    def said(self, messages: List[ModelMessage]) -> str:
        for message in messages:
            for part in getattr(message, "parts", []):
                if isinstance(part, UserPromptPart) and isinstance(part.content, list):
                    Seen.seen.extend(
                        item.media_type
                        for item in part.content
                        if isinstance(item, BinaryContent)
                    )
        return super().said(messages)


@pytest.fixture()
def seeing(
    runtime: Runtime,  # noqa: F811 - the fixture
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[Runtime]:
    Seen.seen = []
    monkeypatch.setattr(test_app_sessions, "Said", Seen)
    yield runtime


def file(name: str, media_type: str, content: bytes = b"x") -> Dict[str, Any]:
    return {
        "name": name,
        "type": media_type,
        "size": len(content),
        "data_url": data_url(content, media_type),
    }


def composed(thread: str, text: str, files: List[Dict[str, Any]]) -> Dict[str, Any]:
    """A run as the composer sends it: a message, and files with no block's action."""
    return {
        "threadId": thread,
        "runId": "run-1",
        "messages": [{"id": "m1", "role": "user", "content": text}],
        "tools": [],
        "context": [],
        "forwardedProps": {"loop": {"files": files}},
    }


# --- the rules ------------------------------------------------------------------


def test_a_kind_is_a_media_type_a_family_or_an_extension() -> None:
    assert uploads.kind_takes("image/*", "a.png", "image/png")
    assert uploads.kind_takes("application/pdf", "a", "application/pdf; charset=x")
    assert uploads.kind_takes(".csv", "Orders.CSV", "application/octet-stream")
    assert not uploads.kind_takes("audio/*", "a.webm", "video/webm")
    assert uploads.accepts((), "anything", "")
    app = load_app(ASSISTANT)
    big = UploadedFile("photo.png", "image/png", b"x" * (1024 * 1024 + 1))
    assert uploads.unasked_refused(app, [big]) == (
        "photo.png is 1.0 MB: Notes Assistant takes image/* of at most 1 MB."
    )
    plain = load_app({**ASSISTANT, "interface": {}})
    assert uploads.unasked_refused(plain, [big]) == (
        "Notes Assistant takes no file sent with a message: its Appspec names "
        "none it takes (interface.uploads)."
    )
    # A page with a File upload asks by its block's kinds; one without, by the spec's.
    report = load_app(REPORT)
    assert uploads.page_asks(report) == [((".csv",), 25.0)]
    assert (
        uploads.page_refused(report, [UploadedFile("a.csv", "text/csv", b"a")]) is None
    )
    assert uploads.page_refused(app, [big]) == uploads.unasked_refused(app, [big])


# --- the composer, over AG-UI -----------------------------------------------------


def test_an_image_sent_without_being_asked_goes_to_the_model_whole(
    seeing: Runtime,
    local: TestClient,  # noqa: F811 - the fixture
) -> None:
    seeing.make("notes-assistant", ASSISTANT, {"app_uid": "app-1"})
    png = b"\x89PNG\r\n\x1a\n"
    events = events_of(
        local.post(
            "/api/v1/apps/agents/notes-assistant/ag-ui/",
            json=composed(
                "thread-0101", "What is in it?", [file("p.png", "image/png", png)]
            ),
        )
    )
    assert "RUN_ERROR" not in [event["type"] for event in events]
    # Its words and its picture, in one message: the model saw the image.
    assert Seen.seen == ["image/png"]
    live = sessions.session_of("thread-0101")
    assert live is not None
    [asked] = live.messages[:1]
    assert asked["content"][0] == {
        "type": "text",
        "text": "What is in it?\n\nThe file p.png (image/png) is attached.",
    }
    assert asked["content"][1]["mimeType"] == "image/png"
    assert live.describe()["files"] == [
        {"name": "p.png", "type": "image/png", "size": len(png), "path": ""}
    ]
    # The conversation drawn again says the words, not the bytes.
    assert (
        live.thread()[0]["content"]
        == "What is in it?\n\nThe file p.png (image/png) is attached."
    )


@pytest.mark.parametrize(
    ("files", "sentence"),
    [
        (
            [file("a.pdf", "application/pdf")],
            "a.pdf is not a kind of file Notes Assistant takes: it takes .csv, image/*, application/zip.",
        ),
        (
            [file("p.png", "image/png", b"x" * (2 * 1024 * 1024))],
            "p.png is 2.0 MB: Notes Assistant takes image/* of at most 1 MB.",
        ),
        (
            [
                file("a.csv", "text/csv"),
                file("b.csv", "text/csv"),
                file("c.csv", "text/csv"),
            ],
            "3 files were sent at once: Notes Assistant takes at most 2.",
        ),
    ],
)
def test_what_the_spec_does_not_take_is_refused_when_the_page_was_bypassed(
    runtime: Runtime,  # noqa: F811 - the fixture
    local: TestClient,  # noqa: F811 - the fixture
    files: List[Dict[str, Any]],
    sentence: str,
) -> None:
    model = runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1"})
    refused = local.post(
        "/api/v1/apps/agents/notes-assistant/ag-ui/",
        json=composed("thread-0102", "Look.", files),
    )
    assert (refused.status_code, refused.json()["detail"]) == (422, sentence)
    assert model.prompts == []


def test_an_application_that_names_no_uploads_takes_no_file_with_a_message(
    runtime: Runtime,
    local: TestClient,  # noqa: F811 - the fixture
) -> None:
    runtime.make(
        "notes-assistant", {**ASSISTANT, "interface": {}}, {"app_uid": "app-1"}
    )
    refused = local.post(
        "/api/v1/apps/agents/notes-assistant/ag-ui/",
        json=composed("thread-0103", "Look.", [file("a.csv", "text/csv")]),
    )
    assert refused.status_code == 422
    assert refused.json()["detail"].startswith(
        "Notes Assistant takes no file sent with a message"
    )


def test_a_block_s_action_is_held_to_what_its_page_asks_for(
    runtime: Runtime,
    local: TestClient,  # noqa: F811 - the fixture
) -> None:
    runtime.make("report-from-a-file", REPORT, {"app_uid": "app-3"})
    run = composed("thread-0104", "Report: Full", [file("a.png", "image/png")])
    run["forwardedProps"]["loop"]["action"] = {"name": "run", "payload": {}}
    refused = local.post("/api/v1/apps/agents/report-from-a-file/ag-ui/", json=run)
    assert (refused.status_code, refused.json()["detail"]) == (
        422,
        "a.png is not a kind of file Report from a File's page asks for: it asks for .csv.",
    )


# --- Python: @app.file --------------------------------------------------------------


def desk(received: List[Any]) -> Application:
    application = Application.from_spec(
        {
            "schema": "loop.app/v1",
            "id": "photo-desk",
            "name": "Photo Desk",
            "kind": "chat",
            "agent": "cog-crawler:0.0.1",
            "interface": {"uploads": {"kinds": [{"type": "image/*", "max_mb": 2}]}},
        }
    )

    @application.file
    async def got(session: Session, files: List[UploadedFile], text: str) -> None:
        received.append(([f.name for f in files], text))
        await session.send(f"Got {len(files)} picture(s): {text}")

    return application


def test_a_file_sent_without_being_asked_goes_to_app_file(
    runtime: Runtime,  # noqa: F811 - the fixture
    local: TestClient,  # noqa: F811 - the fixture
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    received: List[Any] = []
    application = desk(received)
    monkeypatch.setattr(sessions, "code_of", lambda app: application)
    model = runtime.make("photo-desk", application.document, {"app_uid": "app-9"})
    events = events_of(
        local.post(
            "/api/v1/apps/agents/photo-desk/ag-ui/",
            json=composed("thread-0105", "Crop it", [file("a.png", "image/png")]),
        )
    )
    assert answer_of(events) == "Got 1 picture(s): Crop it"
    assert received == [(["a.png"], "Crop it")]
    assert model.prompts == []
    live = sessions.session_of("thread-0105")
    assert live is not None
    assert live.messages[0]["content"] == "Crop it\n\n(Sent a.png.)"
    # What its Appspec does not take never reaches its code.
    refused = local.post(
        "/api/v1/apps/agents/photo-desk/ag-ui/",
        json=composed("thread-0106", "And this", [file("a.csv", "text/csv")]),
    )
    assert refused.status_code == 422
    assert received == [(["a.png"], "Crop it")]


def test_without_app_file_the_words_go_to_message_and_the_file_answers_what_it_asks(
    runtime: Runtime,  # noqa: F811 - the fixture
    local: TestClient,  # noqa: F811 - the fixture
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    application = Application.from_spec(
        {
            "schema": "loop.app/v1",
            "id": "asker",
            "name": "Asker",
            "kind": "chat",
            "agent": "cog-crawler:0.0.1",
            "interface": {"uploads": {"kinds": [{"type": "image/*"}]}},
        }
    )

    @application.message
    async def reply(session: Session, text: str) -> None:
        picture = await session.ask(FileQuestion("Which picture?", accept=("image/*",)))
        await session.send(f"{text}: {picture.name}")

    assert application.handler("file") is None
    monkeypatch.setattr(sessions, "code_of", lambda app: application)
    runtime.make("asker", application.document, {"app_uid": "app-8"})
    events = events_of(
        local.post(
            "/api/v1/apps/agents/asker/ag-ui/",
            json=composed("thread-0107", "Look", [file("a.png", "image/png")]),
        )
    )
    # Not asked again: the file sent with the message answers the question.
    assert answer_of(events) == "Look: a.png"
