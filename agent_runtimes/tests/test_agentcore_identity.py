# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The `agentcore` identity provider (ID-21) against a stubbed
`bedrock-agentcore` client — every call's parameters asserted, the polling,
decline and timeout paths, `ForUserId` refused — and a skill decorated with
`@requires_oauth` (ID-22), run once with a token and once with a URL.
"""

from __future__ import annotations

import asyncio
from typing import Any, Iterator

import pytest

boto3 = pytest.importorskip("boto3")
from botocore.exceptions import UnknownServiceError  # noqa: E402
from botocore.stub import Stubber  # noqa: E402

try:
    boto3.client("bedrock-agentcore", region_name="us-east-1")
except UnknownServiceError:  # pragma: no cover - an older botocore
    pytest.skip("botocore has no AgentCore service model", allow_module_level=True)

from agent_runtimes import identity  # noqa: E402
from agent_runtimes.agentcore.identity import (  # noqa: E402
    AgentCoreIdentity,
    use_workload_token,
    workload_token_from_headers,
)
from agent_runtimes.guardrails.credentials import held_secrets  # noqa: E402
from agent_runtimes.plugins.points import (  # noqa: E402
    AuthorizationDeclined,
    AuthorizationRequired,
    AuthorizationTimedOut,
    IdentityRefused,
)

WORKLOAD = "workload-access-token"
URL = "https://bedrock-agentcore.us-east-1.amazonaws.com/identities/oauth2/authorize?request_uri=urn:1"
SESSION_URI = "urn:ietf:params:oauth:request_uri:abc"
RETURN = "https://prod1.datalayer.run/api/iam/v1/identity/agentcore/bind"


@pytest.fixture()
def stubbed() -> Iterator[tuple[Any, Stubber]]:
    client = boto3.client(
        "bedrock-agentcore",
        region_name="us-east-1",
        aws_access_key_id="testing",
        aws_secret_access_key="testing",
    )
    with Stubber(client) as stub:
        yield client, stub
        stub.assert_no_pending_responses()


@pytest.fixture(autouse=True)
def not_in_agentcore(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("AGENT_RUNTIMES_TARGET", raising=False)
    monkeypatch.delenv("AGENTCORE_WORKLOAD_NAME", raising=False)
    monkeypatch.delenv("AGENTCORE_OAUTH_RETURN_URL", raising=False)


class Clock:
    """A clock that moves only when slept on."""

    def __init__(self) -> None:
        self.now = 1000.0
        self.slept: list[float] = []

    def __call__(self) -> float:
        return self.now

    async def sleep(self, seconds: float) -> None:
        self.slept.append(seconds)
        self.now += seconds


def _provider(
    client: Any, clock: Clock | None = None, **kwargs: Any
) -> AgentCoreIdentity:
    clock = clock or Clock()
    return AgentCoreIdentity(
        client,
        workload_name="datalayer-dep-1",
        return_url=RETURN,
        clock=clock,
        sleep=clock.sleep,
        **kwargs,
    )


def _oauth_params(**more: Any) -> dict[str, Any]:
    params = {
        "workloadIdentityToken": WORKLOAD,
        "resourceCredentialProviderName": "github",
        "scopes": ["read:user"],
        "oauth2Flow": "USER_FEDERATION",
        "resourceOauth2ReturnUrl": RETURN,
    }
    params.update(more)
    return params


# --- the workload token ---------------------------------------------------------


def test_the_workload_token_outside_runtime_is_asked_for_by_the_persons_jwt(
    stubbed,
) -> None:
    client, stub = stubbed
    stub.add_response(
        "get_workload_access_token_for_jwt",
        {"workloadAccessToken": WORKLOAD},
        {"workloadName": "datalayer-dep-1", "userToken": "iam-rs256"},
    )
    token = asyncio.run(_provider(client).workload_token({"user_token": "iam-rs256"}))
    assert token == WORKLOAD and WORKLOAD in held_secrets()


def test_the_workload_token_in_runtime_is_the_invocations(stubbed, monkeypatch) -> None:
    client, _ = stubbed
    provider = _provider(client)
    assert (
        workload_token_from_headers({"workloadaccesstoken": "from-header"})
        == "from-header"
    )
    assert (
        asyncio.run(provider.workload_token({"headers": {"WorkloadAccessToken": "h"}}))
        == "h"
    )
    assert (
        asyncio.run(provider.workload_token({"workload_access_token": "given"}))
        == "given"
    )

    async def held() -> str:
        with use_workload_token("held"):
            return await provider.workload_token({})

    assert asyncio.run(held()) == "held"
    monkeypatch.setenv("AGENT_RUNTIMES_TARGET", "agentcore")
    with pytest.raises(IdentityRefused, match="cannot fetch its own"):
        asyncio.run(provider.workload_token({"user_token": "iam-rs256"}))


def test_a_workload_token_for_a_user_id_is_never_asked(stubbed) -> None:
    client, _ = stubbed
    with pytest.raises(
        IdentityRefused, match="GetWorkloadAccessTokenForUserId is not called"
    ):
        asyncio.run(
            _provider(client).workload_token({"user_id": "u-1", "user_token": "t"})
        )
    with pytest.raises(IdentityRefused, match="one was not given"):
        asyncio.run(_provider(client).workload_token({}))


# --- OAuth tokens ---------------------------------------------------------------


def test_a_token_in_the_vault_is_returned(stubbed) -> None:
    client, stub = stubbed
    stub.add_response(
        "get_resource_oauth2_token",
        {"accessToken": "gho_vault"},
        _oauth_params(forceAuthentication=True, customState="nonce-1"),
    )
    token = asyncio.run(
        _provider(client).oauth_token(
            "github",
            ["read:user"],
            "USER_FEDERATION",
            None,
            context={"workload_access_token": WORKLOAD},
            force_authentication=True,
            custom_state="nonce-1",
        )
    )
    assert token == "gho_vault" and "gho_vault" in held_secrets()


def test_m2m_sends_no_return_url(stubbed) -> None:
    client, stub = stubbed
    stub.add_response(
        "get_resource_oauth2_token",
        {"accessToken": "m2m"},
        {
            "workloadIdentityToken": WORKLOAD,
            "resourceCredentialProviderName": "salesforce",
            "scopes": ["api"],
            "oauth2Flow": "M2M",
        },
    )
    token = asyncio.run(
        _provider(client).oauth_token(
            "salesforce",
            ["api"],
            "M2M",
            None,
            context={"workload_access_token": WORKLOAD},
        )
    )
    assert token == "m2m"
    with pytest.raises(ValueError, match="is not an OAuth flow"):
        asyncio.run(
            _provider(client).oauth_token(
                "x", ["a"], "ON_BEHALF_OF_TOKEN_EXCHANGE", None
            )
        )
    with pytest.raises(ValueError, match="No scopes"):
        asyncio.run(_provider(client).oauth_token("x", [], "M2M", None))


def test_an_authorization_url_is_shown_and_the_grant_polled_for(stubbed) -> None:
    client, stub = stubbed
    stub.add_response(
        "get_resource_oauth2_token",
        {
            "authorizationUrl": URL,
            "sessionUri": SESSION_URI,
            "sessionStatus": "IN_PROGRESS",
        },
        _oauth_params(forceAuthentication=True),
    )
    stub.add_response(
        "get_resource_oauth2_token",
        {"sessionUri": SESSION_URI, "sessionStatus": "IN_PROGRESS"},
        _oauth_params(sessionUri=SESSION_URI),
    )
    stub.add_response(
        "get_resource_oauth2_token",
        {"accessToken": "gho_granted"},
        _oauth_params(sessionUri=SESSION_URI),
    )
    shown: list[str] = []
    clock = Clock()

    async def show(url: str) -> None:
        shown.append(url)

    token = asyncio.run(
        _provider(client, clock, poll_seconds=3.0).oauth_token(
            "github",
            ["read:user"],
            "USER_FEDERATION",
            show,
            context={"workload_access_token": WORKLOAD},
            force_authentication=True,
        )
    )
    assert token == "gho_granted"
    assert shown == [URL]
    assert clock.slept == [3.0, 3.0]


def test_a_declined_grant_ends_the_call_in_a_sentence(stubbed) -> None:
    client, stub = stubbed
    stub.add_response(
        "get_resource_oauth2_token",
        {"authorizationUrl": URL, "sessionUri": SESSION_URI},
        _oauth_params(),
    )
    stub.add_response(
        "get_resource_oauth2_token",
        {"sessionUri": SESSION_URI, "sessionStatus": "FAILED"},
        _oauth_params(sessionUri=SESSION_URI),
    )
    with pytest.raises(AuthorizationDeclined) as declined:
        asyncio.run(
            _provider(client).oauth_token(
                "github",
                ["read:user"],
                "USER_FEDERATION",
                lambda url: None,
                context={"workload_access_token": WORKLOAD},
            )
        )
    assert str(declined.value) == (
        "Access to github was not granted: the person declined, or the grant failed."
    )


def test_a_grant_not_completed_in_time_is_said_never_hung_on(stubbed) -> None:
    client, stub = stubbed
    stub.add_response(
        "get_resource_oauth2_token",
        {"authorizationUrl": URL, "sessionUri": SESSION_URI},
        _oauth_params(),
    )
    for _ in range(3):
        stub.add_response(
            "get_resource_oauth2_token",
            {"sessionUri": SESSION_URI, "sessionStatus": "IN_PROGRESS"},
            _oauth_params(sessionUri=SESSION_URI),
        )
    clock = Clock()
    with pytest.raises(AuthorizationTimedOut, match="not granted within 6 seconds"):
        asyncio.run(
            _provider(client, clock, wait_seconds=6.0, poll_seconds=2.0).oauth_token(
                "github",
                ["read:user"],
                "USER_FEDERATION",
                lambda url: None,
                context={"workload_access_token": WORKLOAD},
            )
        )
    assert clock.slept == [2.0, 2.0, 2.0]


def test_the_default_wait_is_five_minutes() -> None:
    assert AgentCoreIdentity().wait_seconds == 300.0


def test_without_anyone_to_show_it_the_url_is_raised_at_once(stubbed) -> None:
    client, stub = stubbed
    stub.add_response(
        "get_resource_oauth2_token",
        {"authorizationUrl": URL, "sessionUri": SESSION_URI},
        _oauth_params(),
    )
    with pytest.raises(AuthorizationRequired) as required:
        asyncio.run(
            _provider(client).oauth_token(
                "github",
                ["read:user"],
                "USER_FEDERATION",
                None,
                context={"workload_access_token": WORKLOAD},
            )
        )
    assert required.value.url == URL and required.value.session_uri == SESSION_URI


# --- API keys, the binding, the inbound token -----------------------------------


def test_api_key(stubbed) -> None:
    client, stub = stubbed
    stub.add_response(
        "get_resource_api_key",
        {"apiKey": "tvly-vault"},
        {"workloadIdentityToken": WORKLOAD, "resourceCredentialProviderName": "tavily"},
    )
    key = asyncio.run(
        _provider(client).api_key("tavily", context={"workload_access_token": WORKLOAD})
    )
    assert key == "tvly-vault" and "tvly-vault" in held_secrets()


def test_complete_binding_with_the_persons_token_never_a_user_id(stubbed) -> None:
    client, stub = stubbed
    stub.add_response(
        "complete_resource_token_auth",
        {},
        {"userIdentifier": {"userToken": "iam-rs256"}, "sessionUri": SESSION_URI},
    )
    provider = _provider(client)
    asyncio.run(provider.complete_binding(SESSION_URI, {"user_token": "iam-rs256"}))
    with pytest.raises(IdentityRefused, match="never by a user id"):
        asyncio.run(provider.complete_binding(SESSION_URI, {"user_id": "u-1"}))
    with pytest.raises(IdentityRefused, match="No token of the person"):
        asyncio.run(provider.complete_binding(SESSION_URI, {}))


def test_the_inbound_token_is_the_platforms_exchange() -> None:
    with pytest.raises(IdentityRefused, match="No token exchange is configured"):
        asyncio.run(AgentCoreIdentity().inbound_token({"token": "jwt"}, "arn:rt"))

    async def exchange(caller: Any, audience: str) -> str:
        return f"rs256-for-{audience}"

    provider = AgentCoreIdentity(exchange=exchange)
    assert (
        asyncio.run(provider.inbound_token({"token": "jwt"}, "arn:rt"))
        == "rs256-for-arn:rt"
    )


# --- a skill decorated with @requires_oauth ------------------------------------


@identity.requires_oauth("github", scopes=["read:user"])
async def my_login(*, access_token: str) -> str:
    """A skill: whose GitHub this is."""
    return f"login with {access_token}"


def test_a_decorated_skill_run_with_a_token(stubbed, monkeypatch) -> None:
    client, stub = stubbed
    monkeypatch.setenv("AGENT_RUNTIMES_TARGET", "agentcore")
    monkeypatch.setattr(
        identity, "active_provider", lambda platform=None: _provider(client)
    )
    stub.add_response(
        "get_resource_oauth2_token", {"accessToken": "gho_1"}, _oauth_params()
    )

    async def run() -> str:
        with use_workload_token(WORKLOAD):
            return await my_login()

    assert asyncio.run(run()) == "login with gho_1"


def test_a_decorated_skill_run_with_a_url(stubbed, monkeypatch) -> None:
    from ag_ui.core import CustomEvent

    client, stub = stubbed
    monkeypatch.setattr(
        identity, "active_provider", lambda platform=None: _provider(client)
    )
    stub.add_response(
        "get_resource_oauth2_token",
        {"authorizationUrl": URL, "sessionUri": SESSION_URI},
        _oauth_params(),
    )
    stub.add_response(
        "get_resource_oauth2_token",
        {"accessToken": "gho_2"},
        _oauth_params(sessionUri=SESSION_URI),
    )
    stub.add_response(
        "get_resource_oauth2_token",
        {"authorizationUrl": URL, "sessionUri": SESSION_URI},
        _oauth_params(),
    )
    emitted: list[Any] = []

    async def with_sink() -> str:
        with (
            use_workload_token(WORKLOAD),
            identity.use_authorization_sink(emitted.append),
        ):
            return await my_login()

    assert asyncio.run(with_sink()) == "login with gho_2"
    [event] = emitted
    assert isinstance(event, CustomEvent)
    assert event.name == "identity.authorization_required"
    assert event.value == {
        "id": event.value["id"],
        "agent": "",
        "provider": "github",
        "scopes": ["read:user"],
        "url": URL,
    }
    assert event.value["id"]

    async def without_sink() -> str:
        with use_workload_token(WORKLOAD):
            return await my_login()

    with pytest.raises(AuthorizationRequired) as required:
        asyncio.run(without_sink())
    assert required.value.url == URL
