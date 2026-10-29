# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Signers and public keys for Web Bot Auth.

A signer is anything that can sign bytes under a key id: the host owns the
key (Vault transit in Datalayer, I-02), and an agent only ever
holds the signer — never the key. :class:`LocalSigner` holds a key in
process, for tests and examples only.

Key ids are JWK SHA-256 thumbprints (RFC 7638; RFC 8037 Appendix A.3 for
Ed25519), as the draft requires of ``keyid``.
"""

from __future__ import annotations

import base64
import hashlib
import json
from dataclasses import dataclass
from typing import Any, Mapping, Protocol, runtime_checkable

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec, ed25519
from cryptography.hazmat.primitives.asymmetric.utils import (
    decode_dss_signature,
    encode_dss_signature,
)

#: The algorithms signed and verified here (IANA HTTP Message Signatures registry).
ALGORITHMS = ("ed25519", "ecdsa-p256-sha256")


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64url(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def jwk_thumbprint(jwk: Mapping[str, Any]) -> str:
    """The base64url SHA-256 thumbprint of a public JWK (RFC 7638, RFC 8037)."""
    kty = jwk.get("kty")
    members: tuple[str, ...]
    if kty == "OKP":
        members = ("crv", "kty", "x")
    elif kty == "EC":
        members = ("crv", "kty", "x", "y")
    elif kty == "RSA":
        members = ("e", "kty", "n")
    else:
        raise ValueError(f"no thumbprint for key type `{kty}`")
    missing = [name for name in members if not jwk.get(name)]
    if missing:
        raise ValueError(f"the key lacks {', '.join(missing)}")
    canonical = json.dumps(
        {name: jwk[name] for name in members}, separators=(",", ":"), sort_keys=True
    )
    return _b64url(hashlib.sha256(canonical.encode()).digest())


def algorithm_of(jwk: Mapping[str, Any]) -> str:
    """The signature algorithm a public JWK is used with here."""
    if jwk.get("kty") == "OKP" and jwk.get("crv") == "Ed25519":
        return "ed25519"
    if jwk.get("kty") == "EC" and jwk.get("crv") == "P-256":
        return "ecdsa-p256-sha256"
    raise ValueError(f"key `{jwk.get('kty')}`/`{jwk.get('crv')}` is not supported")


def public_jwk(
    key: ed25519.Ed25519PublicKey | ec.EllipticCurvePublicKey,
) -> dict[str, str]:
    """A public key as a JWK, its ``kid`` the thumbprint."""
    if isinstance(key, ed25519.Ed25519PublicKey):
        from cryptography.hazmat.primitives import serialization

        raw = key.public_bytes(
            serialization.Encoding.Raw, serialization.PublicFormat.Raw
        )
        jwk = {"kty": "OKP", "crv": "Ed25519", "x": _b64url(raw)}
    elif isinstance(key, ec.EllipticCurvePublicKey) and isinstance(
        key.curve, ec.SECP256R1
    ):
        numbers = key.public_numbers()
        jwk = {
            "kty": "EC",
            "crv": "P-256",
            "x": _b64url(numbers.x.to_bytes(32, "big")),
            "y": _b64url(numbers.y.to_bytes(32, "big")),
        }
    else:
        raise ValueError("only Ed25519 and P-256 keys are supported")
    return {**jwk, "kid": jwk_thumbprint(jwk)}


@dataclass(frozen=True)
class PublicKey:
    """A key a signature is checked against, by its thumbprint."""

    keyid: str
    algorithm: str
    jwk: Mapping[str, Any]

    @classmethod
    def from_jwk(cls, jwk: Mapping[str, Any]) -> "PublicKey":
        algorithm = algorithm_of(jwk)
        keyid = jwk_thumbprint(jwk)
        if jwk.get("kid") is not None and jwk["kid"] != keyid:
            raise ValueError("a directory key's `kid` is not its thumbprint")
        return cls(keyid=keyid, algorithm=algorithm, jwk=dict(jwk))

    def verify(self, signature: bytes, data: bytes) -> bool:
        """Whether ``signature`` signs ``data`` under this key."""
        try:
            if self.algorithm == "ed25519":
                ed25519.Ed25519PublicKey.from_public_bytes(
                    _unb64url(self.jwk["x"])
                ).verify(signature, data)
                return True
            if self.algorithm == "ecdsa-p256-sha256":
                if len(signature) != 64:
                    return False
                numbers = ec.EllipticCurvePublicNumbers(
                    int.from_bytes(_unb64url(self.jwk["x"]), "big"),
                    int.from_bytes(_unb64url(self.jwk["y"]), "big"),
                    ec.SECP256R1(),
                )
                der = encode_dss_signature(
                    int.from_bytes(signature[:32], "big"),
                    int.from_bytes(signature[32:], "big"),
                )
                numbers.public_key().verify(der, data, ec.ECDSA(hashes.SHA256()))
                return True
        except InvalidSignature:
            return False
        raise ValueError(f"algorithm `{self.algorithm}` is not supported")


@runtime_checkable
class HttpSigner(Protocol):
    """Signs under one key the host holds (the ``protocols.httpSigner`` contribution).

    ``sign`` answers the raw signature (RFC 9421 §3.3: Ed25519's 64 bytes, ECDSA's ``r || s``).
    In Datalayer it is Vault transit's sign call; the
    key never reaches the runtime.
    """

    keyid: str
    algorithm: str

    async def sign(self, data: bytes) -> bytes: ...


class LocalSigner:
    """A signer whose key is in this process: tests and examples only."""

    def __init__(self, key: ed25519.Ed25519PrivateKey | ec.EllipticCurvePrivateKey):
        if isinstance(key, ed25519.Ed25519PrivateKey):
            self.algorithm = "ed25519"
        elif isinstance(key, ec.EllipticCurvePrivateKey) and isinstance(
            key.curve, ec.SECP256R1
        ):
            self.algorithm = "ecdsa-p256-sha256"
        else:
            raise ValueError("only Ed25519 and P-256 keys are supported")
        self._key = key
        self.public_jwk = public_jwk(key.public_key())
        self.keyid = self.public_jwk["kid"]

    @classmethod
    def generate(cls, algorithm: str = "ed25519") -> "LocalSigner":
        if algorithm == "ed25519":
            return cls(ed25519.Ed25519PrivateKey.generate())
        if algorithm == "ecdsa-p256-sha256":
            return cls(ec.generate_private_key(ec.SECP256R1()))
        raise ValueError(f"algorithm `{algorithm}` is not supported")

    @classmethod
    def from_jwk(cls, jwk: Mapping[str, Any]) -> "LocalSigner":
        """From a private JWK (``d`` present)."""
        if jwk.get("kty") == "OKP" and jwk.get("crv") == "Ed25519":
            return cls(
                ed25519.Ed25519PrivateKey.from_private_bytes(_unb64url(jwk["d"]))
            )
        if jwk.get("kty") == "EC" and jwk.get("crv") == "P-256":
            return cls(
                ec.derive_private_key(
                    int.from_bytes(_unb64url(jwk["d"]), "big"), ec.SECP256R1()
                )
            )
        raise ValueError("only Ed25519 and P-256 keys are supported")

    async def sign(self, data: bytes) -> bytes:
        if isinstance(self._key, ed25519.Ed25519PrivateKey):
            return self._key.sign(data)
        r, s = decode_dss_signature(self._key.sign(data, ec.ECDSA(hashes.SHA256())))
        return r.to_bytes(32, "big") + s.to_bytes(32, "big")
