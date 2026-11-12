# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""``loop``'s ``/decisions``: typed questions asked of the agent's decision model.

An agent decides only when its spec names decisions: the command is offered
for such an agent, and says why not for another. It asks the session's runtime
(``POST /api/v1/configure/inference/decisions``), which asks ai-inference as
the ``decide`` tool does, of the model the agent's decisions spec names, with
the runtime's token. ai-inference is mocked.
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

from agent_runtimes.chat.commands import build_registry
from agent_runtimes.chat.commands import decisions as decisions_command
from agent_runtimes.chat.commands.decisions import Unasked, answer_lines, parse
from agent_runtimes.models.offered import give_inference_token
from agent_runtimes.routes import acp as acp_route
from agent_runtimes.routes import agents as agents_route
from agent_runtimes.routes import configure as configure_route
from agent_runtimes.tools.decisions import agent_decisions, decisions_info

#: Two agents of the runtime: one whose spec names decisions, one whose does not.
DECIDER = "example-simple"
PLAIN = "plain-agent"

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

    @app.get("/api/v1/agents/{agent_id}")
    async def agent(agent_id: str) -> dict[str, Any]:
        """Say an agent's decisions as the runtime's agent route does."""
        return {"id": agent_id, "decisions": decisions_info(agent_decisions(agent_id))}

    monkeypatch.setattr(acp_route, "_agents", {DECIDER: object(), PLAIN: object()})
    monkeypatch.setattr(
        agents_route,
        "_agentspecs",
        {DECIDER: {"decisions": "jev:0.0.1"}, PLAIN: {"decisions": None}},
    )
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
        agent_id=DECIDER,
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

    assert "● Decided by Jev (cloudflare:wrk/typesafe/jev)" in said
    assert "is_it_urgent: yes (0.93 that it holds)" in said
    assert "which_team: Billing (confidence 1.00)" in said
    [asked] = seen
    assert str(asked.url) == "https://r1.example/api/ai-inference/v1/decisions"
    assert asked.headers["Authorization"] == "Bearer the-runtime-token"
    body = json.loads(asked.content)
    assert body["model"] == "cloudflare:wrk/typesafe/jev"
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


def test_for_an_agent_whose_spec_names_no_decisions_it_says_so_and_how_to_add_them(
    session: tuple[SimpleNamespace, list[httpx.Request]],
) -> None:
    tux, seen = session
    tux.agent_id = PLAIN
    sentence = (
        "The agent plain-agent does not decide: its spec names no decisions. "
        "To give it the capability, add `decisions: jev:0.0.1` to its agentspec."
    )
    assert _run(tux, f'"{TICKET}" --yes-no "Is it urgent?"') == sentence
    tux.console = Console(file=io.StringIO(), width=300)
    assert _run(tux, "") == sentence
    assert seen == []


def test_the_route_refuses_an_agent_without_decisions_in_its_own_sentence(
    session: tuple[SimpleNamespace, list[httpx.Request]],
) -> None:
    _, seen = session

    async def ask(agent_id: str | None) -> dict[str, Any]:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "http://runtime/api/v1/configure/inference/decisions",
                json={
                    "state": TICKET,
                    "questions": [
                        {
                            "name": "is_it_urgent",
                            "type": "noul",
                            "instructions": "Urgent.",
                        }
                    ],
                    **({"agent_id": agent_id} if agent_id else {}),
                },
            )
        return cast(dict[str, Any], response.json())

    assert asyncio.run(ask(PLAIN)) == {
        "refusal": (
            "Nothing was decided: the agent plain-agent does not decide, its spec "
            "names no decisions. To give it the capability, add "
            "`decisions: jev:0.0.1` to its agentspec."
        )
    }
    assert asyncio.run(ask("nobody")) == {
        "refusal": "Nothing was decided: no agent 'nobody' runs on this runtime."
    }
    assert "say which agent asks" in asyncio.run(ask(None))["refusal"]
    assert seen == []
    assert asyncio.run(ask(DECIDER))["model"] == "cloudflare:wrk/typesafe/jev"


def test_it_is_offered_in_help_and_the_menu_only_for_an_agent_that_decides(
    session: tuple[SimpleNamespace, list[httpx.Request]],
) -> None:
    tux, _ = session
    registry = build_registry(cast(Any, tux), discover=False)

    def listed() -> bool:
        grouped = [
            spec.name for specs in registry.by_group().values() for spec in specs
        ]
        return (
            "decisions" in [spec.name for spec in registry] and "decisions" in grouped
        )

    # Not read yet: not offered, and still answering when typed.
    assert not listed()
    assert registry.resolve("decide") is registry.resolve("decisions") is not None
    assert "decisions" in registry.as_mapping()

    refreshed = asyncio.run(decisions_command.refresh(cast(Any, tux)))
    assert refreshed is not None and refreshed["spec"] == "jev:0.0.1"
    assert listed()

    # Switched to an agent that does not decide: gone from both, until read again.
    tux.agent_id = PLAIN
    assert not listed()
    assert asyncio.run(decisions_command.refresh(cast(Any, tux))) is None
    assert not listed()
    tux.agent_id = DECIDER
    assert asyncio.run(decisions_command.refresh(cast(Any, tux)))
    assert listed()


def test_the_header_says_the_spec_and_its_model() -> None:
    from agent_runtimes.chat.cli import _format_startup_info

    decisions = decisions_info(agent_decisions.__globals__["decisions_spec"]("jev"))
    assert decisions_command.header_value(decisions) == (
        "jev:0.0.1 (cloudflare:wrk/typesafe/jev)"
    )
    assert decisions_command.header_value(None) is None
    with_it = _format_startup_info("h", 1, {"agent": {"decisions": decisions}})
    assert (
        "Decisions" in with_it and "jev:0.0.1 (cloudflare:wrk/typesafe/jev)" in with_it
    )
    assert "Decisions" not in _format_startup_info(
        "h", 1, {"agent": {"decisions": None}}
    )


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
