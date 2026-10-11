# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Demonstrate PAP Device Sign-In through a safe Agent Runtimes tool."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from personal_agent_protocol import (
    AUTHORIZATION_STATE_STORES,
    CLOCKS,
    DPOP_PROOF_PROVIDERS,
    SIGNERS,
    TOKEN_STORES,
    DeviceSignInClient,
    DpopProofRequest,
    build_pap_reactor,
)
from pydantic import SecretStr
from reactor import PluginManifest

from agent_runtimes.loop.apps import Application


class MutableClock:
    def __init__(self) -> None:
        self.value = datetime(2026, 10, 10, tzinfo=timezone.utc)

    def now(self) -> datetime:
        return self.value

    def advance(self, seconds: int) -> None:
        self.value += timedelta(seconds=seconds)


class OneUseStateStore:
    def __init__(self) -> None:
        self.values: dict[str, object] = {}

    async def put(self, reference: str, value: object, *, expires_at: datetime) -> None:
        self.values[reference] = value

    async def take(self, reference: str) -> object | None:
        return self.values.pop(reference, None)


class ProtectedTokenStore:
    def __init__(self) -> None:
        self.values: dict[str, SecretStr] = {}

    async def put(self, reference: str, token: SecretStr) -> None:
        self.values[reference] = token

    async def get(self, reference: str) -> SecretStr | None:
        return self.values.get(reference)

    async def delete(self, reference: str) -> None:
        self.values.pop(reference, None)


class ProtectedSigner:
    async def sign(self, _: dict[str, object], *, purpose: str) -> SecretStr:
        if purpose != "client_assertion":
            raise ValueError("Device Sign-In requires a client assertion signer")
        return SecretStr("host-only-client-assertion")


class ProtectedDpop:
    def __init__(self) -> None:
        self.requests: list[DpopProofRequest] = []

    async def create(self, request: DpopProofRequest) -> SecretStr:
        self.requests.append(request)
        return SecretStr("host-only-dpop-proof")


class DeviceSecurityPlugin:
    def __init__(self) -> None:
        self.clock = MutableClock()
        self.state = OneUseStateStore()
        self.tokens = ProtectedTokenStore()
        self.dpop = ProtectedDpop()

    def provide_contributions(self, contributions: object) -> None:
        contribute = contributions.contribute  # type: ignore[attr-defined]
        contribute(CLOCKS, self.clock, contribution_id="example-clock")
        contribute(
            AUTHORIZATION_STATE_STORES, self.state, contribution_id="one-use-state"
        )
        contribute(TOKEN_STORES, self.tokens, contribution_id="protected-tokens")
        contribute(SIGNERS, ProtectedSigner(), contribution_id="protected-signer")
        contribute(DPOP_PROOF_PROVIDERS, self.dpop, contribution_id="protected-dpop")


app = Application(
    id="pap-device-sign-in",
    name="PAP Device Sign-In",
    description="Hand sign-in to the user and poll safely without exposing credentials.",
    kind="chat",
    agent="example-blank:0.0.1",
    instructions=(
        "Use explain_device_sign_in. Never request or expose a device code, "
        "assertion, proof, Session Token, or Account Token."
    ),
)


@app.tool(does="read")
async def explain_device_sign_in() -> dict[str, Any]:
    """Run the real PAP client and return only non-secret lifecycle evidence."""

    calls = 0

    def company(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if request.url.path.endswith("/device"):
            return httpx.Response(
                200,
                json={
                    "device_code": "host-only-device-code",
                    "user_code": "WDJB-MJHT",
                    "verification_uri": "https://shop.example/device",
                    "verification_uri_complete": "https://shop.example/device?user_code=WDJB-MJHT",
                    "expires_in": 600,
                    "interval": 5,
                },
            )
        if calls == 2:
            return httpx.Response(400, json={"error": "authorization_pending"})
        if calls == 3:
            return httpx.Response(400, json={"error": "slow_down"})
        return httpx.Response(
            200,
            json={
                "access_token": "host-only-session-token",
                "token_type": "DPoP",
                "expires_in": 300,
                "scope": "orders:read",
                "session_id": "ses_existing",
                "signed_in": True,
                "refresh_token": "host-only-account-token",
            },
        )

    security = DeviceSecurityPlugin()
    async with httpx.AsyncClient(transport=httpx.MockTransport(company)) as http:
        reactor, _ = build_pap_reactor(http_client=http)
        reactor.register_plugin(
            PluginManifest(name="pap-device-sign-in-example-security", version="1"),
            security,
        )
        client = DeviceSignInClient(reactor=reactor, http_client=http)
        started = await client.begin(
            device_authorization_endpoint="https://auth.shop.example/oauth/device",
            token_endpoint="https://auth.shop.example/oauth/token",  # noqa: S106
            issuer="https://auth.shop.example",
            client_id="https://assistant.example/agent.json",
            scopes=("orders:read", "orders:return"),
            tenant_id="example-tenant",
            pairwise_user_id="usr_host_only_example",
            session_id="ses_existing",
        )
        early = await client.poll(started.reference)
        security.clock.advance(5)
        pending = await client.poll(started.reference)
        security.clock.advance(5)
        slowed = await client.poll(started.reference)
        slow_down_added_five_seconds = (
            slowed.retry_at == security.clock.now() + timedelta(seconds=10)
        )
        security.clock.advance(10)
        completed = await client.poll(started.reference)
        reactor.stop()

    return {
        "status": completed.status,
        "user_action": "Open the company link and enter the displayed code",
        "verification_host": "shop.example",
        "user_code_displayed": started.user_code == "WDJB-MJHT",
        "early_poll_suppressed": early.retry_at
        == started.expires_at - timedelta(seconds=595),
        "authorization_pending_respected": pending.status == "pending",
        "slow_down_added_five_seconds": slow_down_added_five_seconds,
        "same_session": completed.token is not None
        and completed.token.session_id == "ses_existing",
        "granted_scopes": completed.granted_scopes,
        "missing_scopes": completed.missing_scopes,
        "account_token_stored_by_reference": completed.account_token_reference
        in security.tokens.values,
        "device_code_withheld": True,
        "session_and_account_tokens_withheld": True,
        "fresh_dpop_for_each_network_poll": len(security.dpop.requests) == 3,
    }
