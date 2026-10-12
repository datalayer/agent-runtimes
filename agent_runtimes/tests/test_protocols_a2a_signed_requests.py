# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# ruff: noqa: F811 - `state` is test_apps_a2a's fixture, imported to be used by name.

"""An application's A2A route verifies agents that sign their requests (AGENT_PROTOCOLS PR-23)."""

from __future__ import annotations

from typing import Any

import pytest
from reactor import PluginManifest

from agent_runtimes.protocols import protocols_platform
from agent_runtimes.protocols.web_bot_auth import LocalSigner, PublicKey, sign_request
from agent_runtimes.protocols.web_bot_auth.plugin import DIRECTORY_DISCOVERIES
from agent_runtimes.tests.test_apps_a2a import (  # noqa: F401
    REMOTE,
    _client,
    served,
    state,
)

AGENT = "https://agent.example"
CARD = "http://runtime.test/.well-known/agent-card.json"


class _Discovery:
    """The agent's directory, as the host's egress would read it."""

    def __init__(self, signer: LocalSigner) -> None:
        self.signer = signer

    async def keys(self, agent: str, now: int) -> list[PublicKey]:
        assert agent == AGENT
        return [PublicKey.from_jwk(self.signer.public_jwk)]


class _Host:
    def __init__(self, discovery: _Discovery) -> None:
        self.discovery = discovery

    def provide_contributions(self, contributions: Any) -> None:
        contributions.contribute(
            DIRECTORY_DISCOVERIES, self.discovery, contribution_id="test", order=10
        )


@pytest.fixture
def signer() -> Any:
    signer = LocalSigner.generate()
    platform = protocols_platform()
    platform.register_plugin(
        PluginManifest(name="test-agent-directory", version="1"),
        _Host(_Discovery(signer)),
    )
    try:
        yield signer
    finally:
        platform.unregister_plugin("test-agent-directory")


@pytest.mark.asyncio
async def test_a_signed_request_is_verified_and_a_replay_refused(
    state: Any, signer: Any
) -> None:
    async with served(state) as (app, _), _client(app, REMOTE) as client:
        assert (await client.get("/.well-known/agent-card.json")).status_code == 200
        signed = (
            await sign_request(method="GET", url=CARD, signer=signer, agent=AGENT)
        ).as_dict()
        assert (
            await client.get("/.well-known/agent-card.json", headers=signed)
        ).status_code == 200
        replay = await client.get("/.well-known/agent-card.json", headers=signed)
        assert replay.status_code == 401
        assert "nonce" in replay.json()["detail"]


@pytest.mark.asyncio
async def test_a_signature_that_does_not_hold_is_refused(
    state: Any, signer: Any
) -> None:
    async with served(state) as (app, _), _client(app, REMOTE) as client:
        signed = (
            await sign_request(
                method="GET",
                url="http://elsewhere.test/.well-known/agent-card.json",
                signer=signer,
                agent=AGENT,
            )
        ).as_dict()
        refused = await client.get("/.well-known/agent-card.json", headers=signed)
        assert refused.status_code == 401
        stranger = (
            await sign_request(
                method="GET", url=CARD, signer=LocalSigner.generate(), agent=AGENT
            )
        ).as_dict()
        # A key the agent does not publish: unverified, not refused — the gate decides.
        assert (
            await client.get("/.well-known/agent-card.json", headers=stranger)
        ).status_code == 200
