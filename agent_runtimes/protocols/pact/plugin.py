# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""PACT 1.0 as a Reactor plugin (AGENT_PROTOCOLS §3.1, PR-10 to PR-13).

Points it declares:

- ``pact.signer`` — signs the personal-agent JWT (ES256). No default: the
  key is the host's (Vault transit on Datalayer), as Web Bot Auth's is.
- ``pact.delegationStore`` — holds delegation tokens by (Brand, user);
  default ``memory``. On Datalayer, IAM custody (PI-11).
- ``pact.receiptStore`` — keeps the receipts a Brand signs; default
  ``memory``. On Datalayer, the application's record (R-07).
- ``pact.extension.delegated`` — the *Delegated* profile (§5), PACT's one
  optional part: default ``device-code``, RFC 8628 as §5.3 says. Without a
  contribution here, a personal agent speaks the *Identity* profile alone
  (:func:`profile_of`).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from reactor import PluginManifest, PluginPlatform, define_contribution_point, hookimpl

from .. import DEFAULT_ORDER, DESCRIPTIONS, ProtocolDescription, first_contribution
from .client import (
    DEVICE_CODE_GRANT,
    PACT_VERSION,
    DelegationStore,
    InMemoryDelegationStore,
    InMemoryReceiptStore,
    ReceiptStore,
)

PLUGIN = "agent-runtimes.protocols.pact"

SIGNERS = define_contribution_point("pact.signer")
DELEGATION_STORES = define_contribution_point("pact.delegationStore")
RECEIPT_STORES = define_contribution_point("pact.receiptStore")
DELEGATED = define_contribution_point("pact.extension.delegated")
POINTS = (SIGNERS, DELEGATION_STORES, RECEIPT_STORES, DELEGATED)


@dataclass(frozen=True)
class DelegatedProfile:
    """An implementation of the *Delegated* profile: how a token is obtained."""

    grant_type: str = DEVICE_CODE_GRANT


DESCRIPTION = ProtocolDescription(
    id="pact",
    name="Personal Agent Consent & Trust",
    layer="consent",
    version=PACT_VERSION,
    roles=("personal-agent", "provider"),
    status="partial",
    specification="https://github.com/openpactprotocol/openpactprotocol/blob/main/docs/spec.md",
    plugin=PLUGIN,
    points=tuple(point.id for point in POINTS),
)


class PactPlugin:
    """Contributes PACT's description and its portable defaults."""

    @hookimpl
    def provide_contributions(self, contributions: Any) -> None:
        contribute = contributions.contribute
        contribute(
            DESCRIPTIONS, DESCRIPTION, contribution_id="pact", order=DEFAULT_ORDER
        )
        contribute(
            DELEGATION_STORES,
            InMemoryDelegationStore(),
            contribution_id="memory",
            order=DEFAULT_ORDER,
        )
        contribute(
            RECEIPT_STORES,
            InMemoryReceiptStore(),
            contribution_id="memory",
            order=DEFAULT_ORDER,
        )
        contribute(
            DELEGATED,
            DelegatedProfile(),
            contribution_id="device-code",
            order=DEFAULT_ORDER,
        )


def plugin() -> tuple[PluginManifest, PactPlugin]:
    """The PACT plugin, as the ``agent-protocols`` Extension delivers it."""
    return (
        PluginManifest(
            name=PLUGIN,
            version="1.0.0",
            description=f"PACT {PACT_VERSION}: a personal agent at a business, and what the person let it do.",
            tags=["agent-protocols", "consent"],
            contribution_points=[point.id for point in POINTS],
        ),
        PactPlugin(),
    )


def signer_of(platform: PluginPlatform) -> Any:
    return first_contribution(platform, SIGNERS, "PACT signer")


def delegation_store_of(platform: PluginPlatform) -> DelegationStore:
    return first_contribution(platform, DELEGATION_STORES, "PACT delegation store")


def receipt_store_of(platform: PluginPlatform) -> ReceiptStore:
    return first_contribution(platform, RECEIPT_STORES, "PACT receipt store")


def profile_of(platform: PluginPlatform) -> str:
    """``delegated`` when the profile is contributed, else ``identity``."""
    return "delegated" if platform.get_contributions(DELEGATED) else "identity"


__all__ = [
    "DELEGATED",
    "DELEGATION_STORES",
    "DESCRIPTION",
    "DelegatedProfile",
    "PLUGIN",
    "POINTS",
    "PactPlugin",
    "RECEIPT_STORES",
    "SIGNERS",
    "delegation_store_of",
    "plugin",
    "profile_of",
    "receipt_store_of",
    "signer_of",
]
