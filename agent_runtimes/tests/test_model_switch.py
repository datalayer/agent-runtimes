# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""``loop``'s ``/models <id>`` on an agent created from a library agentspec.

Driven through the runtime's own routes — ``/configure/models``, the agent's
creation spec and ``configure-from-spec`` — on ``example-simple``, whose
agentspec runs on Sonnet 4.6 and lists ``alibaba:qwen-max`` beside it.
"""

from __future__ import annotations

import asyncio
import io
from types import SimpleNamespace
from typing import Any, cast

import httpx
import pytest
from fastapi import FastAPI
from rich.console import Console

from agent_runtimes.chat.commands import models as models_command
from agent_runtimes.models import offered
from agent_runtimes.models.offered import (
    InferenceModels,
    give_inference_token,
    set_inference_models,
)
from agent_runtimes.routes import agents as agents_route
from agent_runtimes.routes import configure as configure_route
from agent_runtimes.routes.agents import (
    ConfigureFromSpecRequest,
    configure_from_spec_endpoint,
)

from .test_agents_create_integration import creation_spy  # noqa: F401


@pytest.fixture(autouse=True)
def _given_a_token() -> None:
    """The runtime was given its ai-inference token: these tests route through it."""
    give_inference_token("the-runtime-token")


SONNET = "bedrock:us.anthropic.claude-sonnet-4-6"
QWEN = "alibaba:qwen-max"
OPUS = "bedrock:us.anthropic.claude-opus-5"
SPEC = "example-simple"
AGENT = "chat"


@pytest.fixture
def runtime(
    monkeypatch: pytest.MonkeyPatch,
    creation_spy: dict[str, object],  # noqa: F811
) -> FastAPI:
    """A runtime with the agents and configure routes, its agents its own."""
    monkeypatch.setattr(agents_route, "_agents", {})
    monkeypatch.setattr(agents_route, "_agentspecs", {})
    monkeypatch.setattr(
        agents_route,
        "resolve_model_for_inference_provider",
        lambda model, *args, **kwargs: model,
    )
    monkeypatch.setattr(
        agents_route, "_emit_agent_assigned_event", lambda **kwargs: None
    )

    async def no_mcp(*args: Any, **kwargs: Any) -> tuple[list, list, list, bool]:
        return [], [], [], False

    monkeypatch.setattr(agents_route, "_start_mcp_servers_for_agent", no_mcp)

    class Sandboxes:
        """No Jupyter server is started for the agent's sandbox."""

        variant = "jupyter-server"
        config = SimpleNamespace(env_vars={}, jupyter_url=None, mcp_proxy_url=None)

        def __getattr__(self, name: str) -> Any:
            return lambda *args, **kwargs: SimpleNamespace()

    monkeypatch.setattr(
        "agent_runtimes.services.code_sandbox_manager.get_code_sandbox_manager",
        lambda: Sandboxes(),
    )
    monkeypatch.setattr(
        agents_route, "create_shared_sandbox", lambda *args, **kwargs: None
    )
    monkeypatch.setattr(
        "agent_runtimes.models.local.discover_installed_models",
        lambda *args, **kwargs: {},
    )
    app = FastAPI()
    app.include_router(agents_route.router, prefix="/api/v1")
    app.include_router(configure_route.router, prefix="/api/v1")
    return app


def _request(app: FastAPI) -> Any:
    return SimpleNamespace(
        app=app, base_url="http://runtime/", headers={}, url="http://runtime/"
    )


#: Forwarded at creation: the agent's inference goes through ai-inference.
THROUGH_AI_INFERENCE = {"inference_provider": "datalayer"}


def _configure(app: FastAPI, **body: Any) -> dict[str, Any]:
    return asyncio.run(
        configure_from_spec_endpoint(
            _request(app), ConfigureFromSpecRequest(agent_spec_id=SPEC, **body)
        )
    )


def _tux(app: FastAPI, monkeypatch: pytest.MonkeyPatch) -> SimpleNamespace:
    """Return ``loop``'s session, talking to the runtime's routes."""
    real = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **kwargs: real(transport=httpx.ASGITransport(app=app), **kwargs),
    )
    return SimpleNamespace(
        console=Console(file=io.StringIO(), width=200),
        server_url="http://runtime",
        agent_id=AGENT,
        where=None,
        loop_session=SimpleNamespace(model=SONNET),
    )


def _said(tux: SimpleNamespace) -> str:
    return " ".join(tux.console.file.getvalue().split())


def _models(tux: SimpleNamespace, argv: str = "") -> str:
    tux.console.file.truncate(0)
    tux.console.file.seek(0)
    asyncio.run(models_command.execute(cast(Any, tux), argv))
    return _said(tux)


def test_a_switch_recreates_the_agent_on_the_model_asked_for(
    runtime: FastAPI,
    monkeypatch: pytest.MonkeyPatch,
    creation_spy: dict[str, object],  # noqa: F811
) -> None:
    set_inference_models(
        InferenceModels(served=(SONNET, QWEN), url="u", note="serves both")
    )
    _configure(runtime, agent_id=AGENT, agent_spec=THROUGH_AI_INFERENCE)
    assert agents_route._agentspecs[AGENT]["model"] == SONNET
    assert offered.offered_model_ids(AGENT) == [SONNET, QWEN]

    tux = _tux(runtime, monkeypatch)
    listing = _models(tux)
    assert f"● {SONNET} (active)" in listing and f"● {QWEN}" in listing
    assert "Models (2)" in listing

    said = _models(tux, QWEN)
    assert "Model: Alibaba Qwen-Max" in said, said
    # The agent loop talks to was recreated on Qwen — not on the library
    # spec's Sonnet, and not as another agent beside it.
    assert set(agents_route._agentspecs) == {AGENT}
    assert agents_route._agentspecs[AGENT]["model"] == QWEN
    assert creation_spy["pydantic_model"] == QWEN
    # It may be switched back: its models are the same.
    assert offered.offered_model_ids(AGENT) == [SONNET, QWEN]
    _models(tux, SONNET)
    assert agents_route._agentspecs[AGENT]["model"] == SONNET


def test_a_model_ai_inference_does_not_serve_is_refused_and_the_agent_kept(
    runtime: FastAPI, monkeypatch: pytest.MonkeyPatch
) -> None:
    set_inference_models(InferenceModels(served=(SONNET,), url="u", note="sonnet"))
    _configure(runtime, agent_id=AGENT, agent_spec=THROUGH_AI_INFERENCE)
    tux = _tux(runtime, monkeypatch)

    # Only what ai-inference serves is listed: Qwen is not, and a switch to
    # it is refused with what ai-inference serves.
    listing = _models(tux)
    assert "Models (1)" in listing and QWEN not in listing
    assert "Not running" not in listing and "Installed locally" not in listing
    assert (
        f"this runtime does not offer {QWEN} to this agent: nothing was "
        "switched. sonnet" in _models(tux, QWEN)
    )
    assert f"does not offer {OPUS} to this agent" in _models(tux, OPUS)

    # Asked directly, the runtime refuses it too — before the agent in
    # place is deleted.
    spec = dict(agents_route._agentspecs[AGENT], model=QWEN)
    with pytest.raises(Exception) as refused:
        _configure(runtime, agent_id=AGENT, agent_spec=spec)
    assert getattr(refused.value, "status_code", None) == 400
    assert getattr(refused.value, "detail", "") == (
        f"ai-inference does not serve {QWEN} (it serves {SONNET}): "
        "nothing was switched."
    )
    assert set(agents_route._agentspecs) == {AGENT}
    assert agents_route._agentspecs[AGENT]["model"] == SONNET


def test_a_library_agent_off_the_default_model_is_switched_too(
    runtime: FastAPI,
    monkeypatch: pytest.MonkeyPatch,
    creation_spy: dict[str, object],  # noqa: F811
) -> None:
    """Its library spec's model no longer wins over the model asked for.

    ``example-simple`` on Qwen, with Sonnet 4.6 — the runtime's default
    model — beside it: the library spec's model used to be applied first,
    and the forwarded spec's only while the default was still in place, so
    a switch recreated the agent on Qwen again.
    """
    library = agents_route.get_library_agent_spec(SPEC)
    assert library is not None
    on_qwen = library.model_copy(update={"model": QWEN, "model_additionals": [SONNET]})
    monkeypatch.setattr(agents_route, "get_library_agent_spec", lambda _id: on_qwen)
    set_inference_models(
        InferenceModels(served=(SONNET, QWEN), url="u", note="serves both")
    )
    _configure(runtime, agent_id=AGENT, agent_spec=THROUGH_AI_INFERENCE)
    assert agents_route._agentspecs[AGENT]["model"] == QWEN

    tux = _tux(runtime, monkeypatch)
    tux.loop_session.model = QWEN
    assert "Model: Bedrock Claude Sonnet 4.6" in _models(tux, SONNET)
    assert agents_route._agentspecs[AGENT]["model"] == SONNET
    assert creation_spy["pydantic_model"] == SONNET
    assert offered.offered_model_ids(AGENT) == [QWEN, SONNET]
