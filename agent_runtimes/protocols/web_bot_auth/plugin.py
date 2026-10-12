# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Web Bot Auth as a Reactor plugin.

Points it declares:

- ``web_bot_auth.signer`` — the :class:`HttpSigner` outbound requests are
  signed with. No default: the key is the host's (Vault transit in
  Datalayer), never the runtime's.
- ``web_bot_auth.nonceStore`` — where a verifier remembers nonces; default
  ``memory`` (one process).
- ``web_bot_auth.extension.directory``, ``web_bot_auth.extension.jwks_uri``,
  ``web_bot_auth.extension.cimd`` — the draft's ``Signature-Agent`` types,
  each an extension of the protocol: ``directory`` and ``jwks_uri`` default
  to this package's discoveries over ``httpx``; ``cimd`` (a client metadata
  document) has none, so a member of that type is unverified until a host
  contributes one.
"""

from __future__ import annotations

from typing import Any

from reactor import PluginManifest, PluginPlatform, define_contribution_point, hookimpl

from .. import DEFAULT_ORDER, DESCRIPTIONS, ProtocolDescription, first_contribution
from .keys import HttpSigner
from .sign import DISCOVERY_TYPES
from .verify import (
    DirectoryDiscovery,
    DirectoryResolver,
    InMemoryNonceStore,
    JwksUriDiscovery,
    NonceStore,
)

PLUGIN = "agent-runtimes.protocols.web-bot-auth"
SPECIFICATION = "draft-ietf-webbotauth-httpsig-protocol-00"

SIGNERS = define_contribution_point("web_bot_auth.signer")
NONCE_STORES = define_contribution_point("web_bot_auth.nonceStore")
#: One point per ``Signature-Agent`` type (the protocol's extensions).
DISCOVERIES = {
    discovery: define_contribution_point(f"web_bot_auth.extension.{discovery}")
    for discovery in DISCOVERY_TYPES
}
DIRECTORY_DISCOVERIES = DISCOVERIES["directory"]
JWKS_URI_DISCOVERIES = DISCOVERIES["jwks_uri"]
CIMD_DISCOVERIES = DISCOVERIES["cimd"]

POINTS = (SIGNERS, NONCE_STORES, *DISCOVERIES.values())

DESCRIPTION = ProtocolDescription(
    id="web_bot_auth",
    name="Web Bot Auth (HTTP Message Signatures for automated traffic)",
    layer="identity",
    version=SPECIFICATION,
    roles=("signer", "verifier", "directory"),
    status="implemented",
    specification="https://datatracker.ietf.org/doc/draft-ietf-webbotauth-httpsig-protocol/",
    plugin=PLUGIN,
    points=tuple(point.id for point in POINTS),
)


class WebBotAuthPlugin:
    """Contributes the protocol's description and its portable defaults."""

    @hookimpl
    def provide_contributions(self, contributions: Any) -> None:
        contribute = contributions.contribute
        contribute(
            DESCRIPTIONS,
            DESCRIPTION,
            contribution_id="web_bot_auth",
            order=DEFAULT_ORDER,
        )
        contribute(
            NONCE_STORES,
            InMemoryNonceStore(),
            contribution_id="memory",
            order=DEFAULT_ORDER,
        )
        contribute(
            DIRECTORY_DISCOVERIES,
            DirectoryDiscovery(),
            contribution_id="httpx",
            order=DEFAULT_ORDER,
        )
        contribute(
            JWKS_URI_DISCOVERIES,
            JwksUriDiscovery(),
            contribution_id="httpx",
            order=DEFAULT_ORDER,
        )


def plugin() -> tuple[PluginManifest, WebBotAuthPlugin]:
    """The entry point (``agent_runtimes.protocols``)."""
    return (
        PluginManifest(
            name=PLUGIN,
            version="1.0.0",
            description=f"Web Bot Auth ({SPECIFICATION}): sign an agent's requests, verify an agent's.",
            tags=["agent-protocols", "identity"],
            contribution_points=[point.id for point in POINTS],
        ),
        WebBotAuthPlugin(),
    )


def signer_of(platform: PluginPlatform) -> HttpSigner:
    """The host's signer; ``LookupError`` when the host contributed none."""
    return first_contribution(platform, SIGNERS, "Web Bot Auth signer")


def nonce_store_of(platform: PluginPlatform) -> NonceStore:
    return first_contribution(platform, NONCE_STORES, "Web Bot Auth nonce store")


def resolver_of(platform: PluginPlatform) -> DirectoryResolver:
    """A resolver over the discoveries contributed: one per type that has one."""
    discoveries = {}
    for discovery, point in DISCOVERIES.items():
        if platform.get_contributions(point):
            discoveries[discovery] = first_contribution(
                platform, point, f"Web Bot Auth {discovery} discovery"
            )
    return DirectoryResolver(discoveries=discoveries)


__all__ = [
    "CIMD_DISCOVERIES",
    "DESCRIPTION",
    "DIRECTORY_DISCOVERIES",
    "DISCOVERIES",
    "JWKS_URI_DISCOVERIES",
    "NONCE_STORES",
    "PLUGIN",
    "POINTS",
    "SIGNERS",
    "WebBotAuthPlugin",
    "nonce_store_of",
    "plugin",
    "resolver_of",
    "signer_of",
]
