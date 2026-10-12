# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Key directories fetched through the PAP SDK's single egress path (AGENT_PROTOCOLS PI-13).

A ``Signature-Agent`` names a URL a verifier then fetches: a name pointing
inside (a private, loopback, link-local or cluster address) is refused before
anything is sent, a redirect is not followed, and the body is bounded.
"""

from __future__ import annotations

import json

import httpx
import pytest
from personal_agent_protocol.errors import PersonalAgentProtocolError

from agent_runtimes.protocols.web_bot_auth.verify import (
    MAX_DIRECTORY_BYTES,
    JwksUriDiscovery,
    resolving_fetch,
)

JWKS = {"keys": []}
INSIDE = ["10.0.0.5", "127.0.0.1", "172.20.0.10", "10.96.0.1", "169.254.169.254"]


def _resolver(addresses: list[str]):
    async def resolve(host: str) -> list[str]:
        return addresses

    return resolve


@pytest.mark.asyncio
@pytest.mark.parametrize("address", INSIDE)
async def test_a_directory_whose_name_points_inside_is_refused_unsent(
    address: str,
) -> None:
    sent: list[httpx.Request] = []

    def answer(request: httpx.Request) -> httpx.Response:
        sent.append(request)
        return httpx.Response(200, json=JWKS)

    fetch = resolving_fetch(
        resolver=_resolver([address]), transport=httpx.MockTransport(answer)
    )
    with pytest.raises(PersonalAgentProtocolError) as refused:
        await fetch("https://agent.example/jwks.json")
    assert refused.value.code == "unsafe_address"
    assert sent == []
    # As a discovery: no key is read, so the request stays unverified.
    with pytest.raises(PersonalAgentProtocolError):
        await JwksUriDiscovery(fetch).keys("https://agent.example/jwks.json", 0)
    assert sent == []


@pytest.mark.asyncio
async def test_a_public_directory_is_fetched_and_bounded() -> None:
    def answer(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/big.json":
            return httpx.Response(200, content=b"x" * (MAX_DIRECTORY_BYTES + 1))
        if request.url.path == "/moved.json":
            return httpx.Response(
                302, headers={"location": "https://10.0.0.5/jwks.json"}
            )
        return httpx.Response(200, json=JWKS)

    fetch = resolving_fetch(
        resolver=_resolver(["93.184.216.34"]), transport=httpx.MockTransport(answer)
    )
    status, _, body = await fetch("https://agent.example/jwks.json")
    assert (status, json.loads(body)) == (200, JWKS)
    # A redirect is answered as it is, never followed.
    status, _, _ = await fetch("https://agent.example/moved.json")
    assert status == 302
    with pytest.raises(PersonalAgentProtocolError) as too_large:
        await fetch("https://agent.example/big.json")
    assert too_large.value.code == "response_too_large"


@pytest.mark.asyncio
async def test_plain_http_is_refused() -> None:
    fetch = resolving_fetch(
        resolver=_resolver(["93.184.216.34"]),
        transport=httpx.MockTransport(lambda r: httpx.Response(200)),
    )
    with pytest.raises(PersonalAgentProtocolError) as refused:
        await fetch("http://agent.example/jwks.json")
    assert refused.value.code == "unsafe_url"
