# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for MCP authentication: tokens, the OAuth flow, and the endpoints."""

from __future__ import annotations

import asyncio
import base64
import hashlib
from typing import Any
from urllib.parse import parse_qs, urlparse

import pytest

from agent_runtimes.mcp.auth import (
    MemoryTokenStore,
    OAuthError,
    OAuthToken,
    PendingFlow,
    ServerMetadata,
    authorization_url,
    choose_scope,
    generate_pkce,
    get_token_store,
)
from agent_runtimes.mcp.auth import oauth as oauth_module


def _metadata(**overrides: Any) -> ServerMetadata:
    base = dict(
        issuer="https://as.example",
        authorization_endpoint="https://as.example/authorize",
        token_endpoint="https://as.example/token",
        registration_endpoint="https://as.example/register",
        revocation_endpoint="https://as.example/revoke",
        resource="https://mcp.example/sse",
    )
    base.update(overrides)
    return ServerMetadata(**base)  # type: ignore[arg-type]


class _Response:
    def __init__(self, payload: Any = None, status_code: int = 200, text: str = "") -> None:
        self.status_code = status_code
        self._payload = payload if payload is not None else {}
        self.text = text

    def json(self) -> Any:
        return self._payload

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"status {self.status_code}")


def _fake_client(handler) -> type:
    """An httpx.AsyncClient stand-in driven by one handler callable."""

    class FakeClient:
        def __init__(self, *args, **kwargs) -> None:
            pass

        async def __aenter__(self) -> "FakeClient":
            return self

        async def __aexit__(self, *exc) -> None:
            return None

        async def get(self, url: str, **kwargs) -> _Response:
            return handler("GET", url, kwargs)

        async def post(self, url: str, **kwargs) -> _Response:
            return handler("POST", url, kwargs)

    return FakeClient


class TestTokens:
    def test_expiry_counts_a_safety_margin(self) -> None:
        token = OAuthToken(access_token="a", expires_at=1000.0)

        assert token.is_expired(now=800.0) is False
        # Inside the margin: expired *before* it expires, so nothing dies
        # halfway through a call.
        assert token.is_expired(now=960.0) is True
        assert token.is_expired(now=1200.0) is True

    def test_a_token_with_no_expiry_never_expires(self) -> None:
        assert OAuthToken(access_token="a").is_expired(now=10**9) is False

    def test_round_trips_through_json(self) -> None:
        token = OAuthToken(
            access_token="a", refresh_token="r", client_id="c", scope="openid"
        )
        restored = OAuthToken.from_json(token.to_json())

        assert restored == token

    def test_unknown_fields_in_stored_json_are_ignored(self) -> None:
        raw = '{"access_token": "a", "something_new": 1}'

        # A token written by a newer version must not break an older reader.
        assert OAuthToken.from_json(raw).access_token == "a"

    def test_memory_store_round_trip(self) -> None:
        store = MemoryTokenStore()
        store.put("srv", OAuthToken(access_token="a"))

        assert store.get("srv").access_token == "a"
        assert store.list_servers() == ("srv",)
        store.delete("srv")
        assert store.get("srv") is None

    def test_preferring_an_unknown_tier_is_an_error(self) -> None:
        with pytest.raises(ValueError):
            get_token_store(prefer="nowhere")

    def test_the_platform_tier_reports_itself_unavailable(self) -> None:
        from agent_runtimes.mcp.auth import PlatformTokenStore

        # It is a seam, not a store: better to say so than to drop credentials.
        assert PlatformTokenStore().available() is False


class TestPkce:
    def test_the_challenge_is_the_s256_of_the_verifier(self) -> None:
        verifier, challenge = generate_pkce()
        expected = (
            base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
            .decode()
            .rstrip("=")
        )

        assert challenge == expected
        assert "=" not in challenge
        assert len(verifier) >= 43  # RFC 7636 minimum

    def test_verifiers_are_not_reused(self) -> None:
        assert generate_pkce()[0] != generate_pkce()[0]


class TestAuthorizationUrl:
    def test_carries_pkce_state_and_resource(self) -> None:
        url = authorization_url(
            _metadata(),
            client_id="client-1",
            redirect_uri="http://127.0.0.1:8765/cb",
            code_challenge="challenge",
            state="state-1",
            scope="openid profile",
        )
        query = parse_qs(urlparse(url).query)

        assert query["response_type"] == ["code"]
        assert query["code_challenge_method"] == ["S256"]
        assert query["code_challenge"] == ["challenge"]
        assert query["state"] == ["state-1"]
        # RFC 8707: a token minted for this resource should not work elsewhere.
        assert query["resource"] == ["https://mcp.example/sse"]

    def test_scope_follows_the_server_when_it_says(self) -> None:
        assert choose_scope(_metadata(scopes_supported=("a", "b"))) == "a b"
        assert "offline_access" in choose_scope(_metadata(scopes_supported=()))


class TestDiscovery:
    def test_follows_protected_resource_metadata_to_the_issuer(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def handler(method: str, url: str, kwargs: dict) -> _Response:
            if url.endswith("/.well-known/oauth-protected-resource"):
                return _Response({"authorization_servers": ["https://as.example"]})
            if url == "https://as.example/.well-known/oauth-authorization-server":
                return _Response(
                    {
                        "issuer": "https://as.example",
                        "authorization_endpoint": "https://as.example/authorize",
                        "token_endpoint": "https://as.example/token",
                    }
                )
            return _Response(status_code=404)

        monkeypatch.setattr(oauth_module.httpx, "AsyncClient", _fake_client(handler))
        metadata = asyncio.run(oauth_module.discover("https://mcp.example/sse"))

        assert metadata.issuer == "https://as.example"
        assert metadata.resource == "https://mcp.example/sse"

    def test_falls_back_to_the_servers_own_origin(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def handler(method: str, url: str, kwargs: dict) -> _Response:
            if url == "https://mcp.example/.well-known/oauth-authorization-server":
                return _Response(
                    {
                        "issuer": "https://mcp.example",
                        "authorization_endpoint": "https://mcp.example/authorize",
                        "token_endpoint": "https://mcp.example/token",
                    }
                )
            return _Response(status_code=404)

        monkeypatch.setattr(oauth_module.httpx, "AsyncClient", _fake_client(handler))
        metadata = asyncio.run(oauth_module.discover("https://mcp.example/sse"))

        assert metadata.token_endpoint == "https://mcp.example/token"

    def test_a_server_with_no_oauth_says_so_usefully(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(
            oauth_module.httpx,
            "AsyncClient",
            _fake_client(lambda *a: _Response(status_code=404)),
        )

        with pytest.raises(OAuthError, match="does not advertise"):
            asyncio.run(oauth_module.discover("https://mcp.example/sse"))

    def test_incomplete_metadata_is_refused(self) -> None:
        with pytest.raises(OAuthError, match="token_endpoint"):
            ServerMetadata.from_payload(
                {"issuer": "https://as", "authorization_endpoint": "https://as/a"}
            )


class TestRegistration:
    def test_registers_as_a_public_client(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        seen: dict[str, Any] = {}

        def handler(method: str, url: str, kwargs: dict) -> _Response:
            seen.update(kwargs.get("json") or {})
            return _Response({"client_id": "issued-1"}, status_code=201)

        monkeypatch.setattr(oauth_module.httpx, "AsyncClient", _fake_client(handler))
        client_id, secret = asyncio.run(
            oauth_module.register_client(_metadata(), "http://127.0.0.1/cb")
        )

        assert (client_id, secret) == ("issued-1", None)
        # A CLI cannot keep a secret, so it registers without one and leans on PKCE.
        assert seen["token_endpoint_auth_method"] == "none"
        assert seen["redirect_uris"] == ["http://127.0.0.1/cb"]

    def test_a_server_without_registration_says_what_to_do(self) -> None:
        with pytest.raises(OAuthError, match="by hand"):
            asyncio.run(
                oauth_module.register_client(
                    _metadata(registration_endpoint=None), "http://127.0.0.1/cb"
                )
            )


class TestTokenExchange:
    def _flow(self) -> PendingFlow:
        return PendingFlow(
            server_id="srv",
            metadata=_metadata(),
            code_verifier="verifier",
            redirect_uri="http://127.0.0.1/cb",
            client_id="client-1",
        )

    def test_exchanges_a_code_and_records_absolute_expiry(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        sent: dict[str, Any] = {}

        def handler(method: str, url: str, kwargs: dict) -> _Response:
            sent.update(kwargs.get("data") or {})
            return _Response(
                {"access_token": "at", "refresh_token": "rt", "expires_in": 3600}
            )

        monkeypatch.setattr(oauth_module.httpx, "AsyncClient", _fake_client(handler))
        token = asyncio.run(oauth_module.exchange_code(self._flow(), "code-1", now=1000.0))

        assert token.access_token == "at"
        # Absolute, because a stored `expires_in` means nothing later.
        assert token.expires_at == 4600.0
        assert sent["code_verifier"] == "verifier"
        assert sent["grant_type"] == "authorization_code"

    def test_a_refused_exchange_is_an_oauth_error(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(
            oauth_module.httpx,
            "AsyncClient",
            _fake_client(lambda *a: _Response(status_code=400, text="bad_grant")),
        )

        with pytest.raises(OAuthError, match="bad_grant"):
            asyncio.run(oauth_module.exchange_code(self._flow(), "code-1"))

    def test_refresh_keeps_the_old_refresh_token_when_none_is_returned(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(
            oauth_module.httpx,
            "AsyncClient",
            _fake_client(lambda *a: _Response({"access_token": "new", "expires_in": 60})),
        )
        old = OAuthToken(
            access_token="old",
            refresh_token="keep-me",
            client_id="c",
            token_endpoint="https://as.example/token",
        )

        renewed = asyncio.run(oauth_module.refresh_token(old, now=1000.0))

        # Omitting it means "keep using yours", not "you no longer have one".
        assert renewed.refresh_token == "keep-me"
        assert renewed.access_token == "new"

    def test_a_token_that_cannot_refresh_says_to_authenticate_again(self) -> None:
        with pytest.raises(OAuthError, match="authenticate again"):
            asyncio.run(oauth_module.refresh_token(OAuthToken(access_token="a")))

    def test_revocation_reports_whether_the_server_was_asked(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(
            oauth_module.httpx, "AsyncClient", _fake_client(lambda *a: _Response({}))
        )

        with_endpoint = OAuthToken(
            access_token="a", revocation_endpoint="https://as.example/revoke"
        )
        assert asyncio.run(oauth_module.revoke(with_endpoint)) is True
        # No endpoint means the token stays valid upstream, and the caller
        # deserves to know that rather than assume otherwise.
        assert asyncio.run(oauth_module.revoke(OAuthToken(access_token="a"))) is False


class TestEndpoints:
    @pytest.fixture(autouse=True)
    def _store(self, monkeypatch: pytest.MonkeyPatch) -> MemoryTokenStore:
        from agent_runtimes.routes import mcp_auth

        store = MemoryTokenStore()
        monkeypatch.setattr(mcp_auth, "_store", lambda: store)
        mcp_auth._pending.clear()
        mcp_auth.set_public_base_url("http://127.0.0.1:8765")
        return store

    def test_status_moves_from_needs_auth_to_connected_to_expired(
        self, _store: MemoryTokenStore
    ) -> None:
        from agent_runtimes.routes.mcp_auth import auth_status

        assert asyncio.run(auth_status("srv")).status == "needs_auth"

        _store.put("srv", OAuthToken(access_token="a", expires_at=10**12))
        assert asyncio.run(auth_status("srv")).status == "connected"

        _store.put("srv", OAuthToken(access_token="a", expires_at=1.0))
        assert asyncio.run(auth_status("srv")).status == "expired"

    def test_start_then_callback_stores_the_token(
        self, monkeypatch: pytest.MonkeyPatch, _store: MemoryTokenStore
    ) -> None:
        from agent_runtimes.routes import mcp_auth

        async def fake_discover(url: str, **kwargs) -> ServerMetadata:
            return _metadata()

        async def fake_register(metadata, redirect_uri, **kwargs):
            return "client-1", None

        async def fake_exchange(flow, code, **kwargs) -> OAuthToken:
            return OAuthToken(access_token="at", scope="openid")

        monkeypatch.setattr(mcp_auth, "discover", fake_discover)
        monkeypatch.setattr(mcp_auth, "register_client", fake_register)
        monkeypatch.setattr(mcp_auth, "exchange_code", fake_exchange)

        started = asyncio.run(
            mcp_auth.start_auth(
                "srv", mcp_auth.StartAuthRequest(server_url="https://mcp.example/sse")
            )
        )
        assert "code_challenge" in started.authorization_url

        response = asyncio.run(
            mcp_auth.auth_callback(code="code-1", state=started.state)
        )
        assert response.status_code == 200
        assert _store.get("srv").access_token == "at"
        # The flow is consumed: a replayed callback finds nothing.
        assert mcp_auth._pending == {}

    def test_a_replayed_or_unknown_state_is_refused(self) -> None:
        from agent_runtimes.routes.mcp_auth import auth_callback

        response = asyncio.run(auth_callback(code="c", state="never-issued"))

        assert response.status_code == 400
        assert b"no longer valid" in response.body

    def test_the_authorization_server_refusing_is_shown_to_the_user(self) -> None:
        from agent_runtimes.routes.mcp_auth import auth_callback

        response = asyncio.run(auth_callback(error="access_denied"))

        assert response.status_code == 400
        assert b"access_denied" in response.body

    def test_logout_revokes_before_forgetting(
        self, monkeypatch: pytest.MonkeyPatch, _store: MemoryTokenStore
    ) -> None:
        from agent_runtimes.routes import mcp_auth

        order: list[str] = []

        async def fake_revoke(token, **kwargs) -> bool:
            order.append("revoke")
            return True

        monkeypatch.setattr(mcp_auth, "revoke", fake_revoke)
        _store.put("srv", OAuthToken(access_token="a"))

        result = asyncio.run(mcp_auth.logout("srv"))

        # Forgetting a token we never revoked leaves something valid in the
        # world that we can no longer withdraw.
        assert order == ["revoke"]
        assert result == {"server_id": "srv", "revoked": True, "forgotten": True}
        assert _store.get("srv") is None

    def test_logging_out_of_something_not_connected_is_not_an_error(self) -> None:
        from agent_runtimes.routes.mcp_auth import logout

        assert asyncio.run(logout("srv"))["forgotten"] is False
