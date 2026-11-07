# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A kept harness keeps reading the Shield's policy for as long as it runs.

Found on r1, 31 October 2026: about an hour after a kept OpenCode harness
started, every step was refused, *IAM answered 401 ... and its copy expired*.
The runtime read IAM with the one credential it first held. These tests go
through the real path, ``policies_in_force`` to ``ManagedPolicies`` to
``IamPolicySource`` over HTTP, against an IAM on a loopback port that takes
the tokens it is told to and answers 401 to every other, as the route does.
"""

from __future__ import annotations

import asyncio
import base64
import json
import socket as sockets
import threading
import time
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict, Iterator, List, Optional, Tuple
from urllib.parse import parse_qs, urlparse

import pytest
from agent_shield.saas import PolicyUnavailable
from websockets.asyncio.server import ServerConnection, serve

from agent_runtimes.apps import principal
from agent_runtimes.guardrails import managed_policies
from agent_runtimes.guardrails.managed_policies import (
    account_of_token,
    runtime_policies,
)
from agent_runtimes.guardrails.shield_policy import policies_in_force
from agent_runtimes.models import models

OWNER = "01OWNER0000000000000000000"
STRANGER = "01STRANGER0000000000000000"
PRINCIPAL = "01PRINCIPAL000000000000000"
DEPLOYMENT = "3b654f2b"
AGENT = "kept-agent"
ROUTE = "/api/iam/v1/mcp-policies/shield/accounts/"


def jwt_of(claims: Dict[str, Any]) -> str:
    """A token in the layout IAM mints; IAM's verification is the route's, not the runtime's."""
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    return f"header.{payload}.signature"


def owners_key(*, exp: float = 0, jti: str = "key") -> str:
    """What a kept harness starts under: a key minted for its owner, or their own token."""
    return jwt_of(
        {
            "jti": jti,
            "sub": OWNER,
            "user": {"uid": OWNER, "roles": []},
            **({"exp": exp} if exp else {}),
        }
    )


def principals_token(jti: str, *, owner: str = OWNER) -> str:
    """The token `_principal_token` mints: the principal in ``user``, its owner beside it."""
    return jwt_of(
        {
            "jti": jti,
            "sub": PRINCIPAL,
            "user": {"uid": PRINCIPAL, "roles": []},
            "agent_uid": PRINCIPAL,
            "account_uid": owner,
            "app_uid": "01APP",
            "task_id": f"deployment:{DEPLOYMENT}:01ULID",
            "task_grant_uid": "g-deployment",
            "authorization_details": [],
        }
    )


class Iam:
    """IAM over HTTP: the tokens it takes, one document, and every read it was asked."""

    def __init__(self) -> None:
        self.taken: set[str] = set()
        self.reads: List[Tuple[str, str]] = []
        #: Served already expired, so each read of the policy is a read of IAM.
        self.lifetime = timedelta(seconds=-1)
        iam = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:  # noqa: N802 - the handler's name
                token = self.headers.get("Authorization", "").removeprefix("Bearer ")
                iam.reads.append((self.path, token))
                taken = token in iam.taken
                expires = datetime.now(timezone.utc) + iam.lifetime
                body = json.dumps(
                    {
                        "policies": [
                            {
                                "scope": "organization",
                                "version": 1,
                                "subject": "org1",
                                "rules": [],
                                "expires": expires.isoformat(),
                            }
                        ],
                        "expires": expires.isoformat(),
                    }
                    if taken
                    else {"detail": "Authentication required"}
                ).encode()
                self.send_response(200 if taken else 401)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args: Any) -> None:
                return None

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}"

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()

    def last_read(self) -> Tuple[str, str]:
        return self.reads[-1]


@pytest.fixture
def iam(monkeypatch: pytest.MonkeyPatch) -> Iterator[Iam]:
    served = Iam()
    monkeypatch.setenv("DATALAYER_IAM_URL", served.url)
    monkeypatch.delenv("DATALAYER_API_KEY", raising=False)
    monkeypatch.delenv("DATALAYER_USER_TOKEN", raising=False)
    monkeypatch.delenv("DATALAYER_AI_AGENTS_URL", raising=False)
    managed_policies.use_source(None)
    runtime_policies().poll_seconds = 0.05
    yield served
    managed_policies.use_source(None)
    runtime_policies().use_socket(None)
    runtime_policies().poll_seconds = 30.0
    principal.forget_principal_token(DEPLOYMENT)
    served.close()


@pytest.fixture
def kept(monkeypatch: pytest.MonkeyPatch) -> None:
    """An agent of this runtime serves the deployment, as the keeper made it."""
    monkeypatch.setitem(
        models._APP_INSTANCES,
        AGENT,
        {"app_uid": "01APP", "deployment_uid": DEPLOYMENT},
    )


def held(token: str, *, expires_in: int = 3600) -> None:
    principal.give_principal_token(
        DEPLOYMENT, token, expires_in=expires_in, principal_uid=PRINCIPAL
    )


class TestAKeptRuntimeReadsWithWhatIsRenewed:
    def test_a_read_after_the_first_token_expired_uses_the_renewed_one(
        self, iam: Iam, kept: None
    ) -> None:
        key = owners_key()
        iam.taken = {key}
        assert [p.scope for p in policies_in_force(token=key)][0] == "organization"
        assert iam.last_read() == (f"{ROUTE}{OWNER}", key)

        # The key runs out; the keeper hands the principal's token.
        first = principals_token("first")
        iam.taken = {first}
        held(first)
        policies_in_force()
        assert iam.last_read() == (f"{ROUTE}{OWNER}", first)

        # It runs out in turn; renewed, the next read takes the new one.
        renewed = principals_token("renewed")
        iam.taken = {renewed}
        held(renewed)
        policies_in_force()
        assert iam.last_read() == (f"{ROUTE}{OWNER}", renewed)

        # The account stayed the owner's at every read, never the principal's uid.
        assert {path for path, _ in iam.reads} == {f"{ROUTE}{OWNER}"}

    def test_the_principals_token_is_read_as_soon_as_it_is_held(
        self, iam: Iam, kept: None
    ) -> None:
        """As the authorizer's credential follows the keeper, this one does."""
        key, token = owners_key(), principals_token("first")
        iam.taken = {key, token}
        policies_in_force(token=key)
        assert iam.last_read()[1] == key
        held(token)
        policies_in_force()
        assert iam.last_read()[1] == token

    def test_a_runtime_first_given_the_principals_token_reads_its_owners_account(
        self, iam: Iam, kept: None
    ) -> None:
        token = principals_token("first")
        iam.taken = {token}
        held(token)
        policies_in_force(token=token)
        assert iam.last_read() == (f"{ROUTE}{OWNER}", token)

    @pytest.mark.asyncio
    async def test_the_poll_refuses_when_nothing_is_valid_and_recovers_once_renewed(
        self, iam: Iam, kept: None
    ) -> None:
        """A step is refused while nothing is held, and the running harness is told
        when the policy is back: the keeper missing one renewal stops no deployment."""
        key = owners_key()
        iam.taken = {key}
        iam.lifetime = timedelta(milliseconds=30)
        policies_in_force(token=key)
        changed: List[Any] = []
        refused: List[str] = []
        stop = runtime_policies().listen(changed.append, refused.append)
        try:
            iam.taken = set()
            for _ in range(200):
                if refused:
                    break
                await asyncio.sleep(0.01)
            assert len(refused) == 1 and "answered 401" in refused[0]
            renewed = principals_token("renewed")
            iam.taken = {renewed}
            held(renewed)
            for _ in range(200):
                if changed:
                    break
                await asyncio.sleep(0.01)
            assert changed and iam.last_read()[1] == renewed
            assert policies_in_force()
        finally:
            stop()


class TestFailsClosed:
    def test_nothing_valid_held_is_the_shields_refusal(
        self, iam: Iam, kept: None
    ) -> None:
        key = owners_key()
        iam.taken = {key}
        policies_in_force(token=key)
        iam.taken = set()
        with pytest.raises(PolicyUnavailable) as refused:
            policies_in_force()
        assert "answered 401" in str(refused.value)
        assert "no unexpired policy is held, so nothing is decided" in str(
            refused.value
        )

    def test_an_expired_principals_token_is_not_sent(
        self, iam: Iam, kept: None
    ) -> None:
        key, token = owners_key(), principals_token("first")
        iam.taken = {key}
        policies_in_force(token=key)
        iam.taken = {token}  # IAM would take it: the runtime says it has run out.
        held(token, expires_in=0)
        with pytest.raises(PolicyUnavailable):
            policies_in_force()
        assert iam.last_read()[1] == key

    def test_a_token_naming_no_account_is_refused(self, iam: Iam) -> None:
        with pytest.raises(PolicyUnavailable, match="names no account"):
            policies_in_force(token="not-a-jwt")

    def test_a_principal_of_another_owner_reads_nothing_for_this_account(
        self, iam: Iam, kept: None
    ) -> None:
        """A person's runtime of somebody else's deployment goes on reading that
        person's documents with that person's token, whatever the principal holds."""
        key = owners_key()
        theirs = principals_token("theirs", owner=STRANGER)
        iam.taken = {key, theirs}
        held(theirs)
        policies_in_force(token=key)
        policies_in_force()
        assert {token for _, token in iam.reads} == {key}


class TestTheLocalCasesAreLeftAsTheyWere:
    def test_no_token_is_unmanaged(self, iam: Iam) -> None:
        assert [p.scope for p in policies_in_force()] == ["session"]
        assert runtime_policies().is_managed is False and iam.reads == []

    def test_a_token_without_iams_url_is_unmanaged(
        self, iam: Iam, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.delenv("DATALAYER_IAM_URL")
        assert [p.scope for p in policies_in_force(token=owners_key())] == ["session"]
        assert runtime_policies().is_managed is False

    def test_the_account_key_is_asked_with_at_every_read(
        self, iam: Iam, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """The CLI and a developer's shell: no deployment, the key, for as long as it lasts."""
        key = owners_key(jti="account-key")
        monkeypatch.setenv("DATALAYER_API_KEY", key)
        iam.taken = {key}
        policies_in_force(token=owners_key(jti="a-token"))
        policies_in_force()
        assert [token for _, token in iam.reads] == [key, key]
        assert runtime_policies().credential_now() == key

    def test_a_person_token_with_no_deployment_is_asked_with_at_every_read(
        self, iam: Iam, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        token = owners_key(jti="person")
        monkeypatch.setenv("DATALAYER_USER_TOKEN", token)
        iam.taken = {token}
        policies_in_force()
        policies_in_force()
        assert [read for _, read in iam.reads] == [token, token]

    def test_a_source_in_iams_place_holds_no_credential(self, iam: Iam) -> None:
        class Fake:
            where = "a fake"

            def fetch(self) -> Any:
                raise PolicyUnavailable("never read")

        managed_policies.use_source(Fake())
        assert runtime_policies().credential_now() == ""
        assert runtime_policies().socket_url() is None


class TestTheAccountOfAToken:
    def test_a_principals_account_is_its_owners(self) -> None:
        assert account_of_token(principals_token("t")) == OWNER

    def test_a_service_agent_naming_no_owner_is_its_own(self) -> None:
        token = jwt_of({"user": {"uid": "agent"}, "agent_uid": "agent", "sub": "agent"})
        assert account_of_token(token) == "agent"

    def test_an_account_claim_on_a_person_changes_nothing(self) -> None:
        """Only a principal is read through ``account_uid``: nobody else names an owner."""
        token = jwt_of({"user": {"uid": OWNER}, "account_uid": STRANGER})
        assert account_of_token(token) == OWNER


class TestThePushSocket:
    def seen(self, url: Optional[str]) -> str:
        assert url is not None
        return parse_qs(urlparse(url).query)["token"][0]

    def test_the_url_is_read_now_and_never_carries_an_expired_token(
        self, iam: Iam, kept: None, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("DATALAYER_AI_AGENTS_URL", "https://r1.test")
        policies = runtime_policies()
        lasting = owners_key(exp=time.time() + 3600)
        iam.taken = {lasting}
        policies_in_force(token=lasting)
        token = principals_token("first")
        held(token)
        # Only the account's own token sits on the channel a change is told on.
        assert self.seen(policies.socket_url()) == lasting

        managed_policies.use_source(None)
        expired = owners_key(exp=time.time() - 1)
        iam.taken = {expired, token}
        policies_in_force(token=expired)
        assert self.seen(policies.socket_url()) == token
        renewed = principals_token("renewed")
        held(renewed)
        assert self.seen(policies.socket_url()) == renewed

    def test_no_ai_agents_or_no_credential_is_no_socket(
        self, iam: Iam, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        policies = runtime_policies()
        monkeypatch.setenv("DATALAYER_AI_AGENTS_URL", "https://r1.test")
        assert policies.socket_url() is None
        monkeypatch.delenv("DATALAYER_AI_AGENTS_URL")
        key = owners_key()
        iam.taken = {key}
        policies_in_force(token=key)
        assert policies.socket_url() is None

    @pytest.mark.asyncio
    async def test_a_lost_socket_opens_again_with_what_is_held_by_then(
        self, iam: Iam, kept: None, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Bound at creation, a socket lost after the first token's hour was
        opened again with that token for the rest of the runtime's life."""
        with sockets.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            port = probe.getsockname()[1]
        monkeypatch.setenv("DATALAYER_AI_AGENTS_URL", f"http://127.0.0.1:{port}")
        tokens: List[str] = []
        lost = asyncio.Event()

        async def drop_after_first(connection: ServerConnection) -> None:
            assert connection.request is not None
            tokens.append(parse_qs(urlparse(connection.request.path).query)["token"][0])
            lost.set()
            if len(tokens) == 1:
                await connection.close()
            else:
                await connection.wait_closed()

        lasting = owners_key(exp=time.time() + 0.3)
        renewed = principals_token("renewed")
        iam.taken = {lasting, renewed}
        iam.lifetime = timedelta(minutes=5)
        async with serve(drop_after_first, "127.0.0.1", port):
            policies_in_force(token=lasting)
            stop = runtime_policies().listen(lambda _: None, lambda _: None)
            try:
                await asyncio.wait_for(lost.wait(), 5)
                held(renewed)
                await asyncio.sleep(0.35)  # the first token runs out while the socket is away
                for _ in range(300):
                    if len(tokens) > 1:
                        break
                    await asyncio.sleep(0.01)
            finally:
                stop()
        assert tokens[:2] == [lasting, renewed]
