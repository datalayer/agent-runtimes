# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Getting a token with nobody at the keyboard.

The failures worth testing here are all about a credential outliving its
purpose: a refresh token kept for a machine identity, an assertion replayable
at a second server, a secret copied into a token record or a traceback.

Launch the tests:
```
$ pytest agent_runtimes/tests/test_mcp_machine_auth.py -v
```
"""

from __future__ import annotations

import time
from typing import Any

import pytest

from agent_runtimes.mcp.auth import ServerMetadata
from agent_runtimes.mcp.auth import machine as machine_module
from agent_runtimes.mcp.auth.machine import (
    ASSERTION_LIFETIME_SECONDS,
    CLIENT_ASSERTION_TYPE,
    ClientCredentials,
    MachineAuthError,
    MachineTokenProvider,
    build_assertion,
    exchange_for_subagent,
    fetch_token,
)
from agent_runtimes.mcp.auth.tokens import OAuthToken
from agent_runtimes.tests.test_mcp_auth import _fake_client, _Response

SECRET = "not-a-real-secret"


def _metadata(**overrides: Any) -> ServerMetadata:
    base = dict(
        issuer="https://as.example",
        authorization_endpoint="https://as.example/authorize",
        token_endpoint="https://as.example/token",
        resource="https://mcp.example/mcp",
    )
    base.update(overrides)
    return ServerMetadata(**base)  # type: ignore[arg-type]


def _rsa_key() -> str:
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()


@pytest.fixture(scope="module")
def rsa_key() -> str:
    return _rsa_key()


def _posted(recorder: list) -> dict:
    assert recorder, "nothing was posted"
    return recorder[-1][2]["data"]


def _token_handler(recorder: list, payload: dict | None = None, status: int = 200):
    def handler(method: str, url: str, kwargs: dict) -> _Response:
        recorder.append((method, url, kwargs))
        return _Response(
            payload if payload is not None else {"access_token": "at", "expires_in": 3600},
            status_code=status,
            text="refused",
        )

    return handler


# ---------------------------------------------------------------------------
# What a service agent may be configured with
# ---------------------------------------------------------------------------


class TestConfiguration:
    def test_a_secret_or_a_key_but_not_both(self, rsa_key: str) -> None:
        """A client with both would silently pick one, and which one it picked
        is what somebody debugging a refused token needs to know."""
        with pytest.raises(MachineAuthError):
            ClientCredentials(client_id="agent", client_secret=SECRET, private_key=rsa_key)

    def test_neither_is_also_refused(self) -> None:
        with pytest.raises(MachineAuthError):
            ClientCredentials(client_id="agent")

    def test_a_client_id_is_required(self) -> None:
        with pytest.raises(MachineAuthError):
            ClientCredentials(client_id="", client_secret=SECRET)

    def test_a_symmetric_algorithm_cannot_sign_an_assertion(self, rsa_key: str) -> None:
        """`HS256` signs with a shared secret, which is the thing private-key
        JWT exists to stop sending."""
        with pytest.raises(MachineAuthError) as refused:
            ClientCredentials(client_id="agent", private_key=rsa_key, algorithm="HS256")
        assert "HS256" in str(refused.value)

    def test_none_is_not_a_signature(self, rsa_key: str) -> None:
        with pytest.raises(MachineAuthError):
            ClientCredentials(client_id="agent", private_key=rsa_key, algorithm="none")

    def test_the_method_is_named_truthfully(self, rsa_key: str) -> None:
        assert ClientCredentials(client_id="a", client_secret=SECRET).method == "client_secret_post"
        assert ClientCredentials(client_id="a", private_key=rsa_key).method == "private_key_jwt"

    def test_the_repr_carries_no_credential(self, rsa_key: str) -> None:
        """This object ends up in tracebacks. A credential printed once is a
        credential in a log aggregator forever."""
        assert SECRET not in repr(ClientCredentials(client_id="a", client_secret=SECRET))
        printed = repr(ClientCredentials(client_id="a", private_key=rsa_key))
        assert "PRIVATE KEY" not in printed and "MII" not in printed


# ---------------------------------------------------------------------------
# The assertion
# ---------------------------------------------------------------------------


class TestAssertion:
    def _claims(self, assertion: str) -> dict:
        import jwt

        return jwt.decode(assertion, options={"verify_signature": False}, audience="https://as.example/token")

    def test_the_audience_is_the_token_endpoint_not_the_issuer(self, rsa_key: str) -> None:
        """The binding that stops an assertion captured at one authorization
        server being presented at another that trusts the same key."""
        credentials = ClientCredentials(client_id="agent", private_key=rsa_key)
        claims = self._claims(build_assertion(credentials, "https://as.example/token"))
        assert claims["aud"] == "https://as.example/token"
        assert claims["aud"] != "https://as.example"

    def test_the_client_is_both_issuer_and_subject(self, rsa_key: str) -> None:
        credentials = ClientCredentials(client_id="agent", private_key=rsa_key)
        claims = self._claims(build_assertion(credentials, "https://as.example/token"))
        assert claims["iss"] == "agent" and claims["sub"] == "agent"

    def test_each_assertion_is_used_once(self, rsa_key: str) -> None:
        credentials = ClientCredentials(client_id="agent", private_key=rsa_key)
        first = self._claims(build_assertion(credentials, "https://as.example/token"))
        second = self._claims(build_assertion(credentials, "https://as.example/token"))
        assert first["jti"] != second["jti"]

    def test_an_assertion_is_short_lived(self, rsa_key: str) -> None:
        """One captured in transit is worthless before it can be read."""
        credentials = ClientCredentials(client_id="agent", private_key=rsa_key)
        claims = self._claims(build_assertion(credentials, "https://as.example/token", now=1000))
        assert claims["exp"] - claims["iat"] == ASSERTION_LIFETIME_SECONDS
        assert claims["exp"] <= 1000 + 300

    def test_a_key_id_travels_in_the_header_when_there_is_one(self, rsa_key: str) -> None:
        import jwt

        credentials = ClientCredentials(client_id="a", private_key=rsa_key, private_key_id="k1")
        assertion = build_assertion(credentials, "https://as.example/token")
        assert jwt.get_unverified_header(assertion)["kid"] == "k1"

    def test_an_assertion_without_a_token_endpoint_is_refused(self, rsa_key: str) -> None:
        credentials = ClientCredentials(client_id="a", private_key=rsa_key)
        with pytest.raises(MachineAuthError):
            build_assertion(credentials, "")

    def test_a_broken_key_is_reported_without_printing_the_key(self) -> None:
        credentials = ClientCredentials(client_id="a", private_key="-----BEGIN PRIVATE KEY-----\nnope\n-----END PRIVATE KEY-----")
        with pytest.raises(MachineAuthError) as refused:
            build_assertion(credentials, "https://as.example/token")
        assert "nope" not in str(refused.value)
        assert "RS256" in str(refused.value)


# ---------------------------------------------------------------------------
# client_credentials
# ---------------------------------------------------------------------------


class TestClientCredentials:
    @pytest.mark.asyncio
    async def test_a_secret_is_posted_and_a_token_comes_back(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        recorder: list = []
        monkeypatch.setattr(
            machine_module.httpx, "AsyncClient", _fake_client(_token_handler(recorder))
        )
        token = await fetch_token(
            ClientCredentials(client_id="agent", client_secret=SECRET, scope="code:execute"),
            _metadata(),
            now=1000,
        )
        body = _posted(recorder)
        assert body["grant_type"] == "client_credentials"
        assert body["client_id"] == "agent" and body["client_secret"] == SECRET
        assert body["scope"] == "code:execute"
        assert token.access_token == "at" and token.expires_at == 1000 + 3600

    @pytest.mark.asyncio
    async def test_a_private_key_sends_an_assertion_and_never_the_key(
        self, monkeypatch: pytest.MonkeyPatch, rsa_key: str
    ) -> None:
        recorder: list = []
        monkeypatch.setattr(
            machine_module.httpx, "AsyncClient", _fake_client(_token_handler(recorder))
        )
        await fetch_token(
            ClientCredentials(client_id="agent", private_key=rsa_key), _metadata()
        )
        body = _posted(recorder)
        assert body["client_assertion_type"] == CLIENT_ASSERTION_TYPE
        assert body["client_assertion"]
        assert "client_secret" not in body
        assert "PRIVATE KEY" not in str(body)

    @pytest.mark.asyncio
    async def test_the_resource_is_sent_so_the_token_names_an_audience(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A token with no audience is one every resource trusting this issuer
        will accept."""
        recorder: list = []
        monkeypatch.setattr(
            machine_module.httpx, "AsyncClient", _fake_client(_token_handler(recorder))
        )
        await fetch_token(
            ClientCredentials(client_id="a", client_secret=SECRET), _metadata()
        )
        assert _posted(recorder)["resource"] == "https://mcp.example/mcp"

    @pytest.mark.asyncio
    async def test_an_explicit_resource_wins_over_the_metadata(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        recorder: list = []
        monkeypatch.setattr(
            machine_module.httpx, "AsyncClient", _fake_client(_token_handler(recorder))
        )
        await fetch_token(
            ClientCredentials(client_id="a", client_secret=SECRET),
            _metadata(),
            resource="https://other.example/mcp",
        )
        assert _posted(recorder)["resource"] == "https://other.example/mcp"

    @pytest.mark.asyncio
    async def test_a_refresh_token_the_server_sent_anyway_is_dropped(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """RFC 6749 §4.4.3. A machine already holds what it needs to ask
        again; a refresh token beside those credentials is a second, longer
        lived credential that survives rotating the first.
        """
        recorder: list = []
        monkeypatch.setattr(
            machine_module.httpx,
            "AsyncClient",
            _fake_client(
                _token_handler(
                    recorder, {"access_token": "at", "refresh_token": "rt", "expires_in": 60}
                )
            ),
        )
        token = await fetch_token(
            ClientCredentials(client_id="a", client_secret=SECRET), _metadata()
        )
        assert token.refresh_token is None

    @pytest.mark.asyncio
    async def test_the_secret_does_not_end_up_in_the_token_record(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """The record is serialised into a keychain and into JSON dumps."""
        recorder: list = []
        monkeypatch.setattr(
            machine_module.httpx, "AsyncClient", _fake_client(_token_handler(recorder))
        )
        token = await fetch_token(
            ClientCredentials(client_id="a", client_secret=SECRET), _metadata()
        )
        assert token.client_secret is None
        assert SECRET not in token.to_json()

    @pytest.mark.asyncio
    async def test_a_refusal_names_the_agent_and_the_method_and_not_the_secret(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        recorder: list = []
        monkeypatch.setattr(
            machine_module.httpx,
            "AsyncClient",
            _fake_client(_token_handler(recorder, {}, status=401)),
        )
        with pytest.raises(MachineAuthError) as refused:
            await fetch_token(
                ClientCredentials(client_id="agent-7", client_secret=SECRET), _metadata()
            )
        message = str(refused.value)
        assert "agent-7" in message and "client_secret_post" in message
        assert SECRET not in message

    @pytest.mark.asyncio
    async def test_metadata_with_no_token_endpoint_is_refused_before_any_call(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        recorder: list = []
        monkeypatch.setattr(
            machine_module.httpx, "AsyncClient", _fake_client(_token_handler(recorder))
        )
        with pytest.raises(MachineAuthError):
            await fetch_token(
                ClientCredentials(client_id="a", client_secret=SECRET),
                _metadata(token_endpoint=""),
            )
        assert recorder == []


# ---------------------------------------------------------------------------
# Delegation to a sub-agent
# ---------------------------------------------------------------------------


class TestSubAgentExchange:
    @pytest.mark.asyncio
    async def test_the_parents_token_is_the_subject_and_the_scope_is_asked_for(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        recorder: list = []
        monkeypatch.setattr(
            machine_module.httpx, "AsyncClient", _fake_client(_token_handler(recorder))
        )
        parent = OAuthToken(access_token="parent-at", client_id="agent")
        await exchange_for_subagent(
            parent, _metadata(), audience="https://mcp.example/mcp", scope="notebooks:read"
        )
        body = _posted(recorder)
        assert body["grant_type"] == "urn:ietf:params:oauth:grant-type:token-exchange"
        assert body["subject_token"] == "parent-at"
        assert body["scope"] == "notebooks:read"
        assert body["audience"] == "https://mcp.example/mcp"

    @pytest.mark.asyncio
    async def test_a_delegated_token_is_not_refreshable_on_its_own(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Refreshing it would be the sub-agent renewing a delegation the
        parent may have ended."""
        recorder: list = []
        monkeypatch.setattr(
            machine_module.httpx,
            "AsyncClient",
            _fake_client(
                _token_handler(recorder, {"access_token": "child", "refresh_token": "rt"})
            ),
        )
        issued = await exchange_for_subagent(
            OAuthToken(access_token="parent", client_id="agent"), _metadata()
        )
        assert issued.refresh_token is None

    @pytest.mark.asyncio
    async def test_an_exchange_with_no_token_to_exchange_is_refused(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        recorder: list = []
        monkeypatch.setattr(
            machine_module.httpx, "AsyncClient", _fake_client(_token_handler(recorder))
        )
        with pytest.raises(MachineAuthError):
            await exchange_for_subagent(OAuthToken(access_token=""), _metadata())
        assert recorder == []


# ---------------------------------------------------------------------------
# The provider
# ---------------------------------------------------------------------------


class TestProvider:
    @pytest.mark.asyncio
    async def test_a_held_token_is_reused_rather_than_fetched_again(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        recorder: list = []
        monkeypatch.setattr(
            machine_module.httpx, "AsyncClient", _fake_client(_token_handler(recorder))
        )
        provider = MachineTokenProvider(
            ClientCredentials(client_id="a", client_secret=SECRET), _metadata()
        )
        await provider.token(now=1000)
        await provider.token(now=1000)
        assert len(recorder) == 1

    @pytest.mark.asyncio
    async def test_an_expired_token_is_replaced_at_the_next_call(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Checked at use, not on a timer: a token that expired while the
        agent was idle is a non-event until there is a call to make."""
        recorder: list = []
        monkeypatch.setattr(
            machine_module.httpx, "AsyncClient", _fake_client(_token_handler(recorder))
        )
        provider = MachineTokenProvider(
            ClientCredentials(client_id="a", client_secret=SECRET), _metadata()
        )
        await provider.token(now=1000)
        await provider.token(now=1000 + 3600)
        assert len(recorder) == 2

    @pytest.mark.asyncio
    async def test_forget_makes_the_next_call_ask_again(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """What a caller does on a 401: the server has decided the token is no
        longer good, which the expiry check cannot know."""
        recorder: list = []
        monkeypatch.setattr(
            machine_module.httpx, "AsyncClient", _fake_client(_token_handler(recorder))
        )
        provider = MachineTokenProvider(
            ClientCredentials(client_id="a", client_secret=SECRET), _metadata()
        )
        await provider.token(now=1000)
        provider.forget()
        await provider.token(now=1000)
        assert len(recorder) == 2

    @pytest.mark.asyncio
    async def test_the_authorization_header_is_ready_to_send(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        recorder: list = []
        monkeypatch.setattr(
            machine_module.httpx, "AsyncClient", _fake_client(_token_handler(recorder))
        )
        provider = MachineTokenProvider(
            ClientCredentials(client_id="a", client_secret=SECRET), _metadata()
        )
        assert await provider.authorization(now=1000) == "Bearer at"

    def test_the_provider_repr_carries_no_credential(self, rsa_key: str) -> None:
        provider = MachineTokenProvider(
            ClientCredentials(client_id="a", client_secret=SECRET), _metadata()
        )
        assert SECRET not in repr(provider)
        assert "client_id='a'" in repr(provider)
