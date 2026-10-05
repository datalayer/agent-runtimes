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

A visitor without an account holds a token ai-inference minted for them,
naming the visitor and the one application it is for: it is what
ai-inference's ``/anonymous/whoami`` accepts, and only the visitors' runtime
answers it (LOOP R-30, `agent_runtimes.loop.apps.visitors`), which in turn
answers nobody signed in.

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

#: The most verified tokens remembered at once; the oldest goes first.
CACHE_SIZE = 1024

#: How long the platform is waited for.
TIMEOUT_SECONDS = 5.0


@dataclass(frozen=True)
class Caller:
    """Who called: a person, an embed of one application, a visitor, or the machine itself.

    A visitor's ``app_uid`` is what their token is for: an example's id, or
    ``at:<slug>`` for an application at its address (R-30).
    """

    kind: str  # "person" | "embed" | "visitor" | "local"
    uid: str = ""
    app_uid: str = ""


LOCAL = Caller(kind="local")


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
        from agent_runtimes.loop.apps.visitors import (
            NOT_HERE,
            ONLY_VISITORS,
            is_anonymous_audience,
            visitors_runtime,
        )

        claims = _unverified_claims(token)
        if not claims:
            raise CallerRefused(401, "The token is not one this platform issues.")
        visitor = is_anonymous_audience(claims)
        if visitor != visitors_runtime():
            raise CallerRefused(403, NOT_HERE if visitor else ONLY_VISITORS)
        if visitor:
            return await self._visitor(token)
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
        self._remember(key, caller, self._clock() + lifetime)
        return caller

    async def verify_visitor(self, token: str) -> Caller:
        """The visitor a token is, on any runtime, or `CallerRefused`.

        Only for a route that answers visitors although the runtime is not the
        visitors' one: an application its owner served over A2A open to
        visitors (`agent_runtimes.loop.apps.a2a`). Everything else goes
        through :meth:`verify`, which refuses a visitor off that runtime.
        """
        from agent_runtimes.loop.apps.visitors import is_anonymous_audience

        claims = _unverified_claims(token)
        if not claims or not is_anonymous_audience(claims):
            raise CallerRefused(401, "The token is not a visitor's.")
        expires = claims.get("exp")
        if isinstance(expires, (int, float)) and expires <= self._now():
            raise CallerRefused(
                401, "Your visitor's token has run out: reload the page to go on."
            )
        return await self._visitor(token)

    async def _visitor(self, token: str) -> Caller:
        """A visitor's token, asked of ai-inference, which minted it (R-30).

        Remembered as long as ai-inference says it lives, at most
        :data:`CACHE_SECONDS`: a token is worth a few minutes.
        """
        key = (hashlib.sha256(token.encode()).hexdigest(), "visitor")
        remembered = self._verified.get(key)
        if remembered and remembered[1] > self._clock():
            return remembered[0]
        inference = _platform_url("DATALAYER_AI_INFERENCE_URL")
        if not inference:
            raise CallerRefused(
                503,
                "This runtime does not know where ai-inference is, so it cannot verify a visitor.",
            )
        from agent_runtimes.models.models import _normalize_ai_inference_base_url

        url = f"{_normalize_ai_inference_base_url(inference)}/anonymous/whoami"
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
                response = await client.get(
                    url, headers={"Authorization": f"Bearer {token}"}
                )
        except httpx.HTTPError as error:
            raise CallerRefused(
                503,
                f"ai-inference could not be reached to verify the visitor ({type(error).__name__}).",
            ) from None
        if response.status_code in (401, 403, 404):
            raise CallerRefused(
                401, "Your visitor's token has run out: reload the page to go on."
            )
        if response.status_code != 200:
            raise CallerRefused(
                503,
                f"ai-inference could not verify the visitor ({response.status_code}).",
            )
        said = response.json()
        visitor = str(said.get("visitor") or "")
        if not visitor:
            raise CallerRefused(401, "The token names no visitor.")
        caller = Caller(kind="visitor", uid=visitor, app_uid=str(said.get("app") or ""))
        lifetime = min(CACHE_SECONDS, max(0.0, float(said.get("expires_in") or 0)))
        self._remember(key, caller, self._clock() + lifetime)
        return caller

    def _remember(self, key: Tuple[str, str], caller: Caller, until: float) -> None:
        """Keep an answer; what has expired goes, and the oldest when it is full."""
        now = self._clock()
        for stale in [
            known for known, (_, end) in self._verified.items() if end <= now
        ]:
            del self._verified[stale]
        while len(self._verified) >= CACHE_SIZE:
            del self._verified[next(iter(self._verified))]
        self._verified[key] = (caller, until)

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


def is_loopback_origin(origin: str) -> bool:
    """Whether a browser's origin is a page served by this machine."""
    try:
        host = httpx.URL(origin).host
    except Exception:  # noqa: BLE001 - an origin that does not parse is nobody's
        return False
    return is_loopback(host)


def platform_origins() -> Tuple[str, ...]:
    """The origins of the platform's own pages: what the operator says, and its URLs."""
    named = (os.environ.get("AGENT_RUNTIMES_APP_ORIGINS") or "").split(",")
    urls = [
        os.environ.get("DATALAYER_UI_URL") or "",
        os.environ.get("DATALAYER_RUN_URL") or "",
    ]
    origins = []
    for entry in [*named, *urls]:
        entry = entry.strip().rstrip("/")
        if entry:
            url = httpx.URL(entry)
            origins.append(f"{url.scheme}://{url.netloc.decode()}")
    return tuple(dict.fromkeys(origins))


def origin_allowed(origin: Optional[str], allowed: Tuple[str, ...]) -> bool:
    """Whether a browser's origin may call.

    No origin is not a browser's cross-site call, and is let through to the
    token check. A page served by this machine is a developer's. Any other
    origin has to be named: by the platform, or by the deployment.
    """
    if not origin:
        return True
    if is_loopback_origin(origin):
        return True
    return origin.rstrip("/") in {entry.rstrip("/") for entry in allowed}
