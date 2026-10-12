# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A counterpart's public metadata, fetched on one egress path (AGENT_PROTOCOLS PI-13).

Key directories (Web Bot Auth), merchant profiles (UCP's
``/.well-known/ucp``) and seller discovery documents (the Agentic Commerce
Protocol's ``/.well-known/acp.json``) name addresses an agent then reaches:
each is read through the PAP SDK's ``create_resolving_client``
(personal-agent-protocol 0.14.0 and later, PAP_DATALAYER B-07) — the host
is resolved before the request and refused unless HTTPS with every address
public (``unsafe_address``, nothing sent), only the approved address is
dialled, no redirect is followed, no proxy from the environment is used,
and the body is bounded. A name pointing inside, which a check of the URL
alone cannot see, is refused the same way.

A local test counterpart (the examples' merchants, a test's ASGI app) is
read over the client the caller already trusts, said with
:func:`client_fetch`: never a fallback, always the caller's choice.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable, Mapping
from typing import Any

import httpx

#: What a fetch answers: its status, its headers and its body.
Fetched = tuple[int, Mapping[str, str], bytes]
#: A GET of one URL.
Fetch = Callable[[str], Awaitable[Fetched]]

#: A merchant profile or a discovery document: larger than a key directory, still bounded.
MAX_METADATA_BYTES = 256 * 1024


def metadata_fetch(
    *,
    accept: str,
    max_bytes: int,
    resolver: Callable[[str], Awaitable[list[str]]] | None = None,
    transport: Any = None,
    timeout: float = 5.0,
) -> Fetch:
    """A GET on the PAP SDK's single egress path, answering ``accept`` up to ``max_bytes``."""

    async def fetch(url: str) -> Fetched:
        from personal_agent_protocol import create_resolving_client
        from personal_agent_protocol.reactor import resolve_addresses

        async with create_resolving_client(
            resolver=resolver or resolve_addresses,
            transport=transport,
            timeout=timeout,
            max_response_bytes=max_bytes,
        ) as client:
            response = await client.get(url, headers={"Accept": accept})
            return response.status_code, dict(response.headers), response.content

    return fetch


def client_fetch(http: httpx.AsyncClient, *, accept: str = "application/json") -> Fetch:
    """A GET over a client the caller trusts: a local test counterpart only."""

    async def fetch(url: str) -> Fetched:
        response = await http.get(url, headers={"Accept": accept})
        return response.status_code, dict(response.headers), response.content

    return fetch
