# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Verifying an agent's signed request (PR-23).

The draft's §4 on RFC 9421 §3.2: parse ``Signature``, ``Signature-Input``
and ``Signature-Agent``; keep the signatures tagged ``web-bot-auth``; find
the key by the pair (the ``Signature-Agent`` URL, ``keyid``) — never by
``keyid`` alone — fetching the directory when it is unknown; check
``created`` and ``expires``; and, when the policy asks, refuse a nonce seen
before, atomically.

A request comes out ``verified`` (and says by whom), ``invalid`` (a
signature that does not hold), or ``unverified`` (nothing to check, or keys
that could not be found): a verifier never attributes a request to a URL it
could not resolve.
"""

from __future__ import annotations

import asyncio
import ipaddress
import json
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Literal, Mapping, Protocol
from urllib.parse import urlsplit

import http_sfv

from ..egress import Fetch, Fetched, metadata_fetch
from .directory import verify_directory_response
from .keys import PublicKey
from .sign import DIRECTORY_MEDIA_TYPE, DIRECTORY_PATH, TAG
from .signature import (
    Message,
    SignatureBaseError,
    content_digest,
    parse_signatures,
    signature_base,
)

#: The three outcomes of the draft.
Outcome = Literal["verified", "invalid", "unverified"]


#: The directory a fetch may bring back, at most.
MAX_DIRECTORY_BYTES = 64 * 1024
MAX_DIRECTORY_KEYS = 32
#: How long a directory that could not be fetched is not asked again.
NEGATIVE_TTL_SECONDS = 300
#: A key a cached directory does not list (the agent rotated: its new key signs at once) reads
#: the directory again, no sooner than this after the last read of it.
UNKNOWN_KEY_REFETCH_SECONDS = 10


@dataclass(frozen=True)
class Verification:
    """What verifying one request found."""

    outcome: Outcome
    reason: str = ""
    label: str | None = None
    agent: str | None = None
    keyid: str | None = None
    created: int | None = None
    expires: int | None = None
    nonce: str | None = None
    covered: tuple[str, ...] = ()

    @property
    def verified(self) -> bool:
        return self.outcome == "verified"


class NonceStore(Protocol):
    """Where nonces are remembered until their signature expires."""

    async def check_and_record(self, scope: str, nonce: str, until: int) -> bool:
        """``True`` and remembered when new; ``False`` when seen before."""
        ...


class InMemoryNonceStore:
    """A nonce store for one process."""

    def __init__(self) -> None:
        self._seen: dict[tuple[str, str], int] = {}
        self._lock = asyncio.Lock()

    async def check_and_record(self, scope: str, nonce: str, until: int) -> bool:
        async with self._lock:
            now = int(time.time())
            self._seen = {key: end for key, end in self._seen.items() if end >= now}
            if (scope, nonce) in self._seen:
                return False
            self._seen[(scope, nonce)] = until
            return True


def _refuse_host(url: str, insecure_hosts: frozenset[str]) -> str | None:
    parts = urlsplit(url)
    host = parts.hostname or ""
    if host in insecure_hosts:
        return None
    if parts.scheme != "https":
        return "a key directory is fetched over https"
    if host == "localhost" or host.endswith(".localhost"):
        return "a key directory is not on a loopback address"
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return None
    if (
        address.is_private
        or address.is_loopback
        or address.is_link_local
        or address.is_reserved
    ):
        return "a key directory is not on a private address"
    return None


def resolving_fetch(
    *,
    resolver: Callable[[str], Awaitable[list[str]]] | None = None,
    transport: Any = None,
) -> Fetch:
    """A directory fetch on the PAP SDK's single egress path (PI-13).

    :func:`agent_runtimes.protocols.egress.metadata_fetch`, answering the
    directory's media type and bounded to a directory's size.
    """
    return metadata_fetch(
        accept=DIRECTORY_MEDIA_TYPE,
        max_bytes=MAX_DIRECTORY_BYTES,
        resolver=resolver,
        transport=transport,
    )


#: The default fetch of the ``directory`` and ``jwks_uri`` discoveries.
httpx_fetch: Fetch = resolving_fetch()


class KeyDiscovery(Protocol):
    """How an agent's keys are found for one ``Signature-Agent`` type.

    The draft's discovery types are extensions of the protocol, each the
    contribution point ``web_bot_auth.extension.<type>``: ``directory`` and
    ``jwks_uri`` have defaults here; ``cimd`` has none, so a verifier treats
    it as unsupported (unverified) until a host contributes one.
    """

    async def keys(self, agent: str, now: int) -> list[PublicKey]:
        """The agent's keys; raises when they cannot be read."""
        ...


async def _fetch_checked(
    fetch: Fetch, url: str, insecure_hosts: frozenset[str]
) -> Fetched:
    refused = _refuse_host(url, insecure_hosts)
    if refused:
        raise PermissionError(refused)
    status, headers, body = await fetch(url)
    if status != 200:
        raise ValueError(f"the key directory answered {status}")
    if len(body) > MAX_DIRECTORY_BYTES:
        raise ValueError("the key directory is too large")
    return status, headers, body


def _bounded(keys: list[PublicKey]) -> list[PublicKey]:
    if len(keys) > MAX_DIRECTORY_KEYS:
        raise ValueError("the key directory lists too many keys")
    return keys


@dataclass(frozen=True)
class DirectoryDiscovery:
    """``type=directory``: the well-known directory of the agent's origin, its response signed."""

    fetch: Fetch = httpx_fetch
    #: Hosts reached over plain http on purpose: a local example, never a
    #: deployment — with a fetch of its own: the default refuses all but public HTTPS.
    insecure_hosts: frozenset[str] = frozenset()

    async def keys(self, agent: str, now: int) -> list[PublicKey]:
        parts = urlsplit(agent)
        url = f"{parts.scheme}://{parts.netloc}{DIRECTORY_PATH}"
        _, headers, body = await _fetch_checked(self.fetch, url, self.insecure_hosts)
        return _bounded(
            verify_directory_response(
                body=body, headers=headers, authority_url=url, now=now
            )
        )


@dataclass(frozen=True)
class JwksUriDiscovery:
    """``type=jwks_uri``: a JWK Set at the URL itself (its kids computed, not trusted)."""

    fetch: Fetch = httpx_fetch
    insecure_hosts: frozenset[str] = frozenset()

    async def keys(self, agent: str, now: int) -> list[PublicKey]:
        _, _, body = await _fetch_checked(self.fetch, agent, self.insecure_hosts)
        out = []
        for jwk in json.loads(body).get("keys", []):
            out.append(PublicKey.from_jwk({k: v for k, v in jwk.items() if k != "kid"}))
        return _bounded(out)


@dataclass
class DirectoryResolver:
    """Keys by (agent URL, keyid), through the discovery of the member's type, cached.

    A ``keyid`` the cached directory does not list reads it again (an agent's
    rotated key signs at once), no sooner than ``UNKNOWN_KEY_REFETCH_SECONDS``
    after the last read. A failed read keeps what was cached and is not tried
    again for five minutes; a type with no discovery answers nothing (unverified).
    """

    discoveries: Mapping[str, KeyDiscovery]
    ttl_seconds: int = 3600
    #: (discovery, agent) -> (expires at, read at, keys by keyid)
    _cache: dict[tuple[str, str], tuple[int, int, dict[str, PublicKey]]] = field(
        default_factory=dict
    )
    _failed: dict[tuple[str, str], int] = field(default_factory=dict)

    @classmethod
    def with_fetch(
        cls, fetch: Fetch = httpx_fetch, insecure_hosts: frozenset[str] = frozenset()
    ) -> "DirectoryResolver":
        """The two discoveries this package implements, over one fetch."""
        return cls(
            discoveries={
                "directory": DirectoryDiscovery(fetch, insecure_hosts),
                "jwks_uri": JwksUriDiscovery(fetch, insecure_hosts),
            }
        )

    async def keys(
        self, agent: str, discovery: str, now: int, keyid: str | None = None
    ) -> dict[str, PublicKey] | None:
        found_by = self.discoveries.get(discovery)
        if found_by is None:
            return None
        key = (discovery, agent)
        cached = self._cache.get(key)
        if cached and cached[0] > now:
            unknown = keyid is not None and keyid not in cached[2]
            if not unknown or now < cached[1] + UNKNOWN_KEY_REFETCH_SECONDS:
                return cached[2]
        if self._failed.get(key, 0) > now:
            return cached[2] if cached else None
        try:
            keys = await found_by.keys(agent, now)
        except PermissionError:
            raise
        except Exception:  # noqa: BLE001 - a failed fetch keeps what was cached
            self._failed[key] = now + NEGATIVE_TTL_SECONDS
            return cached[2] if cached else None
        found = {public.keyid: public for public in keys}
        self._cache[key] = (now + self.ttl_seconds, now, found)
        self._failed.pop(key, None)
        return found


async def verify_request(
    *,
    method: str,
    url: str,
    headers: Mapping[str, str],
    resolver: DirectoryResolver,
    body: bytes | None = None,
    nonce_store: NonceStore | None = None,
    require_nonce: bool = False,
    now: int | None = None,
    clock_skew: int = 30,
    max_lifetime: int | None = None,
) -> Verification:
    """Verify the Web Bot Auth signature of one request.

    The first signature tagged ``web-bot-auth`` that verifies wins; a request
    with such a signature none of which verifies is ``invalid``. When the
    signature covers ``content-digest`` and ``body`` is given, the body must
    match it. ``max_lifetime`` is the verifier's policy on how long a
    signature may live (the draft recommends 24 hours and requires nothing).
    """
    now = int(time.time()) if now is None else now
    lowered = {key.lower(): value for key, value in headers.items()}
    signature_input = lowered.get("signature-input")
    signature = lowered.get("signature")
    agent_header = lowered.get("signature-agent")
    if not signature_input or not signature:
        return Verification(outcome="unverified", reason="the request is not signed")
    try:
        signatures = parse_signatures(signature_input, signature)
    except (ValueError, SignatureBaseError) as error:
        return Verification(outcome="invalid", reason=f"unreadable signature: {error}")
    agents: dict[str, tuple[str, str]] = {}
    if agent_header:
        dictionary = http_sfv.Dictionary()
        try:
            dictionary.parse(agent_header.encode())
        except ValueError as error:
            return Verification(
                outcome="invalid", reason=f"unreadable Signature-Agent: {error}"
            )
        for member, item in dictionary.items():
            if not isinstance(item.value, str):
                continue
            discovery = str(item.params.get("type", "directory"))
            agents[member] = (item.value, discovery)
    candidates = [entry for entry in signatures if entry[1].get("tag") == TAG]
    if not candidates:
        return Verification(outcome="unverified", reason="no web-bot-auth signature")
    reason = ""
    message = Message(method=method, url=url, headers=headers)
    for label, params, value in candidates:
        covered = tuple(component.serialize() for component in params.components)
        names = {component.name for component in params.components}
        if "@authority" not in names and "@target-uri" not in names:
            reason = "the signature covers neither @authority nor @target-uri"
            continue
        member = next(
            (c.key for c in params.components if c.name == "signature-agent" and c.key),
            None,
        )
        if member is None or member not in agents:
            reason = "the signature does not cover its Signature-Agent member"
            continue
        agent, discovery = agents[member]
        if not agent.startswith("https://"):
            reason = "the Signature-Agent is not an https URI"
            continue
        created, expires = params.get("created"), params.get("expires")
        if not isinstance(created, int) or not isinstance(expires, int):
            reason = "created and expires are required"
            continue
        if created > now + clock_skew:
            reason = "the signature is created in the future"
            continue
        if expires < now - clock_skew:
            reason = "the signature has expired"
            continue
        if max_lifetime is not None and expires - created > max_lifetime:
            reason = "the signature lives too long"
            continue
        keyid = str(params.get("keyid") or "")
        if discovery not in resolver.discoveries:
            return Verification(
                outcome="unverified",
                reason=f"Signature-Agent type `{discovery}` is not supported",
                agent=agent,
            )
        try:
            keys = await resolver.keys(agent, discovery, now, keyid)
        except PermissionError as error:
            return Verification(outcome="unverified", reason=str(error), agent=agent)
        if keys is None:
            return Verification(
                outcome="unverified",
                reason="the key directory could not be read",
                agent=agent,
            )
        key = keys.get(keyid)
        if key is None:
            return Verification(
                outcome="unverified",
                reason="the key is not in the agent's directory",
                agent=agent,
            )
        alg = params.get("alg")
        if alg is not None and alg != key.algorithm:
            reason = "the signature's alg is not its key's"
            continue
        try:
            base = signature_base(params, message)
        except SignatureBaseError as error:
            reason = str(error)
            continue
        if not key.verify(value, base):
            reason = "the signature does not verify"
            continue
        if "content-digest" in names and body is not None:
            if lowered.get("content-digest") != content_digest(body):
                reason = "the body does not match its Content-Digest"
                continue
        nonce = params.get("nonce")
        if require_nonce and not nonce:
            reason = "a nonce is required"
            continue
        if nonce and nonce_store is not None:
            fresh = await nonce_store.check_and_record(
                f"{agent} {keyid}", str(nonce), expires
            )
            if not fresh:
                return Verification(
                    outcome="invalid",
                    reason="the nonce was seen before",
                    agent=agent,
                    keyid=keyid,
                )
        return Verification(
            outcome="verified",
            label=label,
            agent=agent,
            keyid=keyid,
            created=created,
            expires=expires,
            nonce=str(nonce) if nonce else None,
            covered=covered,
        )
    return Verification(outcome="invalid", reason=reason or "no signature verifies")


class WebBotAuthMiddleware:
    """An ASGI middleware that verifies signed requests (the business role).

    The body is not read here, so a covered ``Content-Digest`` is checked
    against the signature and not against the body: a route that acts on the
    body calls :func:`verify_request` with it. The outcome is put in
    ``scope["state"]["web_bot_auth"]``; an ``invalid``
    request is refused with 401 when ``refuse_invalid`` (the default), and an
    unsigned one passes as ``unverified``, so the application decides what
    an unknown agent may do.
    """

    def __init__(
        self,
        app: Any,
        *,
        resolver: DirectoryResolver,
        nonce_store: NonceStore | None = None,
        refuse_invalid: bool = True,
    ) -> None:
        self.app = app
        self.resolver = resolver
        self.nonce_store = nonce_store or InMemoryNonceStore()
        self.refuse_invalid = refuse_invalid

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return
        headers: dict[str, str] = {}
        for raw_key, raw_value in scope.get("headers", []):
            key = raw_key.decode("latin-1")
            value = raw_value.decode("latin-1")
            headers[key] = f"{headers[key]}, {value}" if key in headers else value
        host = headers.get("host", "")
        scheme = scope.get("scheme", "http")
        query = scope.get("query_string", b"").decode("latin-1")
        url = f"{scheme}://{host}{scope.get('raw_path', scope['path'].encode()).decode('latin-1')}"
        if query and "?" not in url:
            url = f"{url}?{query}"
        result = await verify_request(
            method=scope["method"],
            url=url,
            headers=headers,
            resolver=self.resolver,
            nonce_store=self.nonce_store,
        )
        scope.setdefault("state", {})["web_bot_auth"] = result
        if result.outcome == "invalid" and self.refuse_invalid:
            body = json.dumps(
                {"detail": f"invalid agent signature: {result.reason}"}
            ).encode()
            await send(
                {
                    "type": "http.response.start",
                    "status": 401,
                    "headers": [
                        (b"content-type", b"application/json"),
                        (b"content-length", str(len(body)).encode()),
                    ],
                }
            )
            await send({"type": "http.response.body", "body": body})
            return
        await self.app(scope, receive, send)
