# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Signing an agent's outbound requests (AGENT_PROTOCOLS PR-21).

Three headers on every request, as ``draft-ietf-webbotauth-httpsig-protocol-00``
says them: ``Signature-Agent`` (a Dictionary: where the key directory is),
``Signature-Input`` and ``Signature``, the signature covering at least
``@authority`` and the ``Signature-Agent`` member, with ``created``,
``expires``, ``keyid`` and ``tag="web-bot-auth"``.

What is covered by default is narrower than the draft's minimum, as its
§5.2 advises: the method, the authority, the path and query, and — when the
request has a body — its ``Content-Digest``. A signature lives one minute
unless told otherwise.
"""

from __future__ import annotations

import base64
import os
import time
from dataclasses import dataclass
from typing import Any, AsyncGenerator, Generator, Mapping, Sequence

import httpx

from .keys import HttpSigner
from .signature import (
    Component,
    Message,
    SignatureParams,
    components_of,
    content_digest,
    serialize_signature,
    serialize_signature_input,
    signature_base,
)

#: The tag a Web Bot Auth signature carries.
TAG = "web-bot-auth"
#: The header naming the key directory.
SIGNATURE_AGENT = "Signature-Agent"
#: Where an agent's key directory is served.
DIRECTORY_PATH = "/.well-known/http-message-signatures-directory"
#: Its media type.
DIRECTORY_MEDIA_TYPE = "application/http-message-signatures-directory+json"
#: The discovery types of a ``Signature-Agent`` member.
DISCOVERY_TYPES = ("directory", "jwks_uri", "cimd")
#: The draft's recommended ceiling on a signature's life.
MAX_LIFETIME_SECONDS = 24 * 60 * 60


def generate_nonce() -> str:
    """64 random bytes, base64 (the draft's reference implementations' size)."""
    return base64.b64encode(os.urandom(64)).decode()


@dataclass(frozen=True)
class SignedHeaders:
    """The headers a signed request carries, and what was signed."""

    signature_agent: str
    signature_input: str
    signature: str
    content_digest: str | None
    base: bytes

    def as_dict(self) -> dict[str, str]:
        headers = {
            SIGNATURE_AGENT: self.signature_agent,
            "Signature-Input": self.signature_input,
            "Signature": self.signature,
        }
        if self.content_digest is not None:
            headers["Content-Digest"] = self.content_digest
        return headers


def signature_agent_member(label: str, uri: str, discovery: str = "directory") -> str:
    """One ``Signature-Agent`` member: ``label="https://…"``, its type when not a directory."""
    if not uri.startswith("https://"):
        raise ValueError("a Signature-Agent is an https URI")
    if discovery not in DISCOVERY_TYPES:
        raise ValueError(
            f"discovery type `{discovery}` is not one of {DISCOVERY_TYPES}"
        )
    member = f'{label}="{uri}"'
    return member if discovery == "directory" else f"{member};type={discovery}"


async def sign_request(
    *,
    method: str,
    url: str,
    headers: Mapping[str, str] | None = None,
    body: bytes | None = None,
    signer: HttpSigner,
    agent: str,
    discovery: str = "directory",
    label: str = "sig1",
    components: Sequence[str] = ("@method", "@authority", "@path", "@query"),
    created: int | None = None,
    lifetime: int = 60,
    expires: int | None = None,
    nonce: str | None = None,
    max_lifetime: int | None = MAX_LIFETIME_SECONDS,
) -> SignedHeaders:
    """Sign one request.

    Parameters
    ----------
    method, url, headers, body
        The request as it will be sent. A body is covered through its
        ``Content-Digest``, added here.
    signer
        The host's signer (``protocols.httpSigner``): its ``keyid`` is the
        key's thumbprint.
    agent
        Where the key directory is: the agent's origin (``directory``), or a
        JWKS (``jwks_uri``) or client metadata document (``cimd``) URL.
    label
        The signature's label; the ``Signature-Agent`` member has the same.
    components
        Covered besides the ``Signature-Agent`` member (always covered).
    created, lifetime, expires, nonce
        ``created`` defaults to now; ``expires`` to ``created + lifetime``.
        A nonce is generated unless given.
    max_lifetime
        The longest life allowed, 24 hours by default as the draft
        recommends; ``None`` for none (its test vectors expire in 2124).
    """
    if signer.algorithm not in ("ed25519", "ecdsa-p256-sha256"):
        raise ValueError(f"algorithm `{signer.algorithm}` is not supported")
    created = int(time.time()) if created is None else created
    expires = created + lifetime if expires is None else expires
    if expires <= created:
        raise ValueError("a signature expires after it is created")
    if max_lifetime is not None and expires - created > max_lifetime:
        raise ValueError(
            f"the signature would live {expires - created}s, more than {max_lifetime}s "
            "(the draft recommends at most 24 hours)"
        )
    all_headers = dict(headers or {})
    digest = None
    covered = list(components_of(components))
    if body:
        digest = content_digest(body)
        all_headers["Content-Digest"] = digest
        covered.append(Component(name="content-digest"))
    agent_header = signature_agent_member(label, agent, discovery)
    all_headers[SIGNATURE_AGENT] = agent_header
    covered.append(Component(name="signature-agent", params=(("key", label),)))
    params = SignatureParams(
        components=tuple(covered),
        params=(
            ("created", created),
            ("keyid", signer.keyid),
            ("alg", signer.algorithm),
            ("expires", expires),
            ("nonce", nonce or generate_nonce()),
            ("tag", TAG),
        ),
    )
    base = signature_base(params, Message(method=method, url=url, headers=all_headers))
    signature = await signer.sign(base)
    return SignedHeaders(
        signature_agent=agent_header,
        signature_input=serialize_signature_input(label, params),
        signature=serialize_signature(label, signature),
        content_digest=digest,
        base=base,
    )


class WebBotAuth(httpx.Auth):
    """An ``httpx`` auth that signs every request of an ``AsyncClient``.

    ::

        async with httpx.AsyncClient(auth=WebBotAuth(signer, agent="https://agent.example")) as client:
            await client.get("https://shop.example/products")
    """

    requires_request_body = True

    def __init__(self, signer: HttpSigner, *, agent: str, **options: Any) -> None:
        self._signer = signer
        self._agent = agent
        self._options = options

    def sync_auth_flow(self, request: Any) -> Generator[Any, Any, None]:
        raise RuntimeError(
            "Web Bot Auth signs through the host's async signer: use an AsyncClient"
        )
        yield request  # pragma: no cover

    async def async_auth_flow(self, request: Any) -> AsyncGenerator[Any, Any]:
        signed = await sign_request(
            method=request.method,
            url=str(request.url),
            headers=dict(request.headers),
            body=request.content or None,
            signer=self._signer,
            agent=self._agent,
            **self._options,
        )
        request.headers.update(signed.as_dict())
        yield request
