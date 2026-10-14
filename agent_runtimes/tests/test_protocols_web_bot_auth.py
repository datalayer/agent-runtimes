# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Web Bot Auth against the draft's vectors, and end to end (AGENT_PROTOCOLS PR-20 to PR-23, PR-51, PR-53)."""

from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest

from agent_runtimes.protocols.web_bot_auth import (
    DIRECTORY_PATH,
    DirectoryResolver,
    InMemoryNonceStore,
    LocalSigner,
    Message,
    WebBotAuth,
    WebBotAuthMiddleware,
    directory_body,
    jwk_thumbprint,
    sign_directory_response,
    sign_request,
    verify_directory_response,
    verify_request,
)
from agent_runtimes.protocols.web_bot_auth.signature import (
    parse_signatures,
    signature_base,
)

FIXTURES = json.loads(
    (
        Path(__file__).parents[1]
        / "protocols"
        / "web_bot_auth"
        / "fixtures"
        / "vectors.json"
    ).read_text()
)
KEY = FIXTURES["key"]
PUBLIC = {name: KEY[name] for name in ("kty", "crv", "x")}
NOW = 1735689700


def test_thumbprint_is_the_keyid():
    assert jwk_thumbprint(PUBLIC) == FIXTURES["keyid"]
    assert LocalSigner.from_jwk(KEY).keyid == FIXTURES["keyid"]


@pytest.mark.parametrize("vector", FIXTURES["vectors"], ids=lambda v: v["id"])
def test_signature_base_of_each_vector(vector):
    _, params, _ = parse_signatures(vector["signatureInput"], vector["signature"])[0]
    message = Message(
        method=vector["method"], url=vector["url"], headers=vector["headers"]
    )
    assert signature_base(params, message).decode() == vector["base"]


@pytest.mark.asyncio
async def test_signing_reproduces_e21_byte_for_byte():
    vector = FIXTURES["vectors"][0]
    signed = await sign_request(
        method="GET",
        url=vector["url"],
        signer=LocalSigner.from_jwk(KEY),
        agent="https://signature-agent.test",
        label="agent2",
        components=("@authority",),
        created=vector["created"],
        expires=vector["expires"],
        nonce=vector["nonce"],
        max_lifetime=None,
    )
    # The draft labels the signature sig2 and the member agent2; this
    # signer gives both one label, so compare the base and the bytes.
    base = vector["base"]
    assert signed.base.decode() == base
    assert signed.signature.split("=", 1)[1] == vector["signature"].split("=", 1)[1]


class _Fetch:
    """A directory served from memory, as the network would."""

    def __init__(self, responses):
        self.responses = responses
        self.calls = []

    async def __call__(self, url):
        self.calls.append(url)
        if url not in self.responses:
            return 404, {}, b""
        return self.responses[url]


def _vector_directory():
    directory = FIXTURES["directory"]
    return {
        directory["url"]: (
            200,
            {
                "Content-Digest": directory["contentDigest"],
                "Signature-Input": directory["signatureInput"],
                "Signature": directory["signature"],
            },
            directory["body"].encode(),
        )
    }


def test_signed_directory_response_e23():
    directory = FIXTURES["directory"]
    _, headers, body = _vector_directory()[directory["url"]]
    keys = verify_directory_response(
        body=body, headers=headers, authority_url=directory["url"], now=NOW
    )
    assert [key.keyid for key in keys] == [FIXTURES["keyid"]]
    with pytest.raises(ValueError, match="Content-Digest"):
        verify_directory_response(
            body=body + b" ", headers=headers, authority_url=directory["url"], now=NOW
        )
    with pytest.raises(ValueError, match="no key"):
        verify_directory_response(
            body=body,
            headers=headers,
            authority_url="https://elsewhere.test" + DIRECTORY_PATH,
            now=NOW,
        )


@pytest.mark.asyncio
async def test_signing_the_directory_reproduces_e23():
    directory = FIXTURES["directory"]
    signed = await sign_directory_response(
        body=directory["body"].encode(),
        authority_url=directory["url"],
        signers=[LocalSigner.from_jwk(KEY)],
        created=directory["created"],
        expires=directory["expires"],
    )
    assert signed.headers["Content-Digest"] == directory["contentDigest"]
    assert signed.headers["Signature-Input"] == directory["signatureInput"]
    assert signed.headers["Signature"] == directory["signature"]


@pytest.mark.asyncio
@pytest.mark.parametrize("vector", FIXTURES["vectors"], ids=lambda v: v["id"])
async def test_verifying_each_vector(vector):
    resolver = DirectoryResolver.with_fetch(_Fetch(_vector_directory()))
    headers = {
        **vector["headers"],
        "Signature-Input": vector["signatureInput"],
        "Signature": vector["signature"],
    }
    result = await verify_request(
        method="GET", url=vector["url"], headers=headers, resolver=resolver, now=NOW
    )
    if vector["id"] == "E.2.1":
        assert result.outcome == "verified", result.reason
        assert result.agent == "https://signature-agent.test"
        assert result.keyid == FIXTURES["keyid"]
    else:
        # The legacy sf-string form names no member: a verifier MAY accept
        # it; this one does not attribute a request it cannot bind.
        assert result.outcome == "invalid"


@pytest.mark.asyncio
async def test_tampering_expiry_replay_and_unsigned():
    vector = FIXTURES["vectors"][0]
    headers = {
        **vector["headers"],
        "Signature-Input": vector["signatureInput"],
        "Signature": vector["signature"],
    }
    resolver = DirectoryResolver.with_fetch(_Fetch(_vector_directory()))
    other = await verify_request(
        method="GET",
        url="https://example.org/",
        headers=headers,
        resolver=resolver,
        now=NOW,
    )
    assert other.outcome == "invalid"
    late = await verify_request(
        method="GET",
        url=vector["url"],
        headers=headers,
        resolver=resolver,
        now=4889289600 + 3600,
    )
    assert (late.outcome, late.reason) == ("invalid", "the signature has expired")
    future = await verify_request(
        method="GET",
        url=vector["url"],
        headers=headers,
        resolver=resolver,
        now=1735689600 - 3600,
    )
    assert future.outcome == "invalid"
    store = InMemoryNonceStore()
    # The vector's expiry is far away; its nonce is remembered until then.
    first = await verify_request(
        method="GET",
        url=vector["url"],
        headers=headers,
        resolver=resolver,
        nonce_store=store,
        now=NOW,
    )
    again = await verify_request(
        method="GET",
        url=vector["url"],
        headers=headers,
        resolver=resolver,
        nonce_store=store,
        now=NOW,
    )
    assert (first.outcome, again.outcome) == ("verified", "invalid")
    assert again.reason == "the nonce was seen before"
    unsigned = await verify_request(
        method="GET", url=vector["url"], headers={}, resolver=resolver, now=NOW
    )
    assert unsigned.outcome == "unverified"


@pytest.mark.asyncio
async def test_unknown_key_and_unreachable_directory_are_unverified():
    vector = FIXTURES["vectors"][0]
    headers = {
        **vector["headers"],
        "Signature-Input": vector["signatureInput"],
        "Signature": vector["signature"],
    }
    fetch = _Fetch({})
    resolver = DirectoryResolver.with_fetch(fetch)
    result = await verify_request(
        method="GET", url=vector["url"], headers=headers, resolver=resolver, now=NOW
    )
    assert result.outcome == "unverified"
    # A failed fetch is not asked again within five minutes.
    await verify_request(
        method="GET",
        url=vector["url"],
        headers=headers,
        resolver=resolver,
        now=NOW + 10,
    )
    assert len(fetch.calls) == 1


@pytest.mark.asyncio
async def test_directory_on_a_private_address_is_refused():
    resolver = DirectoryResolver.with_fetch(_Fetch({}))
    with pytest.raises(PermissionError, match="private"):
        await resolver.keys("https://10.0.0.1", "directory", NOW)
    with pytest.raises(PermissionError, match="https"):
        await resolver.keys("http://agent.test", "directory", NOW)
    # A type with no discovery contributed (cimd, by default) answers nothing.
    assert await resolver.keys("https://agent.test/cimd.json", "cimd", NOW) is None


def _agent_app(signers):
    """The agent's own origin: its key directory, signed."""
    from starlette.applications import Starlette
    from starlette.responses import Response
    from starlette.routing import Route

    async def directory(request):
        body = directory_body([signer.public_jwk for signer in signers])
        signed = await sign_directory_response(
            body=body, authority_url=str(request.url), signers=signers
        )
        return Response(signed.body, headers=signed.headers)

    return Starlette(routes=[Route(DIRECTORY_PATH, directory)])


def _business_app(resolver):
    """A business that answers differently to a verified agent."""
    from starlette.applications import Starlette
    from starlette.responses import JSONResponse
    from starlette.routing import Route

    async def products(request):
        result = request.scope["state"]["web_bot_auth"]
        return JSONResponse({"outcome": result.outcome, "agent": result.agent})

    app = Starlette(routes=[Route("/products", products, methods=["GET", "POST"])])
    return WebBotAuthMiddleware(app, resolver=resolver)


@pytest.mark.asyncio
@pytest.mark.parametrize("algorithm", ["ed25519", "ecdsa-p256-sha256"])
async def test_end_to_end_with_rotation(algorithm):
    old, new = LocalSigner.generate(algorithm), LocalSigner.generate(algorithm)
    agent = httpx.AsyncClient(transport=httpx.ASGITransport(app=_agent_app([old, new])))

    async def fetch(url):
        response = await agent.get(url)
        return response.status_code, dict(response.headers), response.content

    business = _business_app(DirectoryResolver.with_fetch(fetch))
    for signer in (old, new):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=business),
            base_url="https://shop.test",
            auth=WebBotAuth(signer, agent="https://agent.test"),
        ) as client:
            answer = (await client.post("/products?q=tea", content=b'{"n":1}')).json()
            assert answer == {"outcome": "verified", "agent": "https://agent.test"}
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=business), base_url="https://shop.test"
    ) as client:
        assert (await client.get("/products")).json()["outcome"] == "unverified"
    stranger = LocalSigner.generate(algorithm)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=business),
        base_url="https://shop.test",
        auth=WebBotAuth(stranger, agent="https://agent.test"),
    ) as client:
        assert (await client.get("/products")).json()["outcome"] == "unverified"


@pytest.mark.asyncio
async def test_a_key_rotated_after_the_directory_was_cached_is_read_again():
    """An agent's rotated key signs at once (a Datalayer application's owner's Rotate): a
    verifier holding its directory reads it again for a keyid it does not list, no sooner
    than ten seconds after its last read, and keeps a known key's directory cached."""
    import time

    old, new, stranger = (LocalSigner.generate() for _ in range(3))
    published = [old]
    agent = httpx.AsyncClient(transport=httpx.ASGITransport(app=_agent_app(published)))
    calls = []

    async def fetch(url):
        calls.append(url)
        response = await agent.get(url)
        return response.status_code, dict(response.headers), response.content

    resolver = DirectoryResolver.with_fetch(fetch)
    url = "https://shop.test/products"

    async def outcome(signer, at):
        signed = await sign_request(
            method="GET", url=url, signer=signer, agent="https://agent.test", created=at
        )
        found = await verify_request(
            method="GET", url=url, headers=signed.as_dict(), resolver=resolver, now=at
        )
        return found.outcome, found.reason

    t = int(time.time())
    assert (await outcome(old, t))[0] == "verified"
    assert len(calls) == 1
    published.append(new)  # rotated: the new key signs from now
    assert (await outcome(new, t + 11))[0] == "verified"
    assert len(calls) == 2
    # A keyid nobody published: read again at most once in ten seconds.
    assert (await outcome(stranger, t + 12)) == (
        "unverified",
        "the key is not in the agent's directory",
    )
    assert (await outcome(stranger, t + 20))[0] == "unverified"
    assert len(calls) == 2
    assert (await outcome(stranger, t + 21))[0] == "unverified"
    assert len(calls) == 3
    # Known keys are answered from the cache.
    assert (await outcome(old, t + 22))[0] == "verified"
    assert (await outcome(new, t + 60))[0] == "verified"
    assert len(calls) == 3


@pytest.mark.asyncio
async def test_a_body_is_bound_by_its_digest():
    signer = LocalSigner.generate()
    signed = await sign_request(
        method="POST",
        url="https://shop.test/checkout",
        body=b'{"amount":10}',
        signer=signer,
        agent="https://agent.test",
    )
    resolver = DirectoryResolver.with_fetch(
        _Fetch(
            {
                "https://agent.test" + DIRECTORY_PATH: (
                    200,
                    (
                        await sign_directory_response(
                            body=directory_body([signer.public_jwk]),
                            authority_url="https://agent.test" + DIRECTORY_PATH,
                            signers=[signer],
                        )
                    ).headers,
                    directory_body([signer.public_jwk]),
                )
            }
        )
    )
    headers = signed.as_dict()
    good = await verify_request(
        method="POST",
        url="https://shop.test/checkout",
        headers=headers,
        body=b'{"amount":10}',
        resolver=resolver,
    )
    bad = await verify_request(
        method="POST",
        url="https://shop.test/checkout",
        headers=headers,
        body=b'{"amount":99}',
        resolver=resolver,
    )
    assert (good.outcome, bad.outcome) == ("verified", "invalid")


@pytest.mark.asyncio
async def test_no_key_material_in_what_is_sent_or_published():
    """PR-53: a private key never reaches a header, a directory or a log line."""
    signer = LocalSigner.from_jwk(KEY)
    signed = await sign_request(
        method="GET",
        url="https://shop.test/",
        signer=signer,
        agent="https://agent.test",
    )
    published = directory_body([signer.public_jwk]).decode()
    for text in (
        *signed.as_dict().values(),
        published,
        repr(signer),
        str(signer.public_jwk),
    ):
        assert KEY["d"] not in text
    with pytest.raises(ValueError, match="public keys only"):
        directory_body([KEY])


def test_sync_client_is_refused():
    with httpx.Client(
        auth=WebBotAuth(LocalSigner.generate(), agent="https://a.test")
    ) as client:
        with pytest.raises(RuntimeError, match="AsyncClient"):
            client.get("https://shop.test/")


@pytest.mark.asyncio
async def test_one_key_two_languages():
    """EX-01, PR-51: the headers TypeScript signs (vitest checks it signs these) verify here."""
    from agent_runtimes.protocols.web_bot_auth import PublicKey

    cross = FIXTURES["cross"]
    signed = await sign_request(
        method=cross["method"],
        url=cross["url"],
        signer=LocalSigner.from_jwk(KEY),
        agent=cross["agent"],
        label=cross["label"],
        created=cross["created"],
        expires=cross["expires"],
        nonce=cross["nonce"],
    )
    assert signed.as_dict() == cross["headers"]

    class Directory:
        async def keys(self, agent, now):
            assert agent == cross["agent"]
            return [PublicKey.from_jwk(PUBLIC)]

    result = await verify_request(
        method=cross["method"],
        url=cross["url"],
        headers=cross["headers"],
        resolver=DirectoryResolver(discoveries={"directory": Directory()}),
        now=cross["created"] + 10,
    )
    assert result.outcome == "verified", result.reason
