# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The ``decide`` tool: typed questions asked of an agent's decision model.

An agent has it when its spec names decisions (``decisions: jev:0.0.1``): the
tool asks that spec's model, within its limits.

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
from agent_runtimes.specs.actions import BACKEND_TOOL_ACTIONS
from agent_runtimes.specs.agents import get_agent_spec
from agent_runtimes.specs.backend_tools import get_backend_tool_spec
from agent_runtimes.specs.decisions import get_decisions
from agent_runtimes.tools import decisions
from agent_runtimes.tools.decisions import (
    DecisionQuestion,
    NoDecisions,
    decide_tool,
    tools_with_decisions,
)
from agent_runtimes.tools.decisions import decide as undecided

#: The shipped decisions spec, and the tool of an agent that names it.
JEV = get_decisions("jev:0.0.1")
assert JEV is not None
decide = decide_tool(JEV)

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


def test_the_tool_is_a_reader_and_the_simple_agent_has_it_through_its_decisions() -> (
    None
):
    spec = get_backend_tool_spec("decide:0.0.1")
    assert spec is not None and spec.approval == "auto"
    assert spec.runtime.package == "agent_runtimes.tools.decisions"
    assert BACKEND_TOOL_ACTIONS["decide"] == ["read"]
    simple = get_agent_spec("example-simple")
    assert simple is not None and simple.decisions == "jev:0.0.1"
    assert "decide:0.0.1" in simple.backend_tools
    assert any("urgent" in s.text for s in simple.suggestions)


class _Agent:
    """What ``register_agent_tools`` registers on."""

    def __init__(self) -> None:
        self.tools: list[Any] = []

    def tool_plain(self, fn: Any, requires_approval: bool = False) -> None:
        self.tools.append((fn, requires_approval))


def test_decisions_bring_decide_asked_of_the_specs_model(
    inference: list[httpx.Request],
) -> None:
    agent = _Agent()
    assert register_agent_tools(agent, [], agent_id="a", decisions="jev:0.0.1") == [
        "decide"
    ]
    tool, approval = agent.tools[0]
    assert approval is False
    assert "Ask Jev typed questions" in tool.__doc__
    asyncio.run(
        tool(TICKET, [DecisionQuestion(name="u", type="noul", instructions="Urgent.")])
    )
    assert json.loads(inference[0].content)["model"] == JEV.model


def test_decide_without_decisions_is_refused_in_a_sentence_naming_the_agent() -> None:
    with pytest.raises(NoDecisions) as refused:
        register_agent_tools(_Agent(), ["decide:0.0.1"], agent_id="plain")
    assert str(refused.value) == (
        "The agent plain lists the backend tool `decide` but its spec names no "
        "decisions: add `decisions: jev:0.0.1` to its agentspec, which brings the tool."
    )
    assert tools_with_decisions(["runtime-echo:0.0.1"], None, "plain") == [
        "runtime-echo:0.0.1"
    ]
    assert tools_with_decisions(["decide:0.0.1"], "jev", "a") == ["decide:0.0.1"]
    with pytest.raises(NoDecisions, match="has no 'oracle:0.0.1'"):
        tools_with_decisions([], "oracle:0.0.1", "a")


def test_the_catalogues_binding_decides_nothing_alone() -> None:
    said = asyncio.run(undecided(TICKET, []))
    assert said.startswith("Nothing was decided: an agent decides only when")


def test_the_specs_limits_and_question_types_are_kept(
    inference: list[httpx.Request],
) -> None:
    noul = DecisionQuestion(name="u", type="noul", instructions="Urgent.")
    many = [noul.model_copy(update={"name": f"q{i}"}) for i in range(11)]
    assert asyncio.run(decide(TICKET, many)) == (
        "Nothing was decided: Jev takes at most 10 questions in one call, not 11."
    )
    assert asyncio.run(decide("x" * 20001, [noul])) == (
        "Nothing was decided: Jev takes a text of at most 20000 characters, not 20001."
    )
    yes_no_only = decide_tool(JEV.model_copy(update={"questions": ["noul"]}))
    team = DecisionQuestion(
        name="team", type="choice", instructions="Which?", options=["A", "B"]
    )
    assert asyncio.run(yes_no_only(TICKET, [team])) == (
        "Nothing was decided: Jev answers no choice question ('team'): noul."
    )
    assert inference == []
