# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application demonstrating a real PAP Device Sign-In state machine."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from personal_agent_protocol import (
    AUTHORIZATION_STATE_STORES,
    CLOCKS,
    SIGNERS,
    TOKEN_STORES,
    DeviceSignInClient,
    build_pap_reactor,
)
from personal_agent_protocol.models import Organization
from pydantic import SecretStr
from reactor import PluginManifest

from agent_runtimes.apps import Application


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
    def __init__(self) -> None:
        self.signed = 0

    async def sign(self, _: dict[str, object], *, purpose: str) -> SecretStr:
        if purpose != "client_assertion":
            raise ValueError("Device Sign-In requires a client assertion signer")
        self.signed += 1
        return SecretStr(f"host-only-client-assertion-{self.signed}")


class DeviceSecurityPlugin:
    def __init__(self) -> None:
        self.clock = MutableClock()
        self.state = OneUseStateStore()
        self.tokens = ProtectedTokenStore()
        self.signer = ProtectedSigner()

    def provide_contributions(self, contributions: object) -> None:
        contribute = contributions.contribute  # type: ignore[attr-defined]
        contribute(CLOCKS, self.clock, contribution_id="example-clock")
        contribute(
            AUTHORIZATION_STATE_STORES, self.state, contribution_id="one-use-state"
        )
        contribute(TOKEN_STORES, self.tokens, contribution_id="protected-tokens")
        contribute(SIGNERS, self.signer, contribution_id="protected-signer")


app = Application(
    id="pap-device-sign-in",
    name="PAP Device Sign-In",
    description="Hand sign-in to the user and poll safely without exposing credentials.",
    kind="chat",
    # Its interface: the Reactor plugins of agentspecs/ui it is drawn with.
    ui=[{"plugin": "chat"}],
    agent="example-blank:0.0.1",
    instructions=(
        "Use explain_device_sign_in to explain PAP Device Sign-In. Never ask "
        "for or expose a device code, assertion, access token, or refresh token."
    ),
)


@app.tool(does="read")
async def explain_device_sign_in() -> dict[str, Any]:
    """Run the actual SDK state machine and return only safe evidence."""

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
                # Plain OAuth: a Bearer token for the account, naming no Session.
                "access_token": "host-only-access-token",
                "token_type": "Bearer",
                "expires_in": 300,
                "scope": "orders:read",
                "refresh_token": "host-only-refresh-token",
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
            organization=Organization(name="Shop", domain="shop.example"),
            # The issuer's `protected_resources`: the verification link must be on the
            # issuer's host or one of these.
            protected_resources=("https://shop.example",),
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
        "token_type": completed.token.token_type if completed.token else None,
        "granted_scopes": completed.granted_scopes,
        "missing_scopes": completed.missing_scopes,
        "refresh_token_stored_by_reference": completed.refresh_token_reference
        in security.tokens.values,
        "device_code_withheld": True,
        "access_and_refresh_tokens_withheld": True,
        # One for the device authorization request, then one for each network poll.
        "fresh_assertion_for_each_network_poll": security.signer.signed == 4,
    }
