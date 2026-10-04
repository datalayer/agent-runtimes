# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The ``decide`` tool: typed questions asked of Jev through ai-inference.

ai-inference is mocked: what the tool sends to ``POST /decisions``, with which
token, and what it gives the agent back — the typed answers, or a sentence
saying why nothing was decided.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, Iterator

import httpx
import pytest

from agent_runtimes.models.offered import NO_TOKEN_NOTE, give_inference_token
from agent_runtimes.services.runtime_tools import register_agent_tools
from agent_runtimes.specs.actions import TOOL_ACTIONS
from agent_runtimes.specs.agents import get_agent_spec
from agent_runtimes.specs.tools import get_tool_spec
from agent_runtimes.tools import decisions
from agent_runtimes.tools.decisions import DecisionQuestion, decide

#: httpx's own client, kept before any test replaces it.
REAL_CLIENT = httpx.AsyncClient

TICKET = "Payouts have failed for 3 days."

#: ai-inference's answer, as its envelope flattens it over ``success``.
ANSWERED: dict[str, Any] = {
    "success": True,
    "message": "Decision made",
    "provider": "cloudflare",
    "model": "cloudflare:wrk/typesafe/jev",
    "answers": {"urgent": {"type": "noul", "probability": 0.93}},
    "usage": {"input_tokens": 120, "output_tokens": 0},
}


@pytest.fixture()
def inference(monkeypatch: pytest.MonkeyPatch) -> Iterator[list[httpx.Request]]:
    """
    Mock ai-inference at a fake URL, answering ``ANSWERED``.

    Yields
    ------
    list[httpx.Request]
        The requests it got.
    """
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=ANSWERED)

    def client(*args: Any, **kwargs: Any) -> httpx.AsyncClient:
        kwargs["transport"] = httpx.MockTransport(handler)
        return REAL_CLIENT(*args, **kwargs)

    monkeypatch.setattr(decisions.httpx, "AsyncClient", client)
    monkeypatch.setenv("DATALAYER_AI_INFERENCE_URL", "https://r1.example")
    monkeypatch.delenv("DATALAYER_AI_INFERENCE_API_KEY", raising=False)
    monkeypatch.delenv("DATALAYER_API_KEY", raising=False)
    give_inference_token("given-token")
    yield seen
    give_inference_token(None)


def test_a_noul_question_is_asked_of_jev_with_the_runtimes_token(
    inference: list[httpx.Request],
) -> None:
    answer = asyncio.run(
        decide(
            TICKET,
            [
                DecisionQuestion(
                    name="urgent", type="noul", instructions="It is urgent."
                )
            ],
        )
    )
    assert answer == {
        "model": "cloudflare:wrk/typesafe/jev",
        "answers": {"urgent": {"type": "noul", "probability": 0.93}},
    }
    (request,) = inference
    assert str(request.url) == "https://r1.example/api/ai-inference/v1/decisions"
    assert request.headers["Authorization"] == "Bearer given-token"
    assert json.loads(request.content) == {
        "model": "cloudflare:wrk/typesafe/jev",
        "state": TICKET,
        "questions": {"urgent": {"type": "noul", "instructions": "It is urgent."}},
    }


def test_a_choice_names_its_options_and_a_score_its_steps_lowest_first(
    inference: list[httpx.Request],
) -> None:
    asyncio.run(
        decide(
            "I was charged twice.",
            [
                DecisionQuestion(
                    name="team",
                    type="choice",
                    instructions="Which team handles it?",
                    options=["Billing", "Tech", "Sales"],
                ),
                DecisionQuestion(
                    name="tone",
                    type="score",
                    instructions="How positive is it?",
                    options=["1", "2", "3", "4", "5"],
                ),
            ],
        )
    )
    questions = json.loads(inference[0].content)["questions"]
    assert questions["team"]["criteria"] == {
        "Billing": "Billing",
        "Tech": "Tech",
        "Sales": "Sales",
    }
    assert questions["tone"]["criteria"] == ["1", "2", "3", "4", "5"]


def test_without_a_token_nothing_is_asked_and_it_says_why(
    inference: list[httpx.Request],
) -> None:
    give_inference_token(None)
    answer = asyncio.run(
        decide(
            TICKET, [DecisionQuestion(name="u", type="noul", instructions="Urgent.")]
        )
    )
    assert answer == f"Nothing was decided. {NO_TOKEN_NOTE}"
    assert inference == []


def test_without_ai_inference_nothing_is_asked(
    inference: list[httpx.Request], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("DATALAYER_AI_INFERENCE_URL")
    answer = asyncio.run(
        decide(
            TICKET, [DecisionQuestion(name="u", type="noul", instructions="Urgent.")]
        )
    )
    assert "DATALAYER_AI_INFERENCE_URL is unset" in str(answer)
    assert inference == []


def test_a_question_that_cannot_be_asked_is_refused_before_the_call(
    inference: list[httpx.Request],
) -> None:
    one_option = DecisionQuestion(
        name="team", type="choice", instructions="Which?", options=["Billing"]
    )
    assert "at least two options" in str(asyncio.run(decide(TICKET, [one_option])))
    assert "at least one question" in str(asyncio.run(decide(TICKET, [])))
    twice = DecisionQuestion(name="u", type="noul", instructions="Urgent.")
    assert "same name" in str(asyncio.run(decide(TICKET, [twice, twice])))
    assert inference == []


def test_a_refusal_of_ai_inference_is_said_with_its_words(
    monkeypatch: pytest.MonkeyPatch, inference: list[httpx.Request]
) -> None:
    def refuse(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            503, json={"detail": "Typed decisions are not available."}
        )

    def client(*args: Any, **kwargs: Any) -> httpx.AsyncClient:
        kwargs["transport"] = httpx.MockTransport(refuse)
        return REAL_CLIENT(*args, **kwargs)

    monkeypatch.setattr(decisions.httpx, "AsyncClient", client)
    answer = asyncio.run(
        decide(
            TICKET, [DecisionQuestion(name="u", type="noul", instructions="Urgent.")]
        )
    )
    assert answer == (
        "Nothing was decided: ai-inference refused it (503): "
        "Typed decisions are not available."
    )


def test_the_tool_is_a_reader_and_the_simple_agent_has_it() -> None:
    spec = get_tool_spec("decide:0.0.1")
    assert spec is not None and spec.approval == "auto"
    assert spec.runtime.package == "agent_runtimes.tools.decisions"
    assert TOOL_ACTIONS["decide"] == ["read"]
    simple = get_agent_spec("example-simple")
    assert simple is not None and "decide:0.0.1" in simple.tools
    assert any("urgent" in s.text for s in simple.suggestions)


def test_it_registers_on_an_agent_as_decide() -> None:
    class Agent:
        def __init__(self) -> None:
            self.tools: list[Any] = []

        def tool_plain(self, fn: Any, requires_approval: bool = False) -> None:
            self.tools.append((fn, requires_approval))

    agent = Agent()
    assert register_agent_tools(agent, ["decide:0.0.1"]) == ["decide"]
    assert agent.tools[0][1] is False
