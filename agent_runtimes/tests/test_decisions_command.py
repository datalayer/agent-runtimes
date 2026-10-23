# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""``loop``'s ``/decisions``: typed questions asked of Jev through the runtime.

The command asks the session's runtime (``POST
/api/v1/configure/inference/decisions``), which asks ai-inference as the
``decide`` tool does, with the runtime's token. ai-inference is mocked.
"""

from __future__ import annotations

import asyncio
import io
import json
from types import SimpleNamespace
from typing import Any, Iterator, cast

import httpx
import pytest
from fastapi import FastAPI
from rich.console import Console

from agent_runtimes.chat.commands import decisions as decisions_command
from agent_runtimes.chat.commands.decisions import Unasked, answer_lines, parse
from agent_runtimes.models.offered import give_inference_token
from agent_runtimes.routes import configure as configure_route

#: httpx's own client, kept before any test replaces it.
REAL_CLIENT = httpx.AsyncClient

TICKET = "Payouts have failed for 3 days."

#: ai-inference's answers, as Jev gave them on r1.
ANSWERS: dict[str, Any] = {
    "is_it_urgent": {"type": "noul", "probability": 0.93},
    "which_team": {
        "type": "choice",
        "choice": "Billing",
        "confidence": 1.0,
        "probabilities": {"Billing": 1.0, "Sales": 0.0, "Tech": 0.0},
    },
    "how_positive": {
        "type": "score",
        "score": 1.7,
        "confidence": 0.58,
        "probabilities": {"0": 0.01, "1": 0.39, "2": 0.5, "3": 0.1, "4": 0.0},
        "legend": {"0": "1", "1": "2", "2": "3", "3": "4", "4": "5"},
    },
}


class _Routed(httpx.AsyncBaseTransport):
    """The runtime's routes at ``runtime``, a mocked ai-inference elsewhere."""

    def __init__(self, app: FastAPI, seen: list[httpx.Request]) -> None:
        self.runtime = httpx.ASGITransport(app=app)
        self.seen = seen

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        """Route the request to the runtime or to ai-inference."""
        if request.url.host == "runtime":
            return await self.runtime.handle_async_request(request)
        self.seen.append(request)
        asked = json.loads(request.content)
        answers = {name: ANSWERS[name] for name in asked["questions"]}
        return httpx.Response(
            200, json={"model": asked["model"], "answers": answers, "success": True}
        )


@pytest.fixture()
def session(
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[tuple[SimpleNamespace, list[httpx.Request]]]:
    """
    Give ``loop``'s session on a runtime whose ai-inference is mocked.

    Yields
    ------
    tuple[SimpleNamespace, list[httpx.Request]]
        The session, and the requests ai-inference got.
    """
    app = FastAPI()
    app.include_router(configure_route.router, prefix="/api/v1")
    seen: list[httpx.Request] = []
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda *args, **kwargs: REAL_CLIENT(transport=_Routed(app, seen), **kwargs),
    )
    monkeypatch.setenv("DATALAYER_AI_INFERENCE_URL", "https://r1.example")
    give_inference_token("the-runtime-token")
    tux = SimpleNamespace(
        console=Console(file=io.StringIO(), width=300),
        server_url="http://runtime",
        where=None,
    )
    yield tux, seen
    give_inference_token(None)


def _run(tux: SimpleNamespace, argv: str) -> str:
    """Run ``/decisions argv`` and return what it printed, on one line."""
    asyncio.run(decisions_command.execute(cast(Any, tux), argv))
    return " ".join(tux.console.file.getvalue().split())


def test_the_line_names_the_text_and_its_typed_questions() -> None:
    state, questions = parse(
        f'"{TICKET}" --yes-no "Is it urgent?" '
        '--choice "Which team?" Billing,Tech,Sales --score "How positive?" 1-5'
    )
    assert state == TICKET
    assert [(q.name, q.type, q.instructions, q.options) for q in questions] == [
        ("is_it_urgent", "noul", "Is it urgent?", []),
        ("which_team", "choice", "Which team?", ["Billing", "Tech", "Sales"]),
        ("how_positive", "score", "How positive?", ["1", "2", "3", "4", "5"]),
    ]


@pytest.mark.parametrize(
    ("argv", "why"),
    [
        ('--yes-no "Is it urgent?"', "Say the text"),
        (f'"{TICKET}"', "Ask at least one question"),
        (f'"{TICKET}" --choice "Which team?"', "--choice needs a question and its"),
        (f'"{TICKET}" --maybe "Is it?"', "--maybe is not a question"),
        (f"{TICKET} --yes-no Urgent?", "Quote the text"),
    ],
)
def test_a_line_that_does_not_say_what_to_ask_is_refused(argv: str, why: str) -> None:
    with pytest.raises(Unasked, match=why):
        parse(argv)


def test_each_answer_is_one_plain_line() -> None:
    assert answer_lines(ANSWERS) == [
        "is_it_urgent: yes (0.93 that it holds)",
        "which_team: Billing (confidence 1.00)",
        "how_positive: 3 (0.50), score 1.7 of 4, confidence 0.58",
    ]


def test_jev_is_asked_through_the_runtime_with_its_token(
    session: tuple[SimpleNamespace, list[httpx.Request]],
) -> None:
    tux, seen = session
    said = _run(
        tux,
        f'"{TICKET}" --yes-no "Is it urgent?" --choice "Which team?" Billing,Tech,Sales',
    )

    assert "● Decided by cloudflare:wrk/typesafe/jev" in said
    assert "is_it_urgent: yes (0.93 that it holds)" in said
    assert "which_team: Billing (confidence 1.00)" in said
    [asked] = seen
    assert str(asked.url) == "https://r1.example/api/ai-inference/v1/decisions"
    assert asked.headers["Authorization"] == "Bearer the-runtime-token"
    body = json.loads(asked.content)
    assert body["state"] == TICKET
    assert body["questions"]["which_team"] == {
        "type": "choice",
        "instructions": "Which team?",
        "criteria": {"Billing": "Billing", "Tech": "Tech", "Sales": "Sales"},
    }


def test_without_a_token_the_runtime_says_why_nothing_was_decided(
    session: tuple[SimpleNamespace, list[httpx.Request]],
) -> None:
    tux, seen = session
    give_inference_token(None)
    said = _run(tux, f'"{TICKET}" --yes-no "Is it urgent?"')

    assert "Nothing was decided." in said
    assert seen == []


def test_with_nothing_typed_it_shows_how(
    session: tuple[SimpleNamespace, list[httpx.Request]],
) -> None:
    tux, seen = session
    said = _run(tux, "")

    assert '/decisions "<text>" --yes-no "<question>"' in said
    assert "For example: /decisions" in said
    assert seen == []


def test_an_older_runtime_is_said_to_be_older(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A runtime without the route answers 404: the command says so, with versions."""
    older = FastAPI()

    @older.get("/api/v1/runtime/status")
    async def status() -> dict[str, str]:
        """Answer as an older runtime does."""
        return {"version": "1.3.32"}

    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda *args, **kwargs: REAL_CLIENT(
            transport=httpx.ASGITransport(app=older), **kwargs
        ),
    )
    tux = SimpleNamespace(
        console=Console(file=io.StringIO(), width=300),
        server_url="http://runtime",
        where=None,
    )
    said = _run(tux, f'"{TICKET}" --yes-no "Is it urgent?"')

    assert (
        "This runtime (agent-runtimes 1.3.32) does not say decisions (/decisions): "
        "it is older than this loop" in said
    )
