# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A Datalayer pod is given its AgentCore workload token by its companion (ID-06).

``PUT /api/v1/configure/identity/agentcore``, as ``/configure/inference/token``:
only the pod itself (loopback, and the pod's secret when it holds one) may
give it; an empty or missing field is a 422 in a sentence; a later one
replaces it; and the ``agentcore`` identity provider uses it as the
workload token when no invocation carries one.
"""

from __future__ import annotations

from typing import Any, Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from agent_runtimes.agentcore import identity
from agent_runtimes.agentcore.identity import AgentCoreIdentity, use_workload_token
from agent_runtimes.apps import principal
from agent_runtimes.apps.callers import POD_SECRET_HEADER
from agent_runtimes.routes import configure as configure_route

PATH = "/api/v1/configure/identity/agentcore"
POD = ("127.0.0.1", 50000)
GIVEN = {
    "workload_access_token": "workload-token-1",
    "workload_name": "datalayer-01DEPLOYMENT",
    "region": "us-east-1",
}


@pytest.fixture(autouse=True)
def _fresh(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.delenv("AGENT_RUNTIMES_TARGET", raising=False)
    identity.forget_given_workload()
    yield
    identity.forget_given_workload()


def _app() -> FastAPI:
    app = FastAPI()
    app.include_router(configure_route.router, prefix="/api/v1")
    return app


def test_only_the_pod_gives_it(monkeypatch: pytest.MonkeyPatch) -> None:
    outside = TestClient(_app()).put(PATH, json=GIVEN)
    assert outside.status_code == 403
    assert "Only the runtime's own pod" in outside.json()["detail"]
    assert identity.given_workload() == {}

    monkeypatch.setitem(principal._PROOF, "pod_secret", "the-pod-secret")
    pod = TestClient(_app(), client=POD)
    assert pod.put(PATH, json=GIVEN).status_code == 403
    assert (
        pod.put(PATH, json=GIVEN, headers={POD_SECRET_HEADER: "wrong"}).status_code
        == 403
    )
    held = pod.put(PATH, json=GIVEN, headers={POD_SECRET_HEADER: "the-pod-secret"})
    assert held.status_code == 200, held.text
    assert held.json() == {
        "workloadName": GIVEN["workload_name"],
        "region": "us-east-1",
    }


def test_it_is_held_and_a_later_one_replaces_it() -> None:
    pod = TestClient(_app(), client=POD)
    assert pod.put(PATH, json=GIVEN).status_code == 200
    assert identity.given_workload() == GIVEN
    later = {
        **GIVEN,
        "workload_access_token": "workload-token-2",
        "region": "eu-west-1",
    }
    assert pod.put(PATH, json=later).status_code == 200
    assert identity.given_workload() == later


@pytest.mark.parametrize(
    "body, named",
    [
        ({**GIVEN, "workload_access_token": "  "}, "workload_access_token is empty"),
        ({"workload_access_token": "t", "region": "r"}, "workload_name is empty"),
        ({"workload_access_token": "t"}, "workload_name, region are empty"),
    ],
)
def test_an_empty_or_missing_field_is_a_422_in_a_sentence(
    body: dict[str, Any], named: str
) -> None:
    answer = TestClient(_app(), client=POD).put(PATH, json=body)
    assert answer.status_code == 422
    assert named in answer.json()["detail"]
    assert identity.given_workload() == {}


@pytest.mark.asyncio
async def test_the_provider_uses_it_when_no_invocation_carries_one() -> None:
    provider = AgentCoreIdentity(client=object())
    identity.give_workload_token(
        "workload-token-1", GIVEN["workload_name"], GIVEN["region"]
    )
    assert await provider.workload_token({}) == "workload-token-1"
    # An invocation's own token still wins.
    with use_workload_token("invocation-token"):
        assert await provider.workload_token({}) == "invocation-token"


def test_the_client_is_made_in_the_given_region(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "AKIDEXAMPLE")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "secret")
    monkeypatch.delenv("AWS_REGION", raising=False)
    identity.give_workload_token("workload-token-1", "w", "eu-west-1")
    assert AgentCoreIdentity().client().meta.region_name == "eu-west-1"
