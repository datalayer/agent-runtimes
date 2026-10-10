# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Demonstrate a complete PAP Direct Sign-In Session upgrade safely."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from urllib.parse import parse_qs, urlencode, urlsplit

import httpx
from personal_agent_protocol import (
    AUTHORIZATION_STATE_STORES,
    BROWSER_HANDOFFS,
    DPOP_PROOF_PROVIDERS,
    SIGNERS,
    AuthorizationError,
    DirectSignInClient,
    DpopProofRequest,
    build_pap_reactor,
)
from pydantic import SecretStr
from reactor import PluginManifest

from agent_runtimes.loop.apps import Application


class OneUseStateStore:
    def __init__(self) -> None:
        self.values: dict[str, object] = {}

    async def put(self, reference: str, value: object, *, expires_at: datetime) -> None:
        self.values[reference] = value

    async def take(self, reference: str) -> object | None:
        return self.values.pop(reference, None)


class RecordingBrowser:
    def __init__(self) -> None:
        self.urls: list[SecretStr] = []

    async def open(self, authorization_url: SecretStr) -> None:
        self.urls.append(authorization_url)


class RecordingSigner:
    def __init__(self) -> None:
        self.purposes: list[str] = []

    async def sign(self, _: dict[str, object], *, purpose: str) -> SecretStr:
        self.purposes.append(purpose)
        return SecretStr(f"host-only-assertion-{len(self.purposes)}")


class RecordingDpopProvider:
    def __init__(self) -> None:
        self.requests: list[DpopProofRequest] = []

    async def create(self, request: DpopProofRequest) -> SecretStr:
        self.requests.append(request)
        return SecretStr(f"host-only-proof-{len(self.requests)}")


class DirectSignInSecurityPlugin:
    def __init__(
        self,
        store: OneUseStateStore,
        browser: RecordingBrowser,
        signer: RecordingSigner,
        dpop: RecordingDpopProvider,
    ) -> None:
        self.store = store
        self.browser = browser
        self.signer = signer
        self.dpop = dpop

    def provide_contributions(self, contributions: object) -> None:
        contribute = contributions.contribute  # type: ignore[attr-defined]
        contribute(
            AUTHORIZATION_STATE_STORES, self.store, contribution_id="one-use-state"
        )
        contribute(BROWSER_HANDOFFS, self.browser, contribution_id="trusted-browser")
        contribute(SIGNERS, self.signer, contribution_id="protected-signer")
        contribute(DPOP_PROOF_PROVIDERS, self.dpop, contribution_id="protected-dpop")


app = Application(
    id="pap-direct-sign-in-lifecycle",
    name="PAP Direct Sign-In Lifecycle",
    description="Upgrade an existing Session with one-use state, PKCE, and DPoP.",
    kind="chat",
    agent="example-blank:0.0.1",
    instructions=(
        "Use explain_direct_sign_in_lifecycle. Never request or expose an "
        "authorization URL, callback, code, verifier, assertion, proof, or token."
    ),
)


@app.tool(does="read")
async def explain_direct_sign_in_lifecycle() -> dict[str, Any]:
    """Exercise the full flow and return only safe lifecycle evidence."""

    calls = 0
    forms: list[dict[str, list[str]]] = []

    def company(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        forms.append(parse_qs(request.content.decode()))
        if calls == 1:
            return httpx.Response(
                400,
                json={"error": "use_dpop_nonce"},
                headers={"DPoP-Nonce": "host-only-company-nonce"},
            )
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

    store = OneUseStateStore()
    browser = RecordingBrowser()
    signer = RecordingSigner()
    dpop = RecordingDpopProvider()
    async with httpx.AsyncClient(transport=httpx.MockTransport(company)) as http:
        reactor, _ = build_pap_reactor(http_client=http)
        reactor.register_plugin(
            PluginManifest(name="pap-direct-sign-in-example-security", version="1"),
            DirectSignInSecurityPlugin(store, browser, signer, dpop),
        )
        client = DirectSignInClient(reactor=reactor, http_client=http)
        started = await client.begin(
            authorization_endpoint="https://auth.shop.example/oauth/authorize",
            token_endpoint="https://auth.shop.example/oauth/token",
            issuer="https://auth.shop.example",
            client_id="https://assistant.example/agent.json",
            redirect_uri="https://assistant.example/oauth/callback",
            scopes=["orders:read", "orders:return"],
            tenant_id="example-tenant",
            pairwise_user_id="usr_host_only_example",
            session_id="ses_existing",
        )
        authorization = urlsplit(browser.urls[0].get_secret_value())
        state = parse_qs(authorization.query)["state"][0]
        callback_url = "https://assistant.example/oauth/callback?" + urlencode(
            {
                "code": "host-only-one-use-code",
                "state": state,
                "iss": "https://auth.shop.example",
            }
        )
        result = await client.complete(callback_url)
        try:
            await client.complete(callback_url)
        except AuthorizationError as error:
            state_reuse_rejected = error.code == "invalid_or_expired_state"
        else:
            state_reuse_rejected = False
        reactor.stop()

    return {
        "status": "signed_in",
        "requested_scopes": started.requested_scopes,
        "granted_scopes": result.granted_scopes,
        "missing_scopes": result.missing_scopes,
        "same_session": result.token.session_id == "ses_existing",
        "pkce_method": "S256",
        "trusted_browser_handoff": len(browser.urls) == 1,
        "state_reuse_rejected": state_reuse_rejected,
        "nonce_retry": [request.nonce for request in dpop.requests]
        == [None, "host-only-company-nonce"],
        "same_verifier_on_nonce_retry": forms[0]["code_verifier"]
        == forms[1]["code_verifier"],
        "fresh_assertions": forms[0]["client_assertion"]
        != forms[1]["client_assertion"],
        "fresh_proofs": len(dpop.requests) == 2,
        "authorization_url_withheld": True,
        "callback_and_code_withheld": True,
        "assertions_and_proofs_withheld": True,
        "session_and_account_tokens_withheld": True,
    }
