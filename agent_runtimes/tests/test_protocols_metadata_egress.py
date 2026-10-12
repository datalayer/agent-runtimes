# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Merchant profiles, seller discovery and PACT cards read through the PAP SDK's single egress path (AGENT_PROTOCOLS PI-13).

A UCP business's ``/.well-known/ucp``, an Agentic Commerce seller's
``/.well-known/acp.json`` and a PACT Brand's Agent Card (with its OAuth
metadata and keys) are what a client reaches first: a name pointing
inside (a private, loopback, link-local or cluster address) is refused
before anything is sent, plain http is refused, a redirect is not followed,
and the body is bounded — by default, with nothing to configure.
"""

from __future__ import annotations

import httpx
import pytest
from personal_agent_protocol.errors import PersonalAgentProtocolError

from agent_runtimes.protocols.agentic_commerce import AgenticCommerceClient
from agent_runtimes.protocols.agentic_commerce.merchant import (
    discovery as seller_discovery,
)
from agent_runtimes.protocols.egress import MAX_METADATA_BYTES, metadata_fetch
from agent_runtimes.protocols.pact import PactPersonalAgent
from agent_runtimes.protocols.ucp import UcpClient
from agent_runtimes.protocols.ucp.client import UcpError

INSIDE = ["10.0.0.5", "127.0.0.1", "172.20.0.10", "10.96.0.1", "169.254.169.254"]
STORE = "https://store.example"
SELLER = "https://outfitters.example"


class Bearer:
    async def bearer(self, seller: str) -> str:
        return "test-bearer"


def _resolver(addresses: list[str]):
    async def resolve(host: str) -> list[str]:
        return addresses

    return resolve


def _answering(document: dict, sent: list[httpx.Request]):
    def answer(request: httpx.Request) -> httpx.Response:
        sent.append(request)
        if request.url.path.startswith("/moved/"):
            return httpx.Response(302, headers={"location": "https://10.0.0.5/"})
        if request.url.path.startswith("/big/"):
            return httpx.Response(200, content=b"x" * (MAX_METADATA_BYTES + 1))
        return httpx.Response(200, json=document)

    return answer


def _fetch(addresses: list[str], document: dict, sent: list[httpx.Request]):
    return metadata_fetch(
        accept="application/json",
        max_bytes=MAX_METADATA_BYTES,
        resolver=_resolver(addresses),
        transport=httpx.MockTransport(_answering(document, sent)),
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("address", INSIDE)
async def test_a_merchant_whose_name_points_inside_is_refused_unsent(
    address: str,
) -> None:
    sent: list[httpx.Request] = []
    ucp = UcpClient(
        business=STORE,
        agent_profile="https://agent.example/.well-known/ucp",
        metadata=_fetch([address], {}, sent),
    )
    with pytest.raises(PersonalAgentProtocolError) as refused:
        await ucp.discover()
    assert refused.value.code == "unsafe_address"
    acp = AgenticCommerceClient(
        seller=SELLER,
        credentials=Bearer(),
        metadata=_fetch([address], {}, sent),
    )
    with pytest.raises(PersonalAgentProtocolError) as refused:
        await acp.discover()
    assert refused.value.code == "unsafe_address"
    pact = PactPersonalAgent(
        card_url="https://air.example/a2a/.well-known/agent-card.json",
        issuer="https://agent.example",
        audience="https://provider.example/a2a",
        signer=None,
        delegations=None,
        receipts=None,
        metadata=_fetch([address], {}, sent),
    )
    with pytest.raises(PersonalAgentProtocolError) as refused:
        await pact.discover()
    assert refused.value.code == "unsafe_address"
    # Nothing reached anything: neither the profile nor a checkout after it.
    assert sent == []


@pytest.mark.asyncio
async def test_a_public_merchant_is_read_and_its_profile_checked() -> None:
    sent: list[httpx.Request] = []
    acp = AgenticCommerceClient(
        seller=SELLER,
        credentials=Bearer(),
        metadata=_fetch(["93.184.216.34"], seller_discovery(SELLER), sent),
    )
    found = await acp.discover()
    assert found.domain == "outfitters.example"
    assert [str(request.url) for request in sent] == [f"{SELLER}/.well-known/acp.json"]
    assert sent[0].headers["accept"] == "application/json"


@pytest.mark.asyncio
async def test_a_redirect_is_not_followed_and_a_large_profile_is_refused() -> None:
    sent: list[httpx.Request] = []
    moved = UcpClient(
        business=f"{STORE}/moved",
        agent_profile="https://agent.example/.well-known/ucp",
        metadata=_fetch(["93.184.216.34"], {}, sent),
    )
    # The profile's address answers 302: refused as an answer, never followed.
    with pytest.raises(UcpError, match="answered 302"):
        await moved.discover()
    assert len(sent) == 1
    big = UcpClient(
        business=f"{STORE}/big",
        agent_profile="https://agent.example/.well-known/ucp",
        metadata=_fetch(["93.184.216.34"], {}, sent),
    )
    with pytest.raises(PersonalAgentProtocolError) as too_large:
        await big.discover()
    assert too_large.value.code == "response_too_large"


@pytest.mark.asyncio
async def test_plain_http_is_refused() -> None:
    sent: list[httpx.Request] = []
    ucp = UcpClient(
        business="http://store.example",
        agent_profile="https://agent.example/.well-known/ucp",
        metadata=_fetch(["93.184.216.34"], {}, sent),
    )
    with pytest.raises(PersonalAgentProtocolError) as refused:
        await ucp.discover()
    assert refused.value.code == "unsafe_url"
    assert sent == []


def test_the_default_is_the_single_egress_path() -> None:
    # Constructed with nothing said, a client reads metadata through the SDK's
    # resolving client: its fetch is egress.metadata_fetch's, not its http client.
    ucp = UcpClient(business=STORE, agent_profile="https://agent.example/p")
    acp = AgenticCommerceClient(seller=SELLER, credentials=Bearer())
    pact = PactPersonalAgent(
        card_url="https://air.example/card",
        issuer="https://agent.example",
        audience="https://provider.example/a2a",
        signer=None,
        delegations=None,
        receipts=None,
    )
    for client in (ucp, acp, pact):
        assert client.metadata.__qualname__ == "metadata_fetch.<locals>.fetch"
