# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An agent's key directory (PR-22).

Served at ``/.well-known/http-message-signatures-directory`` as a JWK Set
(``application/http-message-signatures-directory+json``), each key's ``kid``
its thumbprint, and the response signed by every key it lists (the draft's
Appendix B): the signature covers ``"@authority";req`` and the body's
``Content-Digest``, tagged ``http-message-signatures-directory``, so the set
cannot be served again under another authority nor swapped under a captured
signature.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import Any, Mapping, Sequence

from .keys import HttpSigner, PublicKey, jwk_thumbprint
from .sign import DIRECTORY_MEDIA_TYPE, DIRECTORY_PATH
from .signature import (
    Component,
    Message,
    SignatureParams,
    content_digest,
    parse_signatures,
    serialize_signature,
    serialize_signature_input,
    signature_base,
)

#: The tag of a directory response's signature.
DIRECTORY_TAG = "http-message-signatures-directory"

__all__ = [
    "DIRECTORY_MEDIA_TYPE",
    "DIRECTORY_PATH",
    "DIRECTORY_TAG",
    "DirectoryResponse",
    "directory_body",
    "sign_directory_response",
    "verify_directory_response",
]


def directory_body(keys: Sequence[Mapping[str, Any]]) -> bytes:
    """The directory's bytes: public keys only, each ``kid`` its thumbprint."""
    out = []
    for jwk in keys:
        if "d" in jwk:
            raise ValueError("a key directory publishes public keys only")
        kid = jwk_thumbprint(jwk)
        if jwk.get("kid") not in (None, kid):
            raise ValueError("a directory key's `kid` is its thumbprint")
        out.append({**jwk, "kid": kid})
    return json.dumps({"keys": out}, separators=(",", ":")).encode()


@dataclass(frozen=True)
class DirectoryResponse:
    """A directory response: its body and the headers that bind it."""

    body: bytes
    headers: dict[str, str]


async def sign_directory_response(
    *,
    body: bytes,
    authority_url: str,
    signers: Sequence[HttpSigner],
    created: int | None = None,
    lifetime: int = 300,
    expires: int | None = None,
) -> DirectoryResponse:
    """Sign a directory response with every key it publishes.

    ``authority_url`` is the URL the directory was fetched at; its authority
    is what the proof binds the set to.
    """
    if not signers:
        raise ValueError("a directory is signed by the keys it publishes")
    published = {key["kid"] for key in json.loads(body)["keys"]}
    created = int(time.time()) if created is None else created
    expires = created + lifetime if expires is None else expires
    digest = content_digest(body)
    request = Message(method="GET", url=authority_url)
    response = Message(
        method="GET",
        url=authority_url,
        headers={"Content-Digest": digest},
        request=request,
        is_response=True,
    )
    inputs, signatures = [], []
    for index, signer in enumerate(signers):
        if signer.keyid not in published:
            raise ValueError(
                f"key `{signer.keyid}` signs a directory that does not list it"
            )
        label = "binding" if index == 0 else f"binding{index}"
        params = SignatureParams(
            components=(
                Component(name="@authority", params=(("req", True),)),
                Component(name="content-digest"),
            ),
            params=(
                ("created", created),
                ("expires", expires),
                ("keyid", signer.keyid),
                ("tag", DIRECTORY_TAG),
            ),
        )
        signature = await signer.sign(signature_base(params, response))
        inputs.append(serialize_signature_input(label, params))
        signatures.append(serialize_signature(label, signature))
    return DirectoryResponse(
        body=body,
        headers={
            "Content-Type": DIRECTORY_MEDIA_TYPE,
            "Content-Digest": digest,
            "Signature-Input": ", ".join(inputs),
            "Signature": ", ".join(signatures),
        },
    )


def verify_directory_response(
    *,
    body: bytes,
    headers: Mapping[str, str],
    authority_url: str,
    now: int | None = None,
) -> list[PublicKey]:
    """The keys of a directory whose response proves it holds them.

    A key is returned only when a signature of the response, tagged
    ``http-message-signatures-directory`` and not created in the future,
    verifies under it, and the body matches its ``Content-Digest``. A
    directory with no such key answers ``ValueError``.
    """
    now = int(time.time()) if now is None else now
    lowered = {key.lower(): value for key, value in headers.items()}
    digest = lowered.get("content-digest")
    if digest != content_digest(body):
        raise ValueError("the directory's Content-Digest does not match its body")
    keys = {}
    for jwk in json.loads(body).get("keys", []):
        try:
            key = PublicKey.from_jwk(jwk)
        except ValueError:
            continue
        keys[key.keyid] = key
    response = Message(
        method="GET",
        url=authority_url,
        headers={"Content-Digest": digest},
        request=Message(method="GET", url=authority_url),
        is_response=True,
    )
    proven = []
    for _, params, signature in parse_signatures(
        lowered.get("signature-input", ""), lowered.get("signature", "")
    ):
        if params.get("tag") != DIRECTORY_TAG:
            continue
        created = params.get("created")
        if not isinstance(created, int) or created > now:
            continue
        expires = params.get("expires")
        if isinstance(expires, int) and expires < now:
            continue
        signer = keys.get(str(params.get("keyid")))
        if signer is None:
            continue
        if signer.verify(signature, signature_base(params, response)):
            proven.append(signer)
    if not proven:
        raise ValueError("no key of the directory signs its response")
    return proven
