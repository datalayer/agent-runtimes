# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Visa's Trusted Agent Protocol as a profile over Web Bot Auth (PR-24).

**Draft.** Built on 2026-10-13 from Visa's public *Merchant Specifications*
(https://developer.visa.com/capabilities/trusted-agent-protocol/trusted-agent-protocol-specifications)
and its reference repository (https://github.com/visa/trusted-agent-protocol),
not confirmed by Visa: the product says it *arriving* until it is. Visa
publishes no test vector; ``fixtures/tap.json`` is one computed here, held by
both languages.

What the profile says of the agent-recognition signature, over the RFC 9421
signing and verifying of PR-21 and PR-23:

- ``Signature-Input`` and ``Signature`` alone; Visa's page names no
  ``Signature-Agent``, so the verifier is handed the keys (Visa's directory,
  ``VISA_JWKS``, or a registry's) by ``keyid``;
- the covered components are at least ``@authority`` and ``@path``;
- the parameters ``created``, ``keyid``, ``alg``, ``expires``, ``nonce`` and
  ``tag`` are all required, ``alg`` written ``"Ed25519"`` as Visa writes it;
- ``tag`` is ``agent-browser-auth`` for browsing and ``agent-payer-auth`` for
  a payment, and says which the agent is doing;
- ``created`` and ``expires`` are at most 8 minutes apart, the request
  inside them; a nonce seen in the last 8 minutes is a replay.

Found reading the page: its own sample's ``expires`` is an hour after
``created``, against its 8-minute rule; the rule is followed.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Literal, Mapping, Sequence

from .keys import HttpSigner, PublicKey
from .sign import generate_nonce
from .signature import (
    Message,
    SignatureBaseError,
    SignatureParams,
    components_of,
    parse_signatures,
    serialize_signature,
    serialize_signature_input,
    signature_base,
)
from .verify import NonceStore

#: Draft until Visa confirms it.
STATUS = "draft"
#: Where the profile was read, 2026-10-13.
SOURCES = (
    "https://developer.visa.com/capabilities/trusted-agent-protocol/trusted-agent-protocol-specifications",
    "https://developer.visa.com/capabilities/trusted-agent-protocol/overview",
    "https://github.com/visa/trusted-agent-protocol",
)
#: Visa's key directory, as its page says it.
VISA_JWKS = "https://mcp.visa.com/.well-known/jwks"
#: The tag of a browsing request, and of a payment.
BROWSE_TAG = "agent-browser-auth"
PAY_TAG = "agent-payer-auth"
Intent = Literal["browse", "pay"]
TAGS: dict[Intent, str] = {"browse": BROWSE_TAG, "pay": PAY_TAG}
#: Covered by every TAP signature.
REQUIRED_COMPONENTS = ("@authority", "@path")
#: Every TAP signature's parameters.
REQUIRED_PARAMS = ("created", "keyid", "alg", "expires", "nonce", "tag")
#: ``alg`` as Visa writes it.
ALG = "Ed25519"
#: The longest window, and how long a nonce is remembered.
MAX_WINDOW_SECONDS = 8 * 60


@dataclass(frozen=True)
class TapSignedHeaders:
    """The headers a TAP-signed request carries, and what was signed."""

    signature_input: str
    signature: str
    base: bytes

    def as_dict(self) -> dict[str, str]:
        return {"Signature-Input": self.signature_input, "Signature": self.signature}


@dataclass(frozen=True)
class TapVerification:
    """Whom a TAP signature says, and what for; ``reason`` when it does not hold."""

    verified: bool
    reason: str = ""
    intent: Intent | None = None
    keyid: str | None = None
    nonce: str | None = None


async def sign_tap_request(
    *,
    method: str,
    url: str,
    signer: HttpSigner,
    intent: Intent,
    headers: Mapping[str, str] | None = None,
    label: str = "sig2",
    components: Sequence[str] = REQUIRED_COMPONENTS,
    created: int | None = None,
    lifetime: int = MAX_WINDOW_SECONDS,
    nonce: str | None = None,
) -> TapSignedHeaders:
    """Sign one request as a TAP agent browsing or paying, under an Ed25519 key."""
    if signer.algorithm != "ed25519":
        raise ValueError("a TAP signature is Ed25519")
    if intent not in TAGS:
        raise ValueError(f"a TAP intent is one of {tuple(TAGS)}")
    missing = [name for name in REQUIRED_COMPONENTS if name not in components]
    if missing:
        raise ValueError(f"a TAP signature covers {', '.join(missing)}")
    if not 0 < lifetime <= MAX_WINDOW_SECONDS:
        raise ValueError(
            f"a TAP signature lives at most {MAX_WINDOW_SECONDS}s (8 minutes)"
        )
    created = int(time.time()) if created is None else created
    params = SignatureParams(
        components=components_of(components),
        params=(
            ("created", created),
            ("keyid", signer.keyid),
            ("alg", ALG),
            ("expires", created + lifetime),
            ("nonce", nonce or generate_nonce()),
            ("tag", TAGS[intent]),
        ),
    )
    base = signature_base(
        params, Message(method=method, url=url, headers=dict(headers or {}))
    )
    return TapSignedHeaders(
        signature_input=serialize_signature_input(label, params),
        signature=serialize_signature(label, await signer.sign(base)),
        base=base,
    )


async def verify_tap_request(
    *,
    method: str,
    url: str,
    headers: Mapping[str, str],
    keys: Mapping[str, PublicKey],
    nonce_store: NonceStore,
    now: int | None = None,
) -> TapVerification:
    """Verify the TAP signature of one request against keys known by ``keyid``.

    A request with no TAP tag is no trusted agent's (``reason`` says so); the
    merchant decides what to do with it, as Visa's page says.
    """
    lowered = {name.lower(): value for name, value in headers.items()}
    if "signature" not in lowered or "signature-input" not in lowered:
        return TapVerification(False, "the request is not signed")
    try:
        signatures = parse_signatures(lowered["signature-input"], lowered["signature"])
    except (ValueError, SignatureBaseError) as error:
        return TapVerification(False, f"the signature does not parse: {error}")
    intents: dict[str, Intent] = {tag: intent for intent, tag in TAGS.items()}
    tap = [entry for entry in signatures if entry[1].get("tag") in intents]
    if not tap:
        return TapVerification(False, "no signature carries a TAP tag")
    if len(tap) > 1:
        return TapVerification(False, "more than one signature carries a TAP tag")
    _label, params, signature = tap[0]
    absent = [name for name in REQUIRED_PARAMS if params.get(name) is None]
    if absent:
        return TapVerification(False, f"the signature has no {', '.join(absent)}")
    covered = {component.name for component in params.components}
    if not set(REQUIRED_COMPONENTS) <= covered:
        return TapVerification(
            False, "the signature does not cover @authority and @path"
        )
    if params.get("alg") != ALG:
        return TapVerification(False, f"the signature's alg is not {ALG}")
    created, expires = params.get("created"), params.get("expires")
    if not isinstance(created, int) or not isinstance(expires, int):
        return TapVerification(False, "created and expires are integers")
    if expires - created > MAX_WINDOW_SECONDS:
        return TapVerification(
            False, "created and expires are more than 8 minutes apart"
        )
    now = int(time.time()) if now is None else now
    if not created <= now < expires:
        return TapVerification(False, "the signature is not current")
    keyid = str(params.get("keyid"))
    key = keys.get(keyid)
    if key is None:
        return TapVerification(False, "the key is not known", keyid=keyid)
    if key.algorithm != "ed25519":
        return TapVerification(False, "the key is not an Ed25519 key", keyid=keyid)
    try:
        base = signature_base(
            params, Message(method=method, url=url, headers=dict(headers))
        )
    except SignatureBaseError as error:
        return TapVerification(False, str(error), keyid=keyid)
    if not key.verify(signature, base):
        return TapVerification(False, "the signature does not hold", keyid=keyid)
    nonce = str(params.get("nonce"))
    if not await nonce_store.check_and_record(
        f"tap {keyid}", nonce, now + MAX_WINDOW_SECONDS
    ):
        return TapVerification(False, "the nonce was seen before", keyid=keyid)
    return TapVerification(
        True, intent=intents[str(params.get("tag"))], keyid=keyid, nonce=nonce
    )


__all__ = [
    "ALG",
    "BROWSE_TAG",
    "MAX_WINDOW_SECONDS",
    "PAY_TAG",
    "REQUIRED_COMPONENTS",
    "REQUIRED_PARAMS",
    "SOURCES",
    "STATUS",
    "TAGS",
    "VISA_JWKS",
    "Intent",
    "TapSignedHeaders",
    "TapVerification",
    "sign_tap_request",
    "verify_tap_request",
]
