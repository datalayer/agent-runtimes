# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The token AgentCore validated, exchanged at IAM for the platform's (AC-06).

IAM is a fake behind httpx's mock transport, answering as the real one does:
form-encoded RFC 8693, ``resource`` the runtime's ARN, which must be the
inbound token's audience, OAuth errors otherwise. The agent's AG-UI app is a
fake that reads what the run was given: its bearer, and the ai-inference
token its model calls would send.
"""

from __future__ import annotations

import json
from typing import Any, Dict, Iterator, List
from urllib.parse import parse_qs

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from agent_runtimes.agentcore import contract, exchange
from agent_runtimes.agentcore.contract import LIVENESS, SESSION_HEADER
from agent_runtimes.agentcore.exchange import (
    INFERENCE_AUDIENCE,
    PLATFORM_AUDIENCE,
    ExchangeRefused,
    TokenExchange,
    exchange_from_env,
)
from agent_runtimes.agentcore.session_ids import session_uid_to_agentcore
from agent_runtimes.models import offered

IAM = "https://iam.test"
RUNTIME = "arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/marketer-AbC123"
OTHER = "arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/another-Q1"
#: The inbound tokens, by the runtime they were issued for (their ``aud``).
INBOUND = {"rs256-for-marketer": RUNTIME, "rs256-for-another": OTHER}
UID = "session-0001"
SID = session_uid_to_agentcore(UID)


class FakeIAM:
    """IAM's token endpoint for the reverse exchange."""

    def __init__(self) -> None:
        self.asked: List[Dict[str, str]] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        assert request.url == f"{IAM}/api/iam/v1/oauth/token"
        assert request.headers["content-type"] == "application/x-www-form-urlencoded"
        form = {k: v[0] for k, v in parse_qs(request.content.decode()).items()}
        self.asked.append(form)
        assert form["grant_type"] == exchange.GRANT_TYPE
        audience = INBOUND.get(form["subject_token"])
        if audience is None:
            return httpx.Response(
                401,
                json={
                    "error": "invalid_grant",
                    "error_description": "The subject token is not valid.",
                },
            )
        if form["resource"] != audience:
            return httpx.Response(
                401,
                json={
                    "error": "invalid_grant",
                    "error_description": (
                        f"The subject token was not issued for {form['resource']}."
                    ),
                },
            )
        kind = "inference" if form["audience"] == INFERENCE_AUDIENCE else "platform"
        return httpx.Response(
            200,
            json={
                "access_token": f"{kind}-of-{form['subject_token']}",
                "issued_token_type": exchange.ACCESS_TOKEN_TYPE,
                "token_type": "Bearer",
                "expires_in": 900,
                "scope": "",
            },
        )


class Clock:
    """A clock a test moves."""

    def __init__(self) -> None:
        self.now = 1_000_000.0

    def __call__(self) -> float:
        return self.now


def _exchange(iam: FakeIAM, clock: Clock | None = None) -> TokenExchange:
    return TokenExchange(
        IAM,
        RUNTIME,
        client=lambda: httpx.AsyncClient(transport=httpx.MockTransport(iam)),
        clock=clock or Clock(),
    )


class SeenApp:
    """The agent's AG-UI app: it notes the run's bearer and inference token."""

    def __init__(self) -> None:
        self.seen: List[Dict[str, Any]] = []

    async def __call__(self, scope: Any, receive: Any, send: Any) -> None:
        await receive()
        headers = {k.decode(): v.decode() for k, v in scope["headers"]}
        self.seen.append(
            {
                "authorization": headers.get("authorization"),
                "inference": offered.inference_token(),
            }
        )
        await send(
            {
                "type": "http.response.start",
                "status": 200,
                "headers": [(b"content-type", b"text/event-stream")],
            }
        )
        event = {"type": "TEXT_MESSAGE_CONTENT", "delta": "done"}
        await send(
            {
                "type": "http.response.body",
                "body": f"data: {json.dumps(event)}\n\n".encode(),
            }
        )


@pytest.fixture()
def seen(monkeypatch: pytest.MonkeyPatch) -> Iterator[SeenApp]:
    app = SeenApp()
    monkeypatch.setattr(contract, "_agent_app", lambda: app)
    LIVENESS.reset()
    contract.forget_held()
    yield app
    exchange.forget_exchange()
    contract.forget_held()
    LIVENESS.reset()


@pytest.fixture()
def client() -> Iterator[TestClient]:
    app = FastAPI()
    app.include_router(contract.router)
    with TestClient(app) as test_client:
        yield test_client


def _invoke(client: TestClient, bearer: str, prompt: str = "hello") -> Any:
    return client.post(
        "/invocations",
        json={"prompt": prompt},
        headers={SESSION_HEADER: SID, "Authorization": f"Bearer {bearer}"},
    )


def test_a_turn_runs_with_the_caller_s_platform_and_inference_tokens(
    seen: SeenApp, client: TestClient
) -> None:
    iam = FakeIAM()
    exchange.use_exchange(_exchange(iam))

    answer = _invoke(client, "rs256-for-marketer")

    assert answer.status_code == 200, answer.text
    assert answer.json() == {"response": "done", "status": "success"}
    assert seen.seen == [
        {
            "authorization": "Bearer platform-of-rs256-for-marketer",
            "inference": "inference-of-rs256-for-marketer",
        }
    ]
    assert [(f["resource"], f["audience"]) for f in iam.asked] == [
        (RUNTIME, PLATFORM_AUDIENCE),
        (RUNTIME, INFERENCE_AUDIENCE),
    ]
    assert all(f["subject_token_type"] == exchange.ACCESS_TOKEN_TYPE for f in iam.asked)
    # The caller's inference token is the run's alone.
    assert offered.inference_token() != "inference-of-rs256-for-marketer"


def test_the_streamed_turn_holds_the_same_tokens(
    seen: SeenApp, client: TestClient
) -> None:
    exchange.use_exchange(_exchange(FakeIAM()))

    answer = client.post(
        "/invocations",
        json={"prompt": "hello"},
        headers={
            SESSION_HEADER: SID,
            "Authorization": "Bearer rs256-for-marketer",
            "Accept": "text/event-stream",
        },
    )

    assert answer.status_code == 200, answer.text
    assert seen.seen[0]["authorization"] == "Bearer platform-of-rs256-for-marketer"
    assert seen.seen[0]["inference"] == "inference-of-rs256-for-marketer"


def test_a_token_for_another_runtime_is_refused_401_in_iam_s_sentence(
    seen: SeenApp, client: TestClient
) -> None:
    exchange.use_exchange(_exchange(FakeIAM()))

    answer = _invoke(client, "rs256-for-another")

    assert answer.status_code == 401
    assert answer.json()["detail"] == (
        "IAM refused the token AgentCore validated: "
        f"The subject token was not issued for {RUNTIME}."
    )
    assert seen.seen == []


def test_an_invocation_without_a_token_is_refused_401(
    seen: SeenApp, client: TestClient
) -> None:
    exchange.use_exchange(_exchange(FakeIAM()))

    answer = client.post(
        "/invocations", json={"prompt": "hello"}, headers={SESSION_HEADER: SID}
    )

    assert answer.status_code == 401
    assert "Authorization header" in answer.json()["detail"]
    assert seen.seen == []


def test_without_the_runtime_s_arn_the_headers_go_as_they_come(
    seen: SeenApp, client: TestClient
) -> None:
    exchange.use_exchange(None)

    answer = _invoke(client, "sigv4-caller")

    assert answer.status_code == 200, answer.text
    assert seen.seen[0]["authorization"] == "Bearer sigv4-caller"


@pytest.mark.asyncio
async def test_an_inbound_token_is_exchanged_once_until_it_expires() -> None:
    iam = FakeIAM()
    clock = Clock()
    held = _exchange(iam, clock)

    first = await held.tokens_for("rs256-for-marketer")
    again = await held.tokens_for("rs256-for-marketer")
    assert again is first
    assert len(iam.asked) == 2
    assert first.expires_at == clock.now + 900

    clock.now += 900 - exchange.EXPIRY_MARGIN
    renewed = await held.tokens_for("rs256-for-marketer")
    assert renewed is not first
    assert len(iam.asked) == 4


@pytest.mark.asyncio
async def test_iam_out_of_reach_is_said_in_a_sentence() -> None:
    def down(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    held = TokenExchange(
        IAM,
        RUNTIME,
        client=lambda: httpx.AsyncClient(transport=httpx.MockTransport(down)),
    )
    with pytest.raises(ExchangeRefused) as refused:
        await held.tokens_for("rs256-for-marketer")
    assert refused.value.status == 502
    assert "could not be asked" in refused.value.sentence


def test_the_exchange_is_configured_from_the_environment() -> None:
    assert exchange_from_env({}) is None
    made = exchange_from_env(
        {"AGENTCORE_RUNTIME_ARN": RUNTIME, "DATALAYER_IAM_URL": f"{IAM}/"}
    )
    assert made is not None
    assert (made.iam_url, made.runtime_arn) == (IAM, RUNTIME)
    with pytest.raises(ValueError, match="DATALAYER_IAM_URL does not say"):
        exchange_from_env({"AGENTCORE_RUNTIME_ARN": RUNTIME})
