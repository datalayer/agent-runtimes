# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Who is calling an application's routes (LOOP R-32).

A runtime's routes carried no authentication of their own: access rested on
the address. An application's route now verifies the caller before anything
else — a person's token, an embed token for that application, or nothing for
a public one — and answers only the origins its deployment allows.

Verified **by asking the platform**, never locally: the platform's tokens are
signed with one shared secret, and a runtime runs an agent's code, so it is
never given that secret. A person's token is what IAM's ``whoami`` accepts; an
embed token is what Spacer accepts for the application it names. A verified
token is remembered until it expires, for five minutes at most, so that a
conversation costs one call and a revoked token stops within minutes.

A call from the machine itself — a developer's ``localhost``, the companion
beside the runtime — needs no token. Every other call that cannot be verified
is refused: a runtime that does not know where IAM is refuses, rather than
lets through.
"""

from __future__ import annotations

import hashlib
import ipaddress
import os
import time
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, Optional, Tuple

import httpx
import jwt

#: The audience of an app embed token (`datalayer_common.authn.app_embed`).
APP_EMBED_AUDIENCE = "datalayer:app:embed"

#: The longest a verified token is trusted without asking again.
CACHE_SECONDS = 300.0

#: How long the platform is waited for.
TIMEOUT_SECONDS = 5.0


@dataclass(frozen=True)
class Caller:
    """Who called: a person, an embed of one application, or the machine itself."""

    kind: str  # "person" | "embed" | "local" | "anonymous"
    uid: str = ""
    app_uid: str = ""


LOCAL = Caller(kind="local")
ANONYMOUS = Caller(kind="anonymous")


class CallerRefused(Exception):
    """A call that is not let through: its status and its reason, in a sentence."""

    def __init__(self, status: int, reason: str):
        self.status = status
        self.reason = reason
        super().__init__(reason)


def is_loopback(host: Optional[str]) -> bool:
    """Whether a client address is the machine itself."""
    if not host:
        return False
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def bearer_of(authorization: Optional[str]) -> str:
    """The token of an ``Authorization: Bearer …`` header, or nothing."""
    if not authorization:
        return ""
    scheme, _, token = authorization.partition(" ")
    return token.strip() if scheme.lower() == "bearer" else ""


def _unverified_claims(token: str) -> Dict[str, Any]:
    """What a token says, read without checking it: only to choose who checks it."""
    try:
        claims = jwt.decode(token, options={"verify_signature": False})
    except jwt.PyJWTError:
        return {}
    return claims if isinstance(claims, dict) else {}


def is_embed_token(claims: Dict[str, Any]) -> bool:
    audience = claims.get("aud")
    return audience == APP_EMBED_AUDIENCE or (
        isinstance(audience, list) and APP_EMBED_AUDIENCE in audience
    )


def _platform_url(name: str) -> str:
    return (os.environ.get(name) or "").strip().rstrip("/")


#: Asks the platform: (url, token) -> status code.
Fetch = Callable[[str, str], Awaitable[int]]


async def _fetch(url: str, token: str) -> int:
    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
        response = await client.get(url, headers={"Authorization": f"Bearer {token}"})
        return response.status_code


class CallerVerifier:
    """Verifies callers by asking the platform, and remembers the answers."""

    def __init__(
        self,
        fetch: Fetch = _fetch,
        clock: Callable[[], float] = time.monotonic,
        now: Callable[[], float] = time.time,
    ):
        self._fetch = fetch
        self._clock = clock
        self._now = now
        self._verified: Dict[Tuple[str, str], Tuple[Caller, float]] = {}

    def forget(self) -> None:
        self._verified.clear()

    async def verify(self, token: str, app_uid: str = "") -> Caller:
        """The caller a token is, or `CallerRefused`."""
        claims = _unverified_claims(token)
        if not claims:
            raise CallerRefused(401, "The token is not one this platform issues.")
        embed = is_embed_token(claims)
        if embed and not app_uid:
            raise CallerRefused(
                403,
                "An embed token reaches an application, and this runtime runs none.",
            )
        key = (hashlib.sha256(token.encode()).hexdigest(), app_uid if embed else "")
        remembered = self._verified.get(key)
        if remembered and remembered[1] > self._clock():
            return remembered[0]
        expires = claims.get("exp")
        if isinstance(expires, (int, float)) and expires <= self._now():
            raise CallerRefused(401, "The token has expired.")
        if embed:
            if claims.get("app_uid") != app_uid:
                raise CallerRefused(403, "The embed token is for another application.")
            spacer = _platform_url("DATALAYER_SPACER_URL")
            if not spacer:
                raise CallerRefused(
                    503,
                    "This runtime does not know where Spacer is, so it cannot verify an embed token.",
                )
            status = await self._ask(
                f"{spacer}/api/spacer/v1/apps/{app_uid}/embedded", token
            )
            caller = Caller(
                kind="embed", uid=str(claims.get("sub") or ""), app_uid=app_uid
            )
        else:
            iam = _platform_url("DATALAYER_IAM_URL")
            if not iam:
                raise CallerRefused(
                    503,
                    "This runtime does not know where IAM is, so it cannot verify a token.",
                )
            status = await self._ask(f"{iam}/api/iam/v1/whoami", token)
            caller = Caller(
                kind="person", uid=str(claims.get("sub") or claims.get("uid") or "")
            )
        if status in (401, 403, 404):
            raise CallerRefused(401, "The platform does not accept this token.")
        if status != 200:
            raise CallerRefused(
                503, f"The platform could not verify the token ({status})."
            )
        lifetime = CACHE_SECONDS
        if isinstance(expires, (int, float)):
            lifetime = min(lifetime, max(0.0, expires - self._now()))
        self._verified[key] = (caller, self._clock() + lifetime)
        return caller

    async def _ask(self, url: str, token: str) -> int:
        try:
            return await self._fetch(url, token)
        except httpx.HTTPError as error:
            raise CallerRefused(
                503,
                f"The platform could not be reached to verify the token ({type(error).__name__}).",
            ) from None


#: The runtime's verifier: one per process.
VERIFIER = CallerVerifier()


def origin_allowed(origin: Optional[str], allowed: Tuple[str, ...]) -> bool:
    """Whether a browser's origin may call: any, when the deployment names none."""
    if not origin or not allowed:
        return True
    return origin.rstrip("/") in {entry.rstrip("/") for entry in allowed}
