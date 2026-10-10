# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An agentspec's suggestions, served with its agent and offered by ``/suggestions``.

On Datalayer the pod companion creates the agent through ``configure-from-spec``
with the agentspec's id and the spec the platform forwards, which need not
carry them: the agent serves its agentspec's suggestions all the same.
"""

from __future__ import annotations

import asyncio
from typing import Any, cast

import httpx
import pytest
from fastapi import FastAPI

from agent_runtimes.chat.commands import suggestions as suggestions_command
from agent_runtimes.models.offered import InferenceModels, set_inference_models
from agent_runtimes.routes import agents as agents_route
from agent_runtimes.routes.agents import get_library_agent_spec

from .test_agents_create_integration import creation_spy  # noqa: F401
from .test_model_switch import (  # noqa: F401
    AGENT,
    QWEN,
    SONNET,
    SPEC,
    _configure,
    _given_a_token,
    _models,
    _said,
    _tux,
    runtime,
)


def _library_suggestions() -> list[dict[str, Any]]:
    """Return the library agentspec's suggestions, as records."""
    spec = get_library_agent_spec(SPEC)
    assert spec is not None
    return [item.model_dump() for item in spec.suggestions]


#: The client itself: ``_tux`` points ``httpx.AsyncClient`` at the runtime.
_CLIENT = httpx.AsyncClient


def _served_spec(app: FastAPI, agent_id: str) -> dict[str, Any]:
    """Return the agent's creation spec, as the runtime serves it."""

    async def read() -> dict[str, Any]:
        """Read it over the runtime's route."""
        async with _CLIENT(
            transport=httpx.ASGITransport(app=app), base_url="http://runtime"
        ) as client:
            response = await client.get(f"/api/v1/configure/agents/{agent_id}/spec")
            response.raise_for_status()
            return cast(dict[str, Any], response.json())

    return asyncio.run(read())


@pytest.mark.parametrize(
    "forwarded",
    [None, {"id": SPEC, "name": "A Simple Agent", "model": SONNET}],
    ids=["no-spec", "a-spec-without-suggestions"],
)
def test_the_companions_agent_serves_its_agentspecs_suggestions(
    runtime: FastAPI,  # noqa: F811
    forwarded: dict[str, Any] | None,
) -> None:
    """As the companion calls it: the agentspec's id, the platform's spec."""
    _configure(runtime, agent_spec=forwarded)

    served = _served_spec(runtime, "default")
    assert served["agent_spec_id"] == SPEC
    assert served["suggestions"] == _library_suggestions()
    assert len(served["suggestions"]) == 7
    assert served["suggestions"][0] == {
        "text": "Tell me a joke",
        "summary": "Tell a joke",
        "icon": None,
        "emoji": None,
    }


def test_a_switch_keeps_them(
    runtime: FastAPI,  # noqa: F811
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A switch forwards the stored spec: its suggestions stay."""
    set_inference_models(
        InferenceModels(served=(SONNET, QWEN), url="u", note="serves both")
    )
    _configure(runtime, agent_id=AGENT, agent_spec={"inference_provider": "datalayer"})
    _models(_tux(runtime, monkeypatch), QWEN)

    assert agents_route._agentspecs[AGENT]["model"] == QWEN
    assert _served_spec(runtime, AGENT)["suggestions"] == _library_suggestions()


def test_listed_under_prompt_with_the_flags_and_nothing_asked(
    runtime: FastAPI,  # noqa: F811
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Under ``loop --prompt`` the next line is the next prompt, not a choice."""
    _configure(runtime, agent_id=AGENT)
    tux = _tux(runtime, monkeypatch)
    tux.extra_suggestions = ["What is new?"]
    tux.scripted = True

    def no_input(prompt: str = "") -> str:
        """Refuse to be asked."""
        raise AssertionError("asked under --prompt")

    monkeypatch.setattr("builtins.input", no_input)
    chosen = asyncio.run(suggestions_command.execute(cast(Any, tux)))

    said = _said(tux)
    assert chosen is None
    assert "Suggestions (8):" in said
    assert "1. Tell a joke Tell me a joke" in said
    assert "5. Decide: is it urgent? Is this support ticket urgent?" in said
    assert "8. What is new?" in said
    assert "{" not in said


@pytest.mark.parametrize(
    ("typed", "sent"),
    [
        ("5", "Is this support ticket urgent? 'Payouts have failed for 3 days.'"),
        ("8", "What is new?"),
    ],
)
def test_the_chosen_suggestions_text_is_sent(
    runtime: FastAPI,  # noqa: F811
    monkeypatch: pytest.MonkeyPatch,
    typed: str,
    sent: str,
) -> None:
    """The text is sent, not the summary nor the record."""
    _configure(runtime, agent_id=AGENT)
    tux = _tux(runtime, monkeypatch)
    tux.extra_suggestions = ["What is new?"]
    tux.scripted = False
    monkeypatch.setattr("builtins.input", lambda prompt="": typed)

    assert asyncio.run(suggestions_command.execute(cast(Any, tux))) == sent


def test_an_older_runtime_is_said_to_be_older(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A runtime whose creation spec has no suggestions: a sentence, no KeyError."""
    older = FastAPI()

    @older.get("/api/v1/configure/agents/{agent_id}/spec")
    async def spec(agent_id: str) -> dict[str, Any]:
        """Answer as a runtime before 1.3.33 does."""
        return {"agent_spec_id": SPEC}

    @older.get("/api/v1/runtime/status")
    async def status() -> dict[str, str]:
        """Say its version."""
        return {"version": "1.3.32"}

    tux = _tux(older, monkeypatch)
    tux.extra_suggestions = []
    tux.scripted = True
    asyncio.run(suggestions_command.execute(cast(Any, tux)))

    assert (
        "This runtime (agent-runtimes 1.3.32) does not say its agent's "
        "suggestions: it is older than this loop" in _said(tux)
    )
