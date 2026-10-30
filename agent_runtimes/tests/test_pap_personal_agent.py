# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A local runtime's personal agent at a PAP company.

``PapPersonalAgentCapability`` given the host's PAP reactor, against the SDK's
Manzanita demo world on an in-process network: a signed-out Session, Device
Sign-In approved on the company's page, the same conversation signed in, an
operation proposed and confirmed only once the person approved it on the
host's approval surface. No token, Session JWT or device code in any answer.
"""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

import pytest
from personal_agent_protocol import (
    APPROVAL_SURFACES,
    CLOCKS,
    PAIRWISE_USER_ID_STORES,
    ApprovalRequest,
    SqlitePairwiseUserIdStore,
)
from personal_agent_protocol.demo.kit import (
    AgentIdentity,
    InProcessNetwork,
    MutableClock,
    PersonalAgentHost,
    personal_agent_reactor,
)
from personal_agent_protocol.demo.manzanita import manzanita
from reactor import PluginManifest

from agent_runtimes.pap import PapCapabilityError, PapPersonalAgentCapability

DOMAIN = "manzanita.example"


class Pairwise:
    """The host's pairwise identities: one random id per person and company."""

    def __init__(self, folder: Path) -> None:
        self.store = SqlitePairwiseUserIdStore(folder / "pairwise.sqlite")

    def provide_contributions(self, contributions: Any) -> None:
        contributions.contribute(
            PAIRWISE_USER_ID_STORES, self.store, contribution_id="host", order=50
        )


def _host_plugins(folder: Path, surface: Surface | None = None) -> list[Any]:
    plugins: list[Any] = [
        (PluginManifest(name="pairwise", version="1"), Pairwise(folder))
    ]
    if surface is not None:
        plugins.append((PluginManifest(name="approval-surface", version="1"), surface))
    return plugins


class Surface:
    """The host's approval surface: what the person answers."""

    def __init__(self, answer: bool) -> None:
        self.answer = answer
        self.asked: list[ApprovalRequest] = []

    async def approve(self, request: ApprovalRequest) -> bool:
        self.asked.append(request)
        return self.answer

    def provide_contributions(self, contributions: Any) -> None:
        contributions.contribute(
            APPROVAL_SURFACES, self, contribution_id="person", order=50
        )


async def _journey(
    surface: Surface | None, folder: Path
) -> tuple[PapPersonalAgentCapability, Any, Any, list[Any]]:
    clock = MutableClock()
    network = InProcessNetwork()
    atlas = AgentIdentity(domain="atlas.example", name="Atlas")
    network.add(atlas.domain, atlas.website())
    shop, _ = manzanita(network, clock)
    host = PersonalAgentHost(atlas, clock)
    http = network.client()
    reactor = personal_agent_reactor(
        host, network=network, http_client=http, plugins=_host_plugins(folder, surface)
    )
    capability = PapPersonalAgentCapability(
        reactor=reactor, http_client=http, client_id=atlas.client_id, tenant_id="t1"
    )
    said: list[Any] = []

    signed_out = await capability.ask(
        DOMAIN, "Where is my jacket order?", user_id="ada"
    )
    said.append(signed_out)
    assert signed_out.authorization == {
        "error": "insufficient_scope",
        "scope": "orders:read orders:write",
    }
    started = await capability.sign_in(DOMAIN, user_id="ada")
    said.append(started)
    assert started.status == "waiting_for_the_person"
    assert started.code and started.open and started.open.startswith("https://")
    # Ada approves on Manzanita's own page.
    await shop.approve_device(started.code, account_id="acct_ada")
    clock.advance(10)
    done = await capability.sign_in_status(DOMAIN, user_id="ada")
    said.append(done)
    assert done.status == "signed_in"
    assert set(done.granted_scopes) == {"orders:read", "orders:write"}
    answer = await capability.ask(
        DOMAIN, "Can I exchange it for a warmer one?", user_id="ada"
    )
    said.append(answer)
    assert len(answer.operations) == 1
    return capability, answer.operations[0], shop, said


def _no_secret(said: list[Any]) -> None:
    text = " ".join(repr(item) + item.model_dump_json() for item in said)
    for secret in (
        "access_token",
        "device_code",
        "refresh_token",
        "Poppy-Session",
        "eyJ",
    ):
        assert secret not in text, secret


@pytest.mark.asyncio
async def test_signed_in_and_an_operation_confirmed_once_the_person_approves(
    tmp_path: Path,
) -> None:
    surface = Surface(True)
    capability, operation, _, said = await _journey(surface, tmp_path)
    confirmed = await capability.confirm(
        DOMAIN, operation.operation_ref, operation.revision, user_id="ada"
    )
    said.append(confirmed)
    assert confirmed.status == "confirmed"
    assert len(surface.asked) == 1
    asked = surface.asked[0]
    assert asked.arguments == {
        "operation_id": operation.operation_ref,
        "revision": operation.revision,
    }
    # The company's own words and who asks, with the terms and when they end.
    assert asked.summary == operation.summary
    assert asked.company_name == "Manzanita Outfitters"
    assert asked.company_domain == DOMAIN
    assert asked.terms == operation.terms
    assert asked.expires_at is not None
    # What the company said came of it, in its own words: no display, no state of its own.
    assert confirmed.state == "said" and confirmed.result
    session = capability.session_of(DOMAIN, user_id="ada")
    assert session is not None and session["signed_in"] is True
    _no_secret(said)


@pytest.mark.asyncio
async def test_a_confirmed_operation_is_not_confirmed_twice(tmp_path: Path) -> None:
    surface = Surface(True)
    capability, operation, _, _ = await _journey(surface, tmp_path)
    await capability.confirm(
        DOMAIN, operation.operation_ref, operation.revision, user_id="ada"
    )
    with pytest.raises(PapCapabilityError) as raised:
        await capability.confirm(
            DOMAIN, operation.operation_ref, operation.revision, user_id="ada"
        )
    assert raised.value.code == "unknown_operation"
    assert len(surface.asked) == 1


@pytest.mark.asyncio
async def test_other_terms_come_back_to_the_person(tmp_path: Path) -> None:
    surface = Surface(True)
    capability, operation, shop, _ = await _journey(surface, tmp_path)
    await shop.revise(
        operation.operation_ref,
        summary="Exchange for the warmer jacket, 5 EUR more",
        terms={**operation.terms, "difference": {"amount": "5", "currency": "EUR"}},
    )
    revised = await capability.confirm(
        DOMAIN, operation.operation_ref, operation.revision, user_id="ada"
    )
    assert revised.status == "new_revision"
    assert revised.operation.revision != operation.revision
    # The person is asked about the new terms, told what changed.
    confirmed = await capability.confirm(
        DOMAIN,
        revised.operation.operation_ref,
        revised.operation.revision,
        user_id="ada",
    )
    assert confirmed.status == "confirmed"
    assert [len(asked.changed) > 0 for asked in surface.asked] == [False, True]
    assert "summary" in surface.asked[1].changed


@pytest.mark.asyncio
async def test_an_expired_revision_is_not_asked(tmp_path: Path) -> None:
    surface = Surface(True)
    capability, operation, _, _ = await _journey(surface, tmp_path)
    assert capability._reactor is not None
    clock = capability._reactor.get_contributions(CLOCKS)[0].value
    clock.advance(24 * 3600)
    expired = await capability.confirm(
        DOMAIN, operation.operation_ref, operation.revision, user_id="ada"
    )
    assert expired.status == "not_decided"
    assert surface.asked == []


@pytest.mark.asyncio
async def test_a_session_is_named_one_way_from_its_sid(tmp_path: Path) -> None:
    capability, _, _, _ = await _journey(Surface(True), tmp_path)
    session = capability._links[("ada", DOMAIN)].session
    assert session is not None
    sid = session.sid
    shown = capability.session_of(DOMAIN, user_id="ada")
    assert shown == {
        "ref": hashlib.sha256(sid.encode()).hexdigest()[:12],
        "signed_in": True,
    }
    assert sid not in str(shown)
    assert capability.session_of("other.example", user_id="ada") is None


@pytest.mark.asyncio
async def test_nothing_is_confirmed_when_the_person_says_no(tmp_path: Path) -> None:
    surface = Surface(False)
    capability, operation, _, said = await _journey(surface, tmp_path)
    refused = await capability.confirm(
        DOMAIN, operation.operation_ref, operation.revision, user_id="ada"
    )
    assert refused.status == "not_approved"
    assert refused.operation.revision == operation.revision
    _no_secret([*said, refused])


@pytest.mark.asyncio
async def test_without_an_approval_surface_nothing_is_sent(tmp_path: Path) -> None:
    capability, operation, _, _ = await _journey(None, tmp_path)
    with pytest.raises(PapCapabilityError) as raised:
        await capability.confirm(
            DOMAIN, operation.operation_ref, operation.revision, user_id="ada"
        )
    assert raised.value.code == "no_approval_surface"


@pytest.mark.asyncio
async def test_only_a_proposed_revision_is_confirmed(tmp_path: Path) -> None:
    capability, operation, _, _ = await _journey(Surface(True), tmp_path)
    with pytest.raises(PapCapabilityError) as raised:
        await capability.confirm(
            DOMAIN, operation.operation_ref, "another", user_id="ada"
        )
    assert raised.value.code == "unknown_operation"


@pytest.mark.asyncio
async def test_scopes_beyond_the_offer_are_not_asked(tmp_path: Path) -> None:
    clock = MutableClock()
    network = InProcessNetwork()
    atlas = AgentIdentity(domain="atlas.example", name="Atlas")
    network.add(atlas.domain, atlas.website())
    manzanita(network, clock)
    http = network.client()
    reactor = personal_agent_reactor(
        PersonalAgentHost(atlas, clock),
        network=network,
        http_client=http,
        plugins=_host_plugins(tmp_path),
    )
    capability = PapPersonalAgentCapability(
        reactor=reactor, http_client=http, client_id=atlas.client_id
    )
    beyond = await capability.sign_in(DOMAIN, user_id="ada", scopes=("admin",))
    assert beyond.status == "unavailable"
    assert "orders:read" in (beyond.reason or "")


@pytest.mark.asyncio
async def test_public_metadata_only_without_a_host() -> None:
    capability = PapPersonalAgentCapability()
    with pytest.raises(PapCapabilityError) as raised:
        await capability.ask(DOMAIN, "hello", user_id="ada")
    assert raised.value.code == "no_host"
    await capability.aclose()
    with pytest.raises(ValueError):
        PapPersonalAgentCapability(client_id="https://atlas.example/agent.json")


@pytest.mark.asyncio
async def test_what_it_says_is_sent_as_the_agents_words(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """PAP-7.8-01: never as the person's own words."""
    from personal_agent_protocol.demo.manzanita import ManzanitaAgent

    authors: list[str] = []
    respond = ManzanitaAgent.respond

    async def spy(self: Any, turn: Any) -> Any:
        authors.append(turn.author)
        return await respond(self, turn)

    monkeypatch.setattr(ManzanitaAgent, "respond", spy)
    _, _, _, said = await _journey(Surface(True), tmp_path)
    assert authors and set(authors) == {"agent"}
    # And the company's words come back with who wrote them (draft 0.3 §7.4).
    replies = [
        reply
        for answer in said
        if hasattr(answer, "replies")
        for reply in answer.replies
    ]
    assert replies and {reply.author for reply in replies} == {"agent"}
