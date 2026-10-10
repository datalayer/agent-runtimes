# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The typed-decision models ai-inference serves, listed apart as Decisions.

Jev on Workers AI answers a decision's typed questions, not a conversation:
the runtime lists it under ``decision_models`` when ai-inference does, never
among the models an agent may run on, and refuses a switch to it.
"""

from __future__ import annotations

import asyncio
from typing import Any

import httpx
import pytest
from fastapi import FastAPI

from agent_runtimes.models import offered
from agent_runtimes.models.offered import (
    DECISIONS_NOTE,
    NO_TOKEN_NOTE,
    InferenceModels,
    give_inference_token,
    set_inference_models,
)
from agent_runtimes.routes import agents as agents_route

from .test_agents_create_integration import creation_spy  # noqa: F401
from .test_model_switch import (  # noqa: F401
    AGENT,
    QWEN,
    SONNET,
    THROUGH_AI_INFERENCE,
    _configure,
    _models,
    _tux,
    runtime,
)

JEV = "cloudflare:wrk/typesafe/jev"

#: ai-inference's ``GET /api/ai-inference/v1/models`` on r1, 2026-10-04.
R1_PAYLOAD: dict[str, Any] = {
    "models": ["bedrock/us.anthropic.claude-sonnet-4-6", "alibaba/qwen-max"],
    "default_model": "bedrock/us.anthropic.claude-sonnet-4-6",
    "default_provider": "bedrock",
    "providers": ["bedrock", "azure", "alibaba", "cloudflare"],
    "bedrock_anthropic_models": ["bedrock/us.anthropic.claude-sonnet-4-6"],
    "alibaba_models": ["alibaba/qwen-max"],
    "cloudflare_models": [],
    "decision_models": [JEV],
}

REFUSAL = (
    f"{JEV} answers typed decisions, not a conversation: an agent cannot run "
    "on it, so nothing was switched. A decision asks it through /decisions."
)


@pytest.fixture(autouse=True)
def _given_a_token() -> None:
    """The runtime was given its ai-inference token: these tests route through it."""
    give_inference_token("the-runtime-token")


def _serving(decisions: tuple[str, ...]) -> None:
    set_inference_models(
        InferenceModels(
            served=(SONNET, QWEN), decisions=decisions, url="u", note="serves both"
        )
    )


class TestWhatAiInferenceLists:
    def test_jev_is_read_as_a_decision_never_as_a_chat_model(self) -> None:
        assert offered.read_served(R1_PAYLOAD) == [SONNET, QWEN]
        assert offered.read_decisions(R1_PAYLOAD) == [JEV]

    def test_it_is_kept_with_the_answer(self, monkeypatch: pytest.MonkeyPatch) -> None:
        real = httpx.AsyncClient
        monkeypatch.setattr(
            httpx,
            "AsyncClient",
            lambda **kwargs: real(
                transport=httpx.MockTransport(
                    lambda request: httpx.Response(200, json=R1_PAYLOAD)
                ),
                **kwargs,
            ),
        )
        monkeypatch.setenv("DATALAYER_AI_INFERENCE_URL", "https://r1.example")
        set_inference_models(None)
        state = asyncio.run(offered.load_inference_models())
        assert state.served == (SONNET, QWEN)
        assert state.decisions == (JEV,)


class TestTheRuntimesAnswer:
    def test_carries_jev_under_decisions_when_ai_inference_lists_it(
        self, runtime: FastAPI
    ) -> None:
        from agent_runtimes.routes.configure import list_catalog_models

        _serving((JEV,))
        _configure(runtime, agent_id=AGENT, agent_spec=THROUGH_AI_INFERENCE)
        payload = asyncio.run(list_catalog_models(agent_id=AGENT))

        assert [m["id"] for m in payload["models"]] == [SONNET, QWEN]
        assert payload["decisions_note"] == DECISIONS_NOTE
        assert payload["decision_models"] == [
            {
                "id": JEV,
                "name": "Jev (Cloudflare Workers AI)",
                "description": payload["decision_models"][0]["description"],
                "provider": "cloudflare",
                "available": True,
                "reason": None,
                "refusal": REFUSAL,
            }
        ]

    def test_carries_nothing_when_ai_inference_lists_none(
        self, runtime: FastAPI
    ) -> None:
        from agent_runtimes.routes.configure import list_catalog_models

        _serving(())
        _configure(runtime, agent_id=AGENT, agent_spec=THROUGH_AI_INFERENCE)
        payload = asyncio.run(list_catalog_models(agent_id=AGENT))
        assert payload["decision_models"] == []

    def test_without_a_token_they_are_listed_and_not_usable(
        self, runtime: FastAPI
    ) -> None:
        from agent_runtimes.routes.configure import list_catalog_models

        _serving((JEV,))
        _configure(runtime, agent_id=AGENT, agent_spec=THROUGH_AI_INFERENCE)
        give_inference_token(None)
        set_inference_models(InferenceModels(served=None, url="u", note=NO_TOKEN_NOTE))
        payload = asyncio.run(list_catalog_models(agent_id=AGENT))

        assert payload["note"] == NO_TOKEN_NOTE
        rows = {m["id"]: m for m in payload["decision_models"]}
        assert JEV in rows
        assert all(
            (m["available"], m["reason"]) == (False, "No ai-inference token")
            for m in rows.values()
        )

    def test_the_chat_config_carries_them_apart(self) -> None:
        from agent_runtimes.config import get_frontend_config

        _serving((JEV,))
        config = asyncio.run(
            get_frontend_config(
                model_ids=[SONNET, QWEN, JEV], inference_provider="datalayer"
            )
        )
        payload = config.model_dump(by_alias=True)
        assert [m["id"] for m in payload["models"]] == [SONNET, QWEN]
        assert [
            (m["id"], m["name"], m["isAvailable"]) for m in payload["decisionModels"]
        ] == [(JEV, "Jev (Cloudflare Workers AI)", True)]
        assert payload["decisionsNote"] == DECISIONS_NOTE


class TestTheModelsCommand:
    def test_prints_the_decisions_group(
        self, runtime: FastAPI, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _serving((JEV,))
        _configure(runtime, agent_id=AGENT, agent_spec=THROUGH_AI_INFERENCE)
        listing = _models(_tux(runtime, monkeypatch))

        assert "Models (2)" in listing
        decisions = listing.index("Decisions")
        assert listing.index(f"● {QWEN}") < decisions
        assert (
            f"Decisions {DECISIONS_NOTE} ● {JEV} Jev (Cloudflare Workers AI)"
        ) in listing

    def test_a_switch_to_jev_is_refused_and_the_agent_kept(
        self, runtime: FastAPI, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _serving((JEV,))
        _configure(runtime, agent_id=AGENT, agent_spec=THROUGH_AI_INFERENCE)
        tux = _tux(runtime, monkeypatch)

        assert REFUSAL in _models(tux, JEV)
        assert set(agents_route._agentspecs) == {AGENT}
        assert agents_route._agentspecs[AGENT]["model"] == SONNET
        assert tux.loop_session.model == SONNET

        # Asked directly, the runtime refuses it too, before the agent in
        # place is deleted.
        spec = dict(agents_route._agentspecs[AGENT], model=JEV)
        with pytest.raises(Exception) as refused:
            _configure(runtime, agent_id=AGENT, agent_spec=spec)
        assert getattr(refused.value, "status_code", None) == 400
        assert getattr(refused.value, "detail", "") == REFUSAL
        assert agents_route._agentspecs[AGENT]["model"] == SONNET

        # And by the chat's own route, whatever the agent's models.
        assert offered.model_refusal(AGENT, JEV, "datalayer") == REFUSAL
