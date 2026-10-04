# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application's model calls name it, so its owner reads what it spent (LOOP R-09).

Routed through datalayer-ai-inference, every call of an agent that serves an
application instance carries ``X-Datalayer-App-Uid`` and, for a deployment,
``X-Datalayer-Deployment-Uid``: ai-inference stamps both on the call's usage
record on the caller's account.
"""

from __future__ import annotations

import asyncio

import httpx

from agent_runtimes.models import models
from agent_runtimes.models.models import (
    app_instance_of,
    app_usage_headers,
    remember_app_instance,
    resolve_model_for_inference_provider,
)
from agent_runtimes.models.offered import give_inference_token

DEPLOYMENT = {"app_uid": "01APP", "deployment_uid": "01DEP", "version": 3}


def test_a_deployment_names_its_application_and_deployment():
    assert app_usage_headers(DEPLOYMENT) == {
        "X-Datalayer-App-Uid": "01APP",
        "X-Datalayer-Deployment-Uid": "01DEP",
    }


def test_a_preview_names_its_application_alone():
    assert app_usage_headers({"app_uid": "01APP", "purpose": "test"}) == {
        "X-Datalayer-App-Uid": "01APP"
    }


def test_an_agent_no_application_runs_names_nothing():
    assert app_usage_headers(None) == {}
    assert app_usage_headers({}) == {}
    # A deployment without its application is not sent: ai-inference refuses it.
    assert app_usage_headers({"deployment_uid": "01DEP"}) == {}


def test_the_headers_reach_ai_inference_on_every_call(monkeypatch):
    from agent_runtimes.loop.apps.principal import give_principal_token

    monkeypatch.setenv("DATALAYER_AI_INFERENCE_URL", "https://inference.example")
    give_inference_token("the-runtime-token")
    # A deployment calls as its application's principal (LOOP I-03).
    give_principal_token("01DEP", "the-principal-token", expires_in=3600)
    model = resolve_model_for_inference_provider(
        "bedrock:x", "datalayer", app_instance=DEPLOYMENT
    )
    seen: list[httpx.Request] = []

    def answer(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(
            200,
            json={
                "id": "c",
                "object": "chat.completion",
                "created": 0,
                "model": "bedrock:x",
                "choices": [
                    {
                        "index": 0,
                        "finish_reason": "stop",
                        "message": {"role": "assistant", "content": "ok"},
                    }
                ],
            },
        )

    model.client._client._transport = httpx.MockTransport(answer)
    asyncio.run(
        model.client.chat.completions.create(
            model="bedrock:x", messages=[{"role": "user", "content": "hi"}]
        )
    )
    assert seen[0].url.path == "/api/ai-inference/v1/chat/completions"
    assert seen[0].headers["x-datalayer-app-uid"] == "01APP"
    assert seen[0].headers["x-datalayer-deployment-uid"] == "01DEP"
    assert seen[0].headers["authorization"] == "Bearer the-principal-token"


def test_a_model_routed_for_no_application_sends_neither():
    model = resolve_model_for_inference_provider("bedrock:x", "datalayer")
    assert "x-datalayer-app-uid" not in model.client._client.headers


def test_a_local_model_is_untouched():
    assert (
        resolve_model_for_inference_provider(
            "bedrock:x", "local", app_instance=DEPLOYMENT
        )
        == "bedrock:x"
    )


def test_the_runtime_remembers_what_each_agent_serves(monkeypatch):
    monkeypatch.setattr(models, "_APP_INSTANCES", {})
    remember_app_instance("agent-1", DEPLOYMENT)
    assert app_instance_of("agent-1") == DEPLOYMENT
    assert app_instance_of("agent-2") is None
    # Created again as nobody's application: forgotten.
    remember_app_instance("agent-1", None)
    assert app_instance_of("agent-1") is None


def test_the_header_names_are_ai_inference_s():
    """Spelled as ``datalayer_common.usage_dimensions`` spells them; a name
    spelled differently is a call nobody attributes."""
    assert models.APP_UID_HEADER == "X-Datalayer-App-Uid"
    assert models.DEPLOYMENT_UID_HEADER == "X-Datalayer-Deployment-Uid"
