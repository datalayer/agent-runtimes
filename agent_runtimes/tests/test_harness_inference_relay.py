# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A harness calls ai-inference with no token of the runtime's.

A harness's commands run as its user and read its environment, its files and its
memory, so what it is given is an opaque handle, and a base URL on the pod's
loopback. The runtime keeps the token, adds it there, and sends the call to
ai-inference and nowhere else (`routes.inference_relay`).

Launch the tests:

```
$ pytest agent_runtimes/tests/test_harness_inference_relay.py -v
```
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, AsyncIterator, Dict, Iterator, List

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from agent_runtimes.adapters import harness_inference
from agent_runtimes.adapters.acp_agent import ACPAgent, harness_environment
from agent_runtimes.apps import principal
from agent_runtimes.apps.principal import OWN_ROUTES_ONLY
from agent_runtimes.apps.visitors import OwnRoutesOnly
from agent_runtimes.models import offered
from agent_runtimes.routes import inference_relay, mcp_lent
from agent_runtimes.specs.harnesses import get_harness
from agent_runtimes.tests.test_acp_agent import FAKE, fake_harness, turn
from agent_runtimes.tests.test_apps_runtime_proof import _proof
from agent_runtimes.tests.test_lent_credential import _children_of, _strings_of

TOKEN = "inference-token-" + "k3Vz" * 8
POD = ("127.0.0.1", 50000)
OUTSIDE = ("203.0.113.9", 50000)
AI_INFERENCE = "https://ai-inference.example"
DATALAYER = {
    "AGENT_RUNTIMES_INFERENCE_PROVIDER_OVERRIDE": "datalayer",
    "DATALAYER_AI_INFERENCE_URL": AI_INFERENCE,
}
RELAY = "/api/v1/inference/relay"


@pytest.fixture(autouse=True)
def on_datalayer(monkeypatch: pytest.MonkeyPatch) -> None:
    for name, value in DATALAYER.items():
        monkeypatch.setenv(name, value)
    monkeypatch.setattr(offered, "_given", {"token": TOKEN, "expires_at": None})


async def _chunks(body: bytes) -> AsyncIterator[bytes]:
    yield body


@pytest.fixture()
def reached() -> Iterator[List[httpx.Request]]:
    """
    Mock ai-inference, keeping what reaches it.

    Yields
    ------
    List[httpx.Request]
        The requests it got.
    """
    seen: List[httpx.Request] = []

    def answer(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(
            200,
            headers={
                "content-type": "text/event-stream",
                "set-cookie": "its=own",
                "x-request-id": "r-1",
            },
            content=_chunks(b"data: done\n\n"),
        )

    mcp_lent.use_client(
        lambda: httpx.AsyncClient(transport=httpx.MockTransport(answer))
    )
    yield seen
    mcp_lent.use_client(None)


def _runtime() -> FastAPI:
    runtime = FastAPI()
    runtime.include_router(inference_relay.router, prefix="/api/v1")
    return runtime


def _as_the_harness(**more: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {harness_inference.relay_handle()}", **more}


@pytest.mark.parametrize("harness_id", ["claude-code", "opencode", "pi", "codex"])
def test_a_harness_is_given_no_token(harness_id: str) -> None:
    harness = get_harness(harness_id)
    assert harness is not None
    given = harness_environment(harness, DATALAYER)
    assert TOKEN not in json.dumps(given)
    route = harness_inference.ROUTES[harness_id]
    assert given[route.token_variable] == harness_inference.relay_handle()
    assert given[route.base_url_variable].startswith("http://127.0.0.1:")
    assert AI_INFERENCE not in json.dumps(given)


@pytest.mark.parametrize("harness_id", ["claude-code", "opencode", "pi", "codex"])
def test_nothing_it_writes_or_is_told_at_its_start_holds_it(
    harness_id: str, tmp_path: Path
) -> None:
    """The audit of `write_config_directory`, and of the inline configuration."""
    harness = get_harness(harness_id)
    assert harness is not None
    agent = ACPAgent(
        agent_id="routed",
        harness=harness,
        command=["/nonexistent/harness"],
        workspace=tmp_path,
        environment=harness_environment(harness, DATALAYER),
    )
    agent._give_routed_token()
    assert TOKEN not in json.dumps(dict(agent.agent_env))
    for file in tmp_path.rglob("*"):
        if file.is_file():
            assert TOKEN not in file.read_text(encoding="utf-8"), file


def test_the_call_reaches_ai_inference_with_the_token_in_the_handles_place(
    reached: List[httpx.Request],
) -> None:
    pod = TestClient(_runtime(), client=POD)
    answer = pod.post(
        f"{RELAY}/anthropic/v1/messages?beta=true",
        headers=_as_the_harness(
            **{
                "anthropic-version": "2023-06-01",
                "X-Datalayer-App-Uid": "app-1",
                "Cookie": "a=b",
            }
        ),
        content=b'{"model": "m"}',
    )
    assert answer.status_code == 200, answer.text
    assert answer.text == "data: done\n\n"
    assert answer.headers["content-type"].startswith("text/event-stream")
    assert answer.headers["x-request-id"] == "r-1"
    assert "set-cookie" not in answer.headers
    [call] = reached
    assert str(call.url) == (
        f"{AI_INFERENCE}/api/ai-inference/v1/anthropic/v1/messages?beta=true"
    )
    assert call.headers["authorization"] == f"Bearer {TOKEN}"
    assert call.headers["anthropic-version"] == "2023-06-01"
    assert call.headers["x-datalayer-app-uid"] == "app-1"
    assert "cookie" not in call.headers
    assert call.content == b'{"model": "m"}'
    # Passed on raw: what would come compressed nothing here would decode.
    assert call.headers["accept-encoding"] == "identity"


def test_a_harness_that_says_it_as_a_key_is_answered_the_same(
    reached: List[httpx.Request],
) -> None:
    TestClient(_runtime(), client=POD).post(
        f"{RELAY}/anthropic/v1/messages",
        headers={"x-api-key": harness_inference.relay_handle()},
    )
    assert reached[0].headers["x-api-key"] == TOKEN
    assert reached[0].headers["authorization"] == f"Bearer {TOKEN}"


def test_the_token_is_read_at_each_call(
    reached: List[httpx.Request], monkeypatch: pytest.MonkeyPatch
) -> None:
    """A long session outlives the token it started on: renewed, it goes on."""
    pod = TestClient(_runtime(), client=POD)
    pod.post(f"{RELAY}/chat/completions", headers=_as_the_harness())
    monkeypatch.setattr(offered, "_given", {"token": "renewed", "expires_at": None})
    pod.post(f"{RELAY}/chat/completions", headers=_as_the_harness())
    assert reached[1].headers["authorization"] == "Bearer renewed"


def test_nobody_else_reaches_it(reached: List[httpx.Request]) -> None:
    path = f"{RELAY}/chat/completions"
    outside = TestClient(_runtime(), client=OUTSIDE)
    assert outside.post(path, headers=_as_the_harness()).status_code == 404
    pod = TestClient(_runtime(), client=POD)
    guess = pod.post(path, headers={"Authorization": "Bearer a-guess"})
    assert guess.status_code == 401
    assert pod.post(path).status_code == 401
    assert reached == []


@pytest.mark.parametrize(
    "path", ["../../../iam/v1/secrets", "chat/../../iam", "%2e%2e/iam", "a//b"]
)
def test_it_goes_nowhere_but_under_ai_inferences_root(
    reached: List[httpx.Request], path: str
) -> None:
    answer = TestClient(_runtime(), client=POD).post(
        f"{RELAY}/{path}", headers=_as_the_harness()
    )
    assert answer.status_code == 404
    assert reached == []


def test_with_no_token_it_says_so_and_calls_nothing(
    reached: List[httpx.Request], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(offered, "_given", {"token": None, "expires_at": None})
    monkeypatch.delenv("DATALAYER_AI_INFERENCE_API_KEY", raising=False)
    monkeypatch.delenv("DATALAYER_API_KEY", raising=False)
    answer = TestClient(_runtime(), client=POD).post(
        f"{RELAY}/chat/completions", headers=_as_the_harness()
    )
    assert answer.status_code == 503
    assert answer.json()["detail"] == offered.NO_TOKEN_NOTE
    assert reached == []


def test_a_runtime_not_on_ai_inference_relays_nothing(
    reached: List[httpx.Request], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("AGENT_RUNTIMES_INFERENCE_PROVIDER_OVERRIDE")
    answer = TestClient(_runtime(), client=POD).post(
        f"{RELAY}/chat/completions", headers=_as_the_harness()
    )
    assert answer.status_code == 404
    assert reached == []


def test_a_deployments_runtime_answers_it_to_its_loopback_alone(
    reached: List[httpx.Request], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(principal, "_keep_from_this_user", lambda: None)
    principal.forget_runtime_proof()
    principal.give_runtime_proof(_proof(), "the-pods-secret")
    try:
        gated = OwnRoutesOnly(_runtime())
        path = f"{RELAY}/chat/completions"
        pod = TestClient(gated, client=POD)
        assert pod.post(path, headers=_as_the_harness()).status_code == 200
        outside = TestClient(gated, client=OUTSIDE).post(
            path, headers=_as_the_harness()
        )
        assert outside.status_code == 404
        assert outside.json()["detail"] == OWN_ROUTES_ONLY
    finally:
        principal.forget_runtime_proof()


@pytest.mark.asyncio
async def test_nothing_of_a_running_harness_holds_it(tmp_path: Path) -> None:
    """Its arguments, its environment and its memory, a real process's."""
    workspace = tmp_path / "work"
    workspace.mkdir()
    harness: Any = fake_harness(id="claude-code")
    agent = ACPAgent(
        agent_id="routed",
        harness=harness,
        command=["python", str(FAKE)],
        workspace=workspace,
        environment={
            "PATH": os.environ["PATH"],
            harness_inference.BASE_URL_VARIABLE: harness_inference.base_url(
                harness_inference.ROUTES["claude-code"]
            ),
        },
    )
    try:
        await turn(agent, "hello")
        assert agent.agent_env["ANTHROPIC_AUTH_TOKEN"]
        running = _children_of(os.getpid())
        assert running, "the harness is a process of its own"
        for pid in running:
            assert TOKEN.encode() not in _strings_of(pid)
    finally:
        await agent.cleanup()
