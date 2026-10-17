# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""PACT's JWTs: the personal-agent JWT signed by the host's key, and the checks
a Provider makes of it and of a delegation token.

The personal agent never holds a key: the JWT is signed by an
:class:`~agent_runtimes.protocols.web_bot_auth.HttpSigner` whose algorithm is
``ecdsa-p256-sha256`` (ES256) — the host's, contributed to ``pact.signer``.
Verification uses PyJWT.
"""

from __future__ import annotations

import base64
import json
import time
import uuid
from typing import Any, Mapping

#: The claims a personal-agent JWT lives at most, and the skew a Provider allows.
MAX_LIFETIME = 300
LIFETIME = 120
CLOCK_SKEW = 30


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


async def sign_personal_agent_jwt(
    signer: Any,
    *,
    issuer: str,
    subject: str,
    audience: str,
    now: int | None = None,
    lifetime: int = LIFETIME,
) -> str:
    """One personal-agent JWT: ES256, ``kid`` the signer's key id, valid ``lifetime`` seconds."""
    if signer.algorithm != "ecdsa-p256-sha256":
        raise ValueError("a personal-agent JWT is signed ES256 here (a P-256 key)")
    if not subject or "@" in subject:
        raise ValueError(
            "`sub` is a stable, opaque id: never an address or other personal data"
        )
    if lifetime > MAX_LIFETIME:
        raise ValueError("a personal-agent JWT lives at most 300 seconds")
    now = int(time.time()) if now is None else now
    header = {"alg": "ES256", "kid": signer.keyid, "typ": "JWT"}
    claims = {
        "iss": issuer,
        "sub": subject,
        "aud": audience,
        "iat": now,
        "exp": now + lifetime,
        "jti": str(uuid.uuid4()),
    }
    signing_input = (
        _b64url(json.dumps(header, separators=(",", ":")).encode())
        + "."
        + _b64url(json.dumps(claims, separators=(",", ":")).encode())
    )
    signature = await signer.sign(signing_input.encode())
    return f"{signing_input}.{_b64url(signature)}"


def _key_for(token: str, jwks: Mapping[str, Any]) -> Any:
    import jwt

    kid = jwt.get_unverified_header(token).get("kid")
    keys = [key for key in jwks.get("keys", []) if kid is None or key.get("kid") == kid]
    if not keys:
        raise PermissionError("no key of the issuer signs this token")
    return jwt.PyJWK.from_dict(keys[0]).key


def verify_personal_agent_jwt(
    token: str,
    *,
    issuer: str,
    audience: str,
    jwks: Mapping[str, Any],
    now: int | None = None,
) -> dict[str, Any]:
    """A Provider's check of a personal-agent JWT; :class:`PermissionError` when it fails."""
    import jwt

    try:
        alg = jwt.get_unverified_header(token).get("alg")
        if alg not in ("ES256", "RS256"):
            raise PermissionError(f"algorithm {alg} is refused")
        claims = jwt.decode(
            token,
            _key_for(token, jwks),
            algorithms=["ES256", "RS256"],
            audience=audience,
            issuer=issuer,
            leeway=CLOCK_SKEW,
            options={"require": ["iss", "sub", "aud", "iat", "exp"]},
        )
    except jwt.PyJWTError as error:
        raise PermissionError(str(error)) from error
    now = int(time.time()) if now is None else now
    if claims["iat"] > now + CLOCK_SKEW:
        raise PermissionError("the token is issued in the future")
    if claims["exp"] - claims["iat"] > MAX_LIFETIME:
        raise PermissionError("the token lives more than 300 seconds")
    return claims


def verify_delegation_token(
    token: str,
    *,
    issuer: str,
    interface_url: str,
    client_id: str,
    jwks: Mapping[str, Any],
) -> dict[str, Any]:
    """A delegation token's checks: signature, ``aud``, ``exp``, ``client_id``."""
    import jwt

    try:
        claims = jwt.decode(
            token,
            _key_for(token, jwks),
            algorithms=["ES256", "RS256"],
            audience=interface_url,
            issuer=issuer,
            leeway=CLOCK_SKEW,
            options={
                "require": [
                    "iss",
                    "sub",
                    "aud",
                    "exp",
                    "scope",
                    "client_id",
                    "grant_id",
                ]
            },
        )
    except jwt.PyJWTError as error:
        raise PermissionError(str(error)) from error
    if claims["client_id"] != client_id:
        raise PermissionError("the delegation was granted to another personal agent")
    return claims


def verify_receipt(
    receipt: Mapping[str, Any], *, jwks: Mapping[str, Any]
) -> dict[str, Any]:
    """A receipt's JWS checked against the Provider's keys, its claims the ones signed."""
    import jwt

    jws = receipt.get("jws")
    if not isinstance(jws, str):
        raise PermissionError("the receipt carries no JWS")
    try:
        signed = jwt.api_jws.decode_complete(
            jws, _key_for(jws, jwks), algorithms=["ES256", "RS256"]
        )
    except jwt.PyJWTError as error:
        raise PermissionError(str(error)) from error
    claims = json.loads(signed["payload"])
    if claims != dict(receipt.get("claims") or {}):
        raise PermissionError("the receipt's claims are not the ones it signs")
    return claims


__all__ = [
    "CLOCK_SKEW",
    "LIFETIME",
    "MAX_LIFETIME",
    "sign_personal_agent_jwt",
    "verify_delegation_token",
    "verify_personal_agent_jwt",
    "verify_receipt",
]
