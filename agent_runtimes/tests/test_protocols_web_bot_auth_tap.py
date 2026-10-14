# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Visa's Trusted Agent Protocol, the draft profile over Web Bot Auth (AGENT_PROTOCOLS PR-24).

``fixtures/tap.json`` holds the vectors computed here and reproduced byte
for byte by the TypeScript ``tap.unit.test.ts`` (Cloudflare's
``http-message-sig``): the same key, the same bytes.

Launch the tests:
```
$ pytest agent_runtimes/tests/test_protocols_web_bot_auth_tap.py -v
```
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import pytest

from agent_runtimes.protocols.web_bot_auth.keys import LocalSigner, PublicKey
from agent_runtimes.protocols.web_bot_auth.tap import (
    MAX_WINDOW_SECONDS,
    STATUS,
    sign_tap_request,
    verify_tap_request,
)
from agent_runtimes.protocols.web_bot_auth.verify import InMemoryNonceStore

FIXTURES = Path(__file__).parents[1] / "protocols" / "web_bot_auth" / "fixtures"
TAP = json.loads((FIXTURES / "tap.json").read_text())
VECTORS = json.loads((FIXTURES / "vectors.json").read_text())
SIGNER = LocalSigner.from_jwk(VECTORS["key"])
KEYS = {SIGNER.keyid: PublicKey.from_jwk(SIGNER.public_jwk)}


class _Remembering(InMemoryNonceStore):
    """Remembers past the real clock, for vectors signed in 2025."""

    async def check_and_record(self, scope: str, nonce: str, until: int) -> bool:
        return await super().check_and_record(scope, nonce, until + 10**10)


def _headers(vector: dict) -> dict[str, str]:
    return {
        "Signature-Input": vector["signatureInput"],
        "Signature": vector["signature"],
    }


def test_the_profile_is_a_draft() -> None:
    assert STATUS == TAP["status"] == "draft"


@pytest.mark.asyncio
@pytest.mark.parametrize("vector", TAP["vectors"], ids=lambda v: v["intent"])
async def test_each_vector_is_reproduced_byte_for_byte(vector: dict) -> None:
    assert SIGNER.keyid == TAP["keyid"]
    signed = await sign_tap_request(
        method=vector["method"],
        url=vector["url"],
        signer=SIGNER,
        intent=vector["intent"],
        label=vector["label"],
        created=vector["created"],
        lifetime=vector["expires"] - vector["created"],
        nonce=vector["nonce"],
    )
    assert signed.base.decode() == vector["base"]
    assert signed.signature_input == vector["signatureInput"]
    assert signed.signature == vector["signature"]


@pytest.mark.asyncio
@pytest.mark.parametrize("vector", TAP["vectors"], ids=lambda v: v["intent"])
async def test_each_vector_verifies_and_says_what_the_agent_does(vector: dict) -> None:
    found = await verify_tap_request(
        method=vector["method"],
        url=vector["url"],
        headers=_headers(vector),
        keys=KEYS,
        nonce_store=_Remembering(),
        now=vector["created"] + 1,
    )
    assert found.verified, found.reason
    assert found.intent == vector["intent"]
    assert found.keyid == TAP["keyid"]


@pytest.mark.asyncio
async def test_a_nonce_seen_in_the_window_is_a_replay() -> None:
    store = _Remembering()
    browse, pay = TAP["vectors"]
    now = browse["created"] + 1
    first = await verify_tap_request(
        method=browse["method"],
        url=browse["url"],
        headers=_headers(browse),
        keys=KEYS,
        nonce_store=store,
        now=now,
    )
    again = await verify_tap_request(
        method=pay["method"],
        url=pay["url"],
        headers=_headers(pay),
        keys=KEYS,
        nonce_store=store,
        now=now,
    )
    assert first.verified
    assert (again.verified, again.reason) == (False, "the nonce was seen before")


@pytest.mark.asyncio
async def test_what_the_profile_does_not_allow_is_refused() -> None:
    browse = TAP["vectors"][0]
    store = _Remembering()

    async def check(**changes):
        asked = {
            "method": browse["method"],
            "url": browse["url"],
            "headers": _headers(browse),
            "keys": KEYS,
            "nonce_store": store,
            "now": browse["created"] + 1,
            **changes,
        }
        return (await verify_tap_request(**asked)).reason

    assert await check(now=browse["expires"]) == "the signature is not current"
    assert await check(keys={}) == "the key is not known"
    assert (
        await check(url="https://www.example.com/elsewhere")
        == "the signature does not hold"
    )
    assert await check(headers={}) == "the request is not signed"
    untagged = {
        "Signature-Input": browse["signatureInput"].replace(
            "agent-browser-auth", "web-bot-auth"
        ),
        "Signature": browse["signature"],
    }
    assert await check(headers=untagged) == "no signature carries a TAP tag"
    long = await sign_tap_request(
        method="GET",
        url=browse["url"],
        signer=SIGNER,
        intent="browse",
        created=browse["created"],
        lifetime=MAX_WINDOW_SECONDS,
        nonce="n",
    )
    stretched = {
        "Signature-Input": long.signature_input.replace(
            f"expires={browse['created'] + MAX_WINDOW_SECONDS}",
            f"expires={browse['created'] + 3600}",
        ),
        "Signature": long.signature,
    }
    assert (
        await check(headers=stretched)
        == "created and expires are more than 8 minutes apart"
    )
    with pytest.raises(ValueError, match="at most 480s"):
        await sign_tap_request(
            method="GET",
            url=browse["url"],
            signer=SIGNER,
            intent="browse",
            lifetime=MAX_WINDOW_SECONDS + 1,
        )
    with pytest.raises(ValueError, match="covers @path"):
        await sign_tap_request(
            method="GET",
            url=browse["url"],
            signer=SIGNER,
            intent="browse",
            components=("@authority",),
        )
    with pytest.raises(ValueError, match="Ed25519"):
        await sign_tap_request(
            method="GET",
            url=browse["url"],
            signer=LocalSigner.generate("ecdsa-p256-sha256"),
            intent="browse",
        )


@pytest.mark.asyncio
async def test_a_fresh_signature_verifies_now() -> None:
    signed = await sign_tap_request(
        method="GET", url="https://shop.example/p/1", signer=SIGNER, intent="pay"
    )
    found = await verify_tap_request(
        method="GET",
        url="https://shop.example/p/1",
        headers=signed.as_dict(),
        keys=KEYS,
        nonce_store=InMemoryNonceStore(),
    )
    assert (found.verified, found.intent) == (True, "pay")
    assert int(time.time()) < int(
        signed.signature_input.split("expires=")[1].split(";")[0]
    )
