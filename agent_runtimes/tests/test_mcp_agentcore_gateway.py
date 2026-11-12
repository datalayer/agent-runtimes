# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An AgentCore Gateway as a remote MCP server, its bearer minted for the run (AC-20)."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any, Dict, List
from urllib.parse import parse_qs

import httpx
import httpx2
import pytest

from agent_runtimes.agentcore import exchange
from agent_runtimes.agentcore.exchange import TokenExchange, use_exchange
from agent_runtimes.agentcore.identity import AgentCoreIdentity
from agent_runtimes.mcp import lifecycle
from agent_runtimes.mcp.agentcore_gateway import (
    POLICY_SESSION_HEADER,
    AgentCoreGatewayAuth,
    PolicySession,
    gateway_arn_of,
    gateway_auth_of,
    policy_session,
)
from agent_runtimes.plugins.points import IdentityRefused
from agent_runtimes.tests.test_mcp_remote_server import (  # noqa: F401 — fixtures
    KEY,
    FakeGateway,
    gateway,
    manager,
)
from agent_runtimes.types import MCPServer, MCPServerAuth

IAM = "https://iam.test"
RUNTIME = "arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/marketer-AbC123"
GATEWAY_URL = (
    "https://my-gw-a1b2c3.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp"
)
GATEWAY_ARN = "arn:aws:bedrock-agentcore:us-east-1:123456789012:gateway/my-gw-a1b2c3"
AUTH = MCPServerAuth(kind="agentcore-gateway", identity="aws-agentcore-gateway")


def _gateway_server(url: str = GATEWAY_URL) -> MCPServer:
    return MCPServer(
        id="my-gateway",
        name="My gateway",
        transport="streamable-http",
        url=url,
        auth=AUTH,
    )


def _session(uid: str) -> PolicySession:
    session = PolicySession()
    session.use(uid)
    return session


class FakeProvider:
    """The agentcore provider: the gateway's inbound token for whom the run acts."""

    def __init__(self, token: str = KEY) -> None:
        self.token = token
        self.asked: List[tuple[Dict[str, Any], str]] = []

    async def inbound_token(self, caller: Dict[str, Any], audience: str) -> str:
        self.asked.append((dict(caller), audience))
        return self.token


# --- the gateway's ARN -----------------------------------------------------------


def test_the_gateway_s_arn_is_its_url_s_in_the_runtime_s_account() -> None:
    assert gateway_arn_of(GATEWAY_URL, RUNTIME) == GATEWAY_ARN


def test_a_url_that_is_not_a_gateway_s_or_a_runtime_without_its_arn_is_refused() -> (
    None
):
    with pytest.raises(IdentityRefused, match="is not an AgentCore Gateway's URL"):
        gateway_arn_of("https://huggingface.co/mcp", RUNTIME)
    with pytest.raises(IdentityRefused, match="does not know its own"):
        gateway_arn_of(GATEWAY_URL, "")


def test_a_server_without_auth_has_no_gateway_auth(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assert (
        gateway_auth_of(MCPServer(id="hf", name="HF", url="https://huggingface.co/mcp"))
        is None
    )
    monkeypatch.setenv("AGENTCORE_RUNTIME_ARN", RUNTIME)
    auth = gateway_auth_of(_gateway_server())
    assert isinstance(auth, AgentCoreGatewayAuth)
    assert auth.audience == GATEWAY_ARN


# --- the bearer on each request ---------------------------------------------------


def test_each_request_carries_the_inbound_token_the_provider_obtains() -> None:
    provider = FakeProvider("gw-token-1")
    auth = AgentCoreGatewayAuth(
        GATEWAY_ARN,
        provider=lambda: provider,
        caller=lambda: {"token": "rs256-in"},
        session=lambda: _session("sess-1"),
    )
    seen: List[str] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        seen.append(request.headers["authorization"])
        return httpx2.Response(200, json={})

    async def ask() -> None:
        async with httpx2.AsyncClient(
            transport=httpx2.MockTransport(handler), auth=auth
        ) as c:
            await c.post(GATEWAY_URL, json={})
            provider.token = "gw-token-2"
            await c.post(GATEWAY_URL, json={})

    asyncio.run(ask())
    assert seen == ["Bearer gw-token-1", "Bearer gw-token-2"]
    assert provider.asked == [({"token": "rs256-in"}, GATEWAY_ARN)] * 2


@pytest.mark.asyncio
async def test_the_gateway_server_starts_with_the_minted_bearer(
    manager: Any,  # noqa: F811
    gateway: FakeGateway,  # noqa: F811
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = FakeProvider(KEY)
    monkeypatch.setattr(
        lifecycle,
        "gateway_auth_of",
        lambda config: AgentCoreGatewayAuth(
            GATEWAY_ARN,
            provider=lambda: provider,
            caller=lambda: {"token": "rs256-in"},
            session=lambda: _session("sess-1"),
        ),
    )
    instance = await manager.start_server("my-gateway", _gateway_server(gateway.url))
    try:
        assert instance is not None and instance.is_running
        assert gateway.seen and all(
            seen.get("authorization") == f"Bearer {KEY}" for seen in gateway.seen
        )
        assert all(seen.get(POLICY_SESSION_HEADER) == "sess-1" for seen in gateway.seen)
        assert provider.asked and provider.asked[0][1] == GATEWAY_ARN
    finally:
        assert await manager.stop_server("my-gateway")


@pytest.mark.asyncio
async def test_a_gateway_this_runtime_cannot_name_fails_in_a_sentence(
    manager: Any,  # noqa: F811
    gateway: FakeGateway,  # noqa: F811
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("AGENTCORE_RUNTIME_ARN", raising=False)
    assert (
        await manager.start_server("my-gateway", _gateway_server(GATEWAY_URL)) is None
    )
    assert "does not know its own" in manager.get_failed_servers()["my-gateway"]


# --- the provider asks the runtime's exchange --------------------------------------


class FakeIAM:
    """IAM's token endpoint: a runtime's token for a gateway of its organization."""

    def __init__(self) -> None:
        self.asked: List[Dict[str, str]] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        form = {k: v[0] for k, v in parse_qs(request.content.decode()).items()}
        self.asked.append(form)
        if form["subject_token"] != "rs256-in":
            return httpx.Response(401, json={"error": "invalid_grant"})
        return httpx.Response(
            200, json={"access_token": f"for-{form['resource']}", "expires_in": 900}
        )


def test_the_agentcore_provider_exchanges_the_invocation_s_token_for_the_gateway() -> (
    None
):
    iam = FakeIAM()
    held = TokenExchange(
        IAM,
        RUNTIME,
        client=lambda: httpx.AsyncClient(transport=httpx.MockTransport(iam)),
    )
    use_exchange(held)
    try:
        provider = AgentCoreIdentity()

        async def twice() -> List[str]:
            return [
                await provider.inbound_token({"token": "rs256-in"}, GATEWAY_ARN),
                await provider.inbound_token({"token": "rs256-in"}, GATEWAY_ARN),
            ]

        assert asyncio.run(twice()) == [f"for-{GATEWAY_ARN}"] * 2
        # Asked once, kept until it expires; the resource the gateway, no audience.
        assert iam.asked == [
            {
                "grant_type": exchange.GRANT_TYPE,
                "subject_token": "rs256-in",
                "subject_token_type": exchange.ACCESS_TOKEN_TYPE,
                "resource": GATEWAY_ARN,
            }
        ]
        with pytest.raises(IdentityRefused, match="No invocation's token to exchange"):
            asyncio.run(provider.inbound_token({"token": ""}, GATEWAY_ARN))
        with pytest.raises(IdentityRefused, match="IAM refused"):
            asyncio.run(provider.inbound_token({"token": "forged"}, GATEWAY_ARN))
    finally:
        exchange.forget_exchange()


def test_without_an_exchange_the_provider_refuses() -> None:
    use_exchange(None)
    try:
        with pytest.raises(IdentityRefused, match="No token exchange is configured"):
            asyncio.run(AgentCoreIdentity().inbound_token({"token": "x"}, GATEWAY_ARN))
    finally:
        exchange.forget_exchange()


def test_the_last_invocation_s_token_is_kept_for_the_gateway() -> None:
    iam = FakeIAM()
    held = TokenExchange(
        IAM,
        RUNTIME,
        client=lambda: httpx.AsyncClient(transport=httpx.MockTransport(iam)),
    )
    assert held.last_inbound == ""
    with pytest.raises(exchange.ExchangeRefused):
        asyncio.run(held.tokens_for("rs256-other"))
    assert held.last_inbound == "rs256-other"


# --- the catalogue generated with it ---------------------------------------------


#: agentspecs' mcp-servers/agentcore-gateway-example.yaml, the fields the
#: generator reads.
GATEWAY_SPEC_YAML = """\
id: agentcore-gateway-example
version: 0.0.1
name: AgentCore Gateway (example)
description: An Amazon Bedrock AgentCore Gateway, its targets as MCP tools
transport: streamable-http
url: "https://example-gateway-a1b2c3d4e5.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp"
auth:
  kind: agentcore-gateway
  identity: aws-agentcore-gateway
enabled: false
envvars: []
env: {}
tags: [aws, agentcore, gateway]
icon: "@primer/octicons-react:plug"
emoji: "🔌"
"""


def test_the_generated_catalogue_carries_the_auth(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    import sys

    root = Path(__file__).resolve().parents[2]
    monkeypatch.syspath_prepend(str(root / "scripts" / "codegen"))
    sys.modules.pop("generate_mcp_servers", None)
    import generate_mcp_servers as generator

    # The example spec, written here: CI has no agentspecs clone (it is
    # git-ignored), so the generator is given what the clone's file says.
    (tmp_path / "agentcore-gateway-example.yaml").write_text(GATEWAY_SPEC_YAML)
    specs = generator.load_mcp_specs(tmp_path)
    python = generator.generate_python_code(specs)
    assert "from agent_runtimes.types import MCPServer, MCPServerAuth" in python
    assert (
        'auth=MCPServerAuth(kind="agentcore-gateway", identity="aws-agentcore-gateway"),'
        in python
    )
    namespace: Dict[str, Any] = {}
    exec(compile(python, "catalog", "exec"), namespace)  # noqa: S102 — the generated module
    server = namespace["MCP_SERVER_CATALOG"]["agentcore-gateway-example"]
    assert server.auth == AUTH and server.enabled is False and not server.headers
    typescript = generator.generate_typescript_code(specs)
    assert (
        'auth: {"kind": "agentcore-gateway", "identity": "aws-agentcore-gateway"},'
        in typescript
    )


# --- the policy session (AC-44) ---------------------------------------------------


def _asked(
    auth: AgentCoreGatewayAuth, statuses: List[int], times: int = 1
) -> tuple[List[str], List[int]]:
    """The policy session each request carried, and what each call answered."""
    seen: List[str] = []
    answers = list(statuses)

    def handler(request: httpx2.Request) -> httpx2.Response:
        seen.append(request.headers[POLICY_SESSION_HEADER])
        assert request.content == b'{"jsonrpc":"2.0"}'
        return httpx2.Response(answers.pop(0) if answers else 200, json={})

    async def ask() -> List[int]:
        async with httpx2.AsyncClient(
            transport=httpx2.MockTransport(handler), auth=auth
        ) as c:
            return [
                (
                    await c.post(
                        GATEWAY_URL,
                        content=b'{"jsonrpc":"2.0"}',
                        headers={"content-type": "application/json"},
                    )
                ).status_code
                for _ in range(times)
            ]

    return seen, asyncio.run(ask())


def _auth(session: PolicySession) -> AgentCoreGatewayAuth:
    return AgentCoreGatewayAuth(
        GATEWAY_ARN,
        provider=lambda: FakeProvider("gw"),
        caller=lambda: {"token": "rs256-in"},
        session=lambda: session,
    )


def test_each_request_names_the_session_uid_as_the_policy_session() -> None:
    session = PolicySession()
    session.use("sess-1")
    seen, answered = _asked(_auth(session), [], times=2)
    assert seen == ["sess-1", "sess-1"] and answered == [200, 200]


def test_a_call_with_no_session_is_refused() -> None:
    with pytest.raises(IdentityRefused, match="No session to decide"):
        _asked(_auth(PolicySession()), [])


def test_a_session_agentcore_ended_is_restarted_in_a_sentence(
    caplog: pytest.LogCaptureFixture,
) -> None:
    session = PolicySession()
    session.use("sess-1")
    with caplog.at_level("WARNING", logger="agent_runtimes.mcp.agentcore_gateway"):
        seen, answered = _asked(_auth(session), [409], times=2)
    # Sent again once in the new session; the next call stays in it.
    assert seen == ["sess-1", "sess-1-1", "sess-1-1"]
    assert answered == [200, 200]
    assert (
        "AgentCore ended the policy session sess-1: the organization's temporal "
        "policies changed. The Gateway's calls go on in policy session sess-1-1"
    ) in caplog.text
    # A second 409 in a row is the caller's to read.
    seen, answered = _asked(_auth(session), [409, 409])
    assert seen == ["sess-1-1", "sess-1-2"] and answered == [409]
    # A new invocation's session starts afresh.
    session.use("sess-2")
    assert session.id == "sess-2"


def test_an_invocation_names_the_policy_session(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from agent_runtimes.agentcore import contract
    from agent_runtimes.agentcore.session_ids import session_uid_to_agentcore

    async def no_tokens(headers: Any) -> None:
        return None

    async def as_is(body: Any, uid: str, bearer: Any) -> Any:
        return body

    monkeypatch.setattr(contract, "tokens_of", no_tokens)
    monkeypatch.setattr(contract, "resumed", as_is)
    monkeypatch.setattr(contract, "_agent_app", lambda: object())
    uid = "0123456789abcdef0123456789abcdef"
    headers = {contract.SESSION_HEADER: session_uid_to_agentcore(uid)}
    asyncio.run(contract._prepared({"prompt": "hello"}, headers))
    assert policy_session().id == uid
