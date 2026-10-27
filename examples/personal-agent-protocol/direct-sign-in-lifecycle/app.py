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
    TOKEN_STORES,
    AuthorizationError,
    DirectSignInClient,
    DpopProofRequest,
    build_pap_reactor,
)
from pydantic import SecretStr
from reactor import PluginManifest

from agent_runtimes.loop.apps import Application

#: The existing Session's Session Key (its JWK thumbprint, RFC 7638): it names the
#: Session. The private half stays with the host's proof provider.
SESSION_KEY = "NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs"


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


class ProtectedTokenStore:
    """The host's vault: the Account Token is kept here, behind a reference."""

    def __init__(self) -> None:
        self.values: dict[str, SecretStr] = {}

    async def put(self, reference: str, token: SecretStr) -> None:
        self.values[reference] = token

    async def get(self, reference: str) -> SecretStr | None:
        return self.values.get(reference)

    async def delete(self, reference: str) -> None:
        self.values.pop(reference, None)


class DirectSignInSecurityPlugin:
    def __init__(
        self,
        store: OneUseStateStore,
        browser: RecordingBrowser,
        signer: RecordingSigner,
        dpop: RecordingDpopProvider,
    ) -> None:
        self.tokens = ProtectedTokenStore()
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
        contribute(TOKEN_STORES, self.tokens, contribution_id="protected-tokens")


app = Application(
    id="pap-direct-sign-in-lifecycle",
    name="PAP Direct Sign-In Lifecycle",
    description="Upgrade an existing Session with one-use state, PKCE, and DPoP.",
    kind="chat",
    # Its interface: the Reactor plugins of agentspecs/ui it is drawn with.
    ui=[{"plugin": "chat"}],
    agent="example-blank:0.0.1",
    instructions=(
        "Use explain_direct_sign_in_lifecycle. Never request or expose an "
        "authorization URL, callback, code, verifier, assertion, proof, Session Key, "
        "or token."
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
                # No Session ID and no `signed_in` on the wire: the proof's key names
                # the Session, and the grant (an authorization code) says it is
                # signed in.
                "refresh_token": "host-only-account-token",
            },
        )

    store = OneUseStateStore()
    browser = RecordingBrowser()
    signer = RecordingSigner()
    dpop = RecordingDpopProvider()
    security = DirectSignInSecurityPlugin(store, browser, signer, dpop)
    async with httpx.AsyncClient(transport=httpx.MockTransport(company)) as http:
        reactor, _ = build_pap_reactor(http_client=http)
        reactor.register_plugin(
            PluginManifest(name="pap-direct-sign-in-example-security", version="1"),
            security,
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
            session_key=SESSION_KEY,
        )
        authorization = urlsplit(browser.urls[0].get_secret_value())
        state = parse_qs(authorization.query)["state"][0]
        # `dpop_jkt`: the company binds the code to the Session Key.
        code_bound = parse_qs(authorization.query).get("dpop_jkt") == [SESSION_KEY]
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
        "same_session": result.token.session_key == SESSION_KEY
        and result.token.signed_in,
        "code_bound_to_the_session_key": code_bound,
        "every_proof_signed_with_the_session_key": all(
            request.session_key == SESSION_KEY for request in dpop.requests
        ),
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
        "account_token_stored_by_reference": result.account_token_reference
        in security.tokens.values,
        "account_token_not_in_result": result.token.refresh_token is None,
    }
