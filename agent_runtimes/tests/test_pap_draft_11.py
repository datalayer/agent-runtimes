# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The additions of the Personal Agent Protocol's unpublished draft 1.1 a host may turn on.

Each is off by default, and a runtime speaks PAP 1.0 either way. Against the SDK's Manzanita
demo company on its in-process network: with ``offline_access`` on, a Device Sign-In names
the scope when the issuer lists it and it is never one of the scopes granted; with the
operator's signature on the OAuth endpoints, the signer :func:`operator_signer` makes signs
them. Turned on with an SDK that has neither (the stable 1.0.x), a setting is refused.

The tests that turn an addition on need the SDK's pre-release (1.1.0a1) and are skipped on
the stable SDK; the others run on both.
"""

from __future__ import annotations

import dataclasses
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl

import httpx
import pytest
from personal_agent_protocol.company import CompanyConfig
from personal_agent_protocol.demo.kit import (
    AgentIdentity,
    InProcessNetwork,
    MutableClock,
    PersonalAgentHost,
    personal_agent_reactor,
)
from personal_agent_protocol.demo.manzanita import CONFIG, manzanita
from personal_agent_protocol.operator_signatures import (
    WebBotAuthSigner,
    new_operator_key,
)

from agent_runtimes.pap import PapPersonalAgentCapability, draft
from agent_runtimes.protocols.pap import pap_protocol_version
from agent_runtimes.tests.test_pap_personal_agent import DOMAIN, _host_plugins

#: Whether this run's SDK has the draft's additions, read from its own company configuration.
DRAFT_SDK = any(
    field.name == "offline_access" for field in dataclasses.fields(CompanyConfig)
)
needs_draft_sdk = pytest.mark.skipif(
    not DRAFT_SDK, reason="the stable PAP SDK has none of draft 1.1's additions"
)
SETTINGS = (draft.OFFLINE_ACCESS_ENV, draft.OPERATOR_SIGNS_OAUTH_ENV)


@pytest.fixture(autouse=True)
def unset(monkeypatch: pytest.MonkeyPatch) -> None:
    for setting in SETTINGS:
        monkeypatch.delenv(setting, raising=False)


class _Sent:
    """What the agent sent the company, as sent."""

    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []

    async def __call__(self, request: httpx.Request) -> None:
        if request.url.host == DOMAIN:
            self.requests.append(request)

    def device(self) -> dict[str, str]:
        [request] = [r for r in self.requests if r.url.path == "/oauth/device"]
        return dict(parse_qsl(request.content.decode()))


def _world(
    folder: Path, config: Any = None, **capability: Any
) -> tuple[PapPersonalAgentCapability, Any, MutableClock, _Sent]:
    clock = MutableClock()
    network = InProcessNetwork()
    atlas = AgentIdentity(domain="atlas.example", name="Atlas")
    network.add(atlas.domain, atlas.website())
    shop, _ = manzanita(network, clock, config=CONFIG if config is None else config)
    http = network.client()
    sent = _Sent()
    http.event_hooks["request"].append(sent)
    reactor = personal_agent_reactor(
        PersonalAgentHost(atlas, clock),
        network=network,
        http_client=http,
        plugins=_host_plugins(folder),
    )
    agent = PapPersonalAgentCapability(
        reactor=reactor,
        http_client=http,
        client_id=atlas.client_id,
        tenant_id="t1",
        **capability,
    )
    return agent, shop, clock, sent


async def _signed_in(agent: Any, shop: Any, clock: MutableClock) -> Any:
    started = await agent.sign_in(DOMAIN, user_id="ada")
    assert started.status == "waiting_for_the_person"
    await shop.approve_device(started.code, account_id="acct_ada")
    clock.advance(10)
    return await agent.sign_in_status(DOMAIN, user_id="ada")


# -- off by default, on both SDKs ---------------------------------------------------------


def test_every_addition_is_off_by_default_and_the_protocol_spoken_is_1_0() -> None:
    assert draft.offline_access() is False
    assert draft.operator_signs_oauth() is False
    assert pap_protocol_version() == "1.0"
    assert draft.sign_in_scopes(object(), False) == {}


@pytest.mark.asyncio
async def test_off_a_sign_in_names_the_account_scopes_alone(tmp_path: Path) -> None:
    agent, shop, clock, sent = _world(tmp_path)
    done = await _signed_in(agent, shop, clock)
    assert done.status == "signed_in"
    assert sent.device()["scope"].split() == ["orders:read", "orders:write"]
    assert not any("signature-input" in request.headers for request in sent.requests)


@pytest.mark.asyncio
async def test_off_offline_access_is_no_account_scope_though_the_issuer_lists_it(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    # An issuer that lists it: the pre-release SDK's company says so itself, and the stable
    # SDK's metadata is told so here, as any company's document may say it.
    config = dataclasses.replace(CONFIG, offline_access=True) if DRAFT_SDK else CONFIG
    agent, shop, clock, sent = _world(tmp_path, config)
    discover = agent._discover

    async def listing_it(domain: str) -> Any:
        company = await discover(domain)
        listed = company.oauth_metadata.scopes_supported
        if draft.OFFLINE_ACCESS_SCOPE not in listed:
            listed.append(draft.OFFLINE_ACCESS_SCOPE)
        return company

    monkeypatch.setattr(agent, "_discover", listing_it)
    # Asked for by name: refused, and not named among what the company offers.
    refused = await agent.sign_in(
        DOMAIN, user_id="ada", scopes=("orders:read", "offline_access")
    )
    assert refused.status == "unavailable"
    assert "offline_access" not in (refused.reason or "")
    assert not [r for r in sent.requests if r.url.path == "/oauth/device"]
    # The default sign-in names the account scopes alone.
    started = await agent.sign_in(DOMAIN, user_id="ada")
    assert started.status == "waiting_for_the_person"
    assert sent.device()["scope"].split() == ["orders:read", "orders:write"]


@pytest.mark.parametrize("setting", SETTINGS)
@pytest.mark.parametrize("said", ["false", "0", "off", ""])
def test_a_setting_said_off_is_off(
    monkeypatch: pytest.MonkeyPatch, setting: str, said: str
) -> None:
    monkeypatch.setenv(setting, said)
    assert draft.enabled(setting) is False


@pytest.mark.parametrize("setting", SETTINGS)
def test_a_setting_that_is_neither_on_nor_off_is_refused(
    monkeypatch: pytest.MonkeyPatch, setting: str
) -> None:
    monkeypatch.setenv(setting, "perhaps")
    with pytest.raises(ValueError, match="true or false"):
        draft.enabled(setting)


@pytest.mark.parametrize("setting", SETTINGS)
def test_turned_on_with_an_sdk_that_lacks_it_a_setting_is_refused_saying_which_sdk(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, setting: str
) -> None:
    """The stable SDK (1.0.x), whatever SDK this run has: said by taking the addition away."""
    monkeypatch.setitem(draft._SDK_HAS, setting, lambda: False)
    monkeypatch.setenv(setting, "true")
    with pytest.raises(
        draft.PapDraftUnavailable, match="personal-agent-protocol==1.1.0a1"
    ):
        draft.enabled(setting)
    # By the environment, or by the host's own choice: the capability does not start.
    if setting == draft.OFFLINE_ACCESS_ENV:
        with pytest.raises(draft.PapDraftUnavailable):
            _world(tmp_path)
        monkeypatch.delenv(setting)
        with pytest.raises(draft.PapDraftUnavailable):
            _world(tmp_path, offline_access=True)
        # Left off, the same installation starts.
        _world(tmp_path, offline_access=False)
    else:
        with pytest.raises(draft.PapDraftUnavailable):
            draft.operator_signer(
                new_operator_key(),
                signature_agent="https://atlas.example/keys.json",
            )


def test_the_operator_signer_is_the_stable_sdks_own_while_the_addition_is_off() -> None:
    signer = draft.operator_signer(
        new_operator_key(), signature_agent="https://atlas.example/keys.json"
    )
    assert isinstance(signer, WebBotAuthSigner)
    assert getattr(signer, "signs_oauth_endpoints", False) is False


def test_the_sdk_is_asked_what_it_has() -> None:
    assert draft.sdk_has_offline_access() is DRAFT_SDK
    assert draft.sdk_has_oauth_signatures() is DRAFT_SDK


# -- turned on: the SDK's pre-release -----------------------------------------------------


@needs_draft_sdk
@pytest.mark.asyncio
async def test_on_a_sign_in_asks_for_offline_access_when_the_issuer_lists_it_and_it_is_never_granted(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    needs_it = dataclasses.replace(CONFIG, offline_access=True)
    # Off, at a company whose refresh tokens need it: not asked for, as before.
    (tmp_path / "off").mkdir()
    agent, shop, clock, sent = _world(tmp_path / "off", needs_it)
    await agent.sign_in(DOMAIN, user_id="ada")
    assert "offline_access" not in sent.device()["scope"].split()

    monkeypatch.setenv(draft.OFFLINE_ACCESS_ENV, "true")
    agent, shop, clock, sent = _world(tmp_path, needs_it)
    done = await _signed_in(agent, shop, clock)
    assert sent.device()["scope"].split() == [
        "orders:read",
        "orders:write",
        "offline_access",
    ]
    assert done.status == "signed_in"
    assert set(done.granted_scopes) == {"orders:read", "orders:write"}
    assert "offline_access" not in done.missing_scopes
    # It is no scope a caller may ask for by name: it is not access to the account.
    refused = await agent.sign_in(
        DOMAIN, user_id="bea", scopes=("orders:read", "offline_access")
    )
    assert refused.status == "unavailable" and "offline_access" not in (
        refused.reason or ""
    )


@needs_draft_sdk
@pytest.mark.asyncio
async def test_on_by_the_hosts_own_choice_and_a_company_that_does_not_list_it_is_asked_as_before(
    tmp_path: Path,
) -> None:
    agent, shop, clock, sent = _world(tmp_path, offline_access=True)
    done = await _signed_in(agent, shop, clock)
    assert done.status == "signed_in"
    assert sent.device()["scope"].split() == ["orders:read", "orders:write"]


@needs_draft_sdk
def test_on_the_operator_signer_signs_the_oauth_endpoints(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    key = new_operator_key()
    chosen = draft.operator_signer(
        key, signature_agent="https://atlas.example/keys.json", oauth_endpoints=True
    )
    assert chosen.signs_oauth_endpoints is True
    monkeypatch.setenv(draft.OPERATOR_SIGNS_OAUTH_ENV, "true")
    by_environment = draft.operator_signer(
        key, signature_agent="https://atlas.example/keys.json"
    )
    assert by_environment.signs_oauth_endpoints is True
    # The host's own choice wins over the environment.
    off = draft.operator_signer(
        key, signature_agent="https://atlas.example/keys.json", oauth_endpoints=False
    )
    assert off.signs_oauth_endpoints is False
