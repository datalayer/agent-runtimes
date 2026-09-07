# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A client that is a URL, and a document that says so.

`draft-ietf-oauth-client-id-metadata-document` — the path the MCP
specification prefers and Datalayer's IAM implements — makes a client an
HTTPS URL whose document is its registration. Nothing on this side published
one, so every connection fell back to dynamic registration: a fresh client id
per authorization server, none of them saying who the client was in a way
anybody could check.

Two properties carry the weight here, and both are about *refusing*:

* The `client_id` inside the document must equal the URL it was fetched
  from — IAM compares them as strings. A guessed URL does not fail closed,
  it claims to be a different client, so a deployment that has not been told
  its own public URL publishes nothing and registers dynamically instead.
* The document must carry no `client_secret`, no `client_secret_expires_at`
  and no symmetric `token_endpoint_auth_method`. Anybody may fetch it, so a
  secret in it is not a secret. These are checked before serving, because
  every one of them is a rule an authorization server applies *after*
  publication — and finding out there means finding out from a refusal on
  somebody's login.

Launch the tests:
```
$ pytest agent_runtimes/tests/test_this_client_publishes_its_own_identity.py -v
```
"""

from __future__ import annotations

import pytest

from agent_runtimes.routes import mcp_auth
from agent_runtimes.mcp.auth.cimd import (
    CLIENT_DOCUMENT_PATH,
    client_id_metadata_document,
    client_id_metadata_url,
    public_base_url,
    refuse_if_unpublishable,
)
from agent_runtimes.mcp.auth.oauth import (
    CLIENT_NAME,
    CLIENT_URI,
    OAuthError,
    ServerMetadata,
    register_client,
)

PUBLIC = "https://runtimes.datalayer.run"
CALLBACK = f"{PUBLIC}/api/v1/mcp/auth/callback"


# `_callback_url` prefers the module global `_public_base_url` over the
# environment, and another test in this suite sets it. A fixture that touched
# only the environment passed alone and failed in the full run — the failure
# was the fixture's, not the code's, and controlling one of two sources is
# controlling neither.
@pytest.fixture
def told_its_url(monkeypatch):
    monkeypatch.setenv("AGENT_RUNTIMES_PUBLIC_URL", PUBLIC)
    monkeypatch.setattr(mcp_auth, "_public_base_url", "", raising=False)


@pytest.fixture
def not_told_its_url(monkeypatch):
    monkeypatch.delenv("AGENT_RUNTIMES_PUBLIC_URL", raising=False)
    monkeypatch.setattr(mcp_auth, "_public_base_url", "", raising=False)


def _document():
    return client_id_metadata_document(
        client_name=CLIENT_NAME, client_uri=CLIENT_URI, redirect_uris=(CALLBACK,)
    )


class TestTheUrlIsTheIdentity:
    def test_the_document_names_the_url_it_is_served_from(self, told_its_url):
        """The one comparison an authorization server makes."""
        document = _document()
        assert document["client_id"] == f"{PUBLIC}{CLIENT_DOCUMENT_PATH}"

    def test_it_shares_the_base_the_callback_uses(self, told_its_url):
        """One public URL, so the client id and the redirect cannot disagree
        about which host this deployment is."""
        assert client_id_metadata_url().startswith(public_base_url())
        assert CALLBACK.startswith(public_base_url())

    def test_a_trailing_slash_does_not_change_the_identity(self, monkeypatch):
        monkeypatch.setenv("AGENT_RUNTIMES_PUBLIC_URL", PUBLIC + "/")
        assert client_id_metadata_url() == f"{PUBLIC}{CLIENT_DOCUMENT_PATH}"

    def test_without_a_public_url_there_is_no_identity(self, not_told_its_url):
        """`None`, never a guess: a wrong client_id claims to be somebody
        else rather than failing closed."""
        assert client_id_metadata_url() is None
        assert _document() is None

    def test_a_document_with_no_redirect_uri_is_not_published(self, told_its_url):
        assert (
            client_id_metadata_document(
                client_name=CLIENT_NAME, client_uri=CLIENT_URI, redirect_uris=()
            )
            is None
        )


class TestWhatItRefusesToPublish:
    def test_the_document_this_deployment_builds_is_publishable(self, told_its_url):
        refuse_if_unpublishable(_document(), f"{PUBLIC}{CLIENT_DOCUMENT_PATH}")

    def test_a_document_naming_another_url_is_refused(self, told_its_url):
        with pytest.raises(ValueError, match="must name it as its client_id"):
            refuse_if_unpublishable(_document(), "https://elsewhere.example/client")

    @pytest.mark.parametrize("claim", ["client_secret", "client_secret_expires_at"])
    def test_a_secret_is_refused(self, told_its_url, claim):
        """Anybody may fetch this; a secret in it is not a secret."""
        document = {**_document(), claim: "s3cret"}
        with pytest.raises(ValueError, match="must not carry"):
            refuse_if_unpublishable(document, f"{PUBLIC}{CLIENT_DOCUMENT_PATH}")

    @pytest.mark.parametrize(
        "method", ["client_secret_basic", "client_secret_post", "client_secret_jwt"]
    )
    def test_a_symmetric_auth_method_is_refused(self, told_its_url, method):
        """It implies a secret even when none is written down."""
        document = {**_document(), "token_endpoint_auth_method": method}
        with pytest.raises(ValueError, match="cannot hold one"):
            refuse_if_unpublishable(document, f"{PUBLIC}{CLIENT_DOCUMENT_PATH}")

    @pytest.mark.parametrize("required", ["client_name", "redirect_uris"])
    def test_a_document_missing_what_a_person_is_shown_is_refused(self, told_its_url, required):
        """The consent page shows `client_name`; `redirect_uris` is what the
        request is matched against, exactly and never by prefix."""
        document = {**_document()}
        document.pop(required)
        with pytest.raises(ValueError, match="must carry"):
            refuse_if_unpublishable(document, f"{PUBLIC}{CLIENT_DOCUMENT_PATH}")

    def test_it_is_a_public_client(self, told_its_url):
        """PKCE instead of a secret, which is what `none` says."""
        assert _document()["token_endpoint_auth_method"] == "none"


class TestChoosingItOverDynamicRegistration:
    def _metadata(self, *, supports_cimd: bool, registration: str | None):
        return ServerMetadata(
            issuer="https://iam.datalayer.run",
            authorization_endpoint="https://iam.datalayer.run/authorize",
            token_endpoint="https://iam.datalayer.run/token",
            registration_endpoint=registration,
            client_id_metadata_document_supported=supports_cimd,
        )

    def test_the_advertisement_is_read(self):
        """RFC 8414 metadata, beside `registration_endpoint`."""
        parsed = ServerMetadata.from_payload(
            {
                "issuer": "i",
                "authorization_endpoint": "a",
                "token_endpoint": "t",
                "client_id_metadata_document_supported": True,
            }
        )
        assert parsed.client_id_metadata_document_supported is True

    def test_a_server_that_says_nothing_does_not_support_it(self):
        parsed = ServerMetadata.from_payload(
            {"issuer": "i", "authorization_endpoint": "a", "token_endpoint": "t"}
        )
        assert parsed.client_id_metadata_document_supported is False

    @pytest.mark.asyncio
    async def test_the_url_is_used_and_nothing_is_registered(self, told_its_url):
        """No request is made at all: there is nothing to register."""
        client_id, secret = await register_client(
            self._metadata(supports_cimd=True, registration="https://iam/register"),
            CALLBACK,
        )
        assert client_id == f"{PUBLIC}{CLIENT_DOCUMENT_PATH}"
        assert secret is None

    @pytest.mark.asyncio
    async def test_it_works_without_a_registration_endpoint(self, told_its_url):
        """A server offering only CIMD is served, where before this raised."""
        client_id, _ = await register_client(
            self._metadata(supports_cimd=True, registration=None), CALLBACK
        )
        assert client_id == f"{PUBLIC}{CLIENT_DOCUMENT_PATH}"

    @pytest.mark.asyncio
    async def test_a_server_that_does_not_read_documents_is_not_handed_one(
        self, told_its_url
    ):
        """Having a URL is not a reason to use it. A server that never
        advertised CIMD would refuse a URL as a `client_id`, so offering one
        would break a login that dynamic registration completes."""
        with pytest.raises(OAuthError, match="dynamic client registration"):
            await register_client(
                self._metadata(supports_cimd=False, registration=None), CALLBACK
            )

    @pytest.mark.asyncio
    async def test_a_deployment_with_no_url_falls_back(self, not_told_its_url):
        """It cannot publish, so it registers — and says so plainly when it
        can do neither."""
        with pytest.raises(OAuthError, match="dynamic client registration"):
            await register_client(
                self._metadata(supports_cimd=True, registration=None), CALLBACK
            )


class TestTheRouteThatServesIt:
    """The document has to be reachable, or none of the above matters."""

    def _client(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        from agent_runtimes.routes.mcp_auth import router

        app = FastAPI()
        app.include_router(router, prefix="/api/v1")
        return TestClient(app)

    def test_it_is_served_at_the_url_it_names(self, told_its_url):
        reply = self._client().get("/api/v1/mcp/client")
        assert reply.status_code == 200
        document = reply.json()
        assert document["client_id"] == f"{PUBLIC}{CLIENT_DOCUMENT_PATH}"
        assert document["client_id"].endswith("/api/v1/mcp/client"), (
            "the path served and the path named must be the same one"
        )

    def test_what_it_serves_is_publishable(self, told_its_url):
        document = self._client().get("/api/v1/mcp/client").json()
        refuse_if_unpublishable(document, document["client_id"])

    def test_it_carries_the_callback_as_a_redirect_uri(self, told_its_url):
        document = self._client().get("/api/v1/mcp/client").json()
        assert document["redirect_uris"] == [CALLBACK]

    def test_a_deployment_with_no_url_serves_nothing(self, not_told_its_url):
        """503 and a sentence naming the setting, rather than a document
        claiming an identity this deployment does not hold."""
        reply = self._client().get("/api/v1/mcp/client")
        assert reply.status_code == 503
        assert "AGENT_RUNTIMES_PUBLIC_URL" in reply.json()["detail"]
