# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""No protocol secret in a log line or a URL (AGENT_PROTOCOLS PR-53).

Each protocol's own test checks that its secret is not in what an agent sees
(a summary, a proposal, a reply, a card, a directory). This one runs each
protocol's whole journey with every logger at DEBUG and every request's URL
recorded, and checks that the secret is in neither: the payment token (UCP,
ACP), the seller's bearer (ACP), the device code, the user code and the
delegation token (PACT), the private key (Web Bot Auth). MCP's and A2A's
credentials are held to the same by ``test_credentials_never_shown.py`` and
``test_delegated_credential.py``; PAP's by ``test_protocols_pap_and_pact.py``
and the PAP SDK's own security tests.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
import pytest

from agent_runtimes.protocols import build_protocols_reactor
from agent_runtimes.protocols.agentic_commerce.merchant import (
    TEST_BEARER,
    ExampleOutfitters,
)
from agent_runtimes.protocols.agentic_commerce.plugin import (
    approver_of,
    payment_data_of,
)
from agent_runtimes.protocols.agentic_commerce.plugin import (
    proposal_store_of as acp_proposals,
)
from agent_runtimes.protocols.pact.plugin import delegation_store_of
from agent_runtimes.protocols.ucp.merchant import ExampleStore
from agent_runtimes.protocols.ucp.plugin import proposal_store_of as ucp_proposals
from agent_runtimes.protocols.web_bot_auth import (
    DirectoryResolver,
    LocalSigner,
    WebBotAuth,
)
from agent_runtimes.tests import (
    test_protocols_agentic_commerce as acp,
)
from agent_runtimes.tests import (
    test_protocols_pact as pact,
)
from agent_runtimes.tests import (
    test_protocols_ucp as ucp,
)
from agent_runtimes.tests import (
    test_protocols_web_bot_auth as wba,
)


class Seen:
    """Every log line and every URL requested while a journey runs."""

    def __init__(self, caplog: pytest.LogCaptureFixture) -> None:
        self.caplog = caplog
        self.urls: list[str] = []
        caplog.set_level(logging.DEBUG)

    def watch(self, http: httpx.AsyncClient) -> httpx.AsyncClient:
        async def record(request: httpx.Request) -> None:
            self.urls.append(str(request.url))

        http.event_hooks["request"].append(record)
        return http

    def assert_holds_none_of(self, *secrets: str) -> None:
        assert self.urls, "the journey made no request"
        assert self.caplog.records, "nothing was logged: the check would prove nothing"
        lines = [record.getMessage() for record in self.caplog.records]
        for secret in secrets:
            assert secret
            assert not [line for line in lines if secret in line]
            assert not [url for url in self.urls if secret in url]


@pytest.fixture
def seen(caplog: pytest.LogCaptureFixture) -> Seen:
    return Seen(caplog)


@pytest.mark.asyncio
async def test_ucp_the_payment_token(seen: Seen) -> None:
    client = ucp._client(ExampleStore())
    seen.watch(client.http)
    logging.getLogger("agent_runtimes.protocols.ucp").debug("journey starts")
    checkout = await ucp._ready(client)
    proposal = await client.propose_completion(checkout["id"])
    await client.complete(
        proposal,
        approver=ucp.Person(),
        instruments=ucp.Custody(),
        store=ucp_proposals(build_protocols_reactor()),
    )
    seen.assert_holds_none_of(ucp.TOKEN)


@pytest.mark.asyncio
async def test_acp_the_payment_token_and_the_bearer(seen: Seen) -> None:
    platform = acp._platform(acp.Person())
    client = acp._client(ExampleOutfitters(), platform)
    seen.watch(client.http)
    logging.getLogger("agent_runtimes.protocols.agentic_commerce").debug("starts")
    session = await acp._ready(client)
    proposal = await client.propose_completion(session["id"])
    await client.complete(
        proposal,
        approver=approver_of(platform),
        payment=payment_data_of(platform),
        store=acp_proposals(platform),
    )
    seen.assert_holds_none_of(acp.TOKEN, TEST_BEARER)


@pytest.mark.asyncio
async def test_pact_the_codes_and_the_delegation_token(seen: Seen) -> None:
    provider, _, platform, agent = pact._setup()
    seen.watch(agent.http)
    logging.getLogger("agent_runtimes.protocols.pact").debug("journey starts")
    sign_in = await agent.request_sign_in(pact.USER, ["bookings:read"])
    device_code = agent._pending[sign_in.reference]
    provider.approve(sign_in.user_code, "jane-4471", ["bookings:read"])
    await agent.finish_sign_in(pact.USER, sign_in, interval=0)
    token, _ = await delegation_store_of(platform).get(
        agent.card.interface_url, pact.USER
    )
    await agent.send(pact.USER, "When is my booking?")
    # The user code is the person's to type at the Brand: shown to them, never logged.
    seen.assert_holds_none_of(device_code, token)
    lines = [record.getMessage() for record in seen.caplog.records]
    assert not [line for line in lines if sign_in.user_code in line]


@pytest.mark.asyncio
async def test_web_bot_auth_the_private_key(seen: Seen) -> None:
    signer = LocalSigner.from_jwk(wba.KEY)
    agent = seen.watch(
        httpx.AsyncClient(transport=httpx.ASGITransport(app=wba._agent_app([signer])))
    )

    async def fetch(url: str) -> Any:
        response = await agent.get(url)
        return response.status_code, dict(response.headers), response.content

    business = wba._business_app(DirectoryResolver.with_fetch(fetch))
    logging.getLogger("agent_runtimes.protocols.web_bot_auth").debug("starts")
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=business),
        base_url="https://shop.test",
        auth=WebBotAuth(signer, agent="https://agent.test"),
    ) as client:
        seen.watch(client)
        answer = (await client.get("/products?q=tea")).json()
    assert answer["outcome"] == "verified"
    seen.assert_holds_none_of(wba.KEY["d"])
