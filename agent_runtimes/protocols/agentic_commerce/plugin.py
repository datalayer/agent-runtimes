# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The Agentic Commerce Protocol as a Reactor plugin (PR-40 to PR-43).

Points it declares:

- ``agentic_commerce.approver`` — asks the person to approve one exact
  purchase. No default: without one, nothing is bought. A host contributes
  the same approver it gives ``ucp.approver``: one approval model.
- ``agentic_commerce.paymentData`` — the delegated payment data of an
  approved purchase (an ``spt`` token from custody). No default.
- ``agentic_commerce.credentials`` — the agent's bearer credential with a
  seller. No default: the host holds it.
- ``agentic_commerce.proposalStore`` — spends a proposal once; default ``memory``.
- ``agentic_commerce.extension.discount`` — the specification's discount
  extension (``rfc.discount_extension``); ``agentic_commerce.extension.other``
  — any other extension, by its name. No defaults: an agent declares in
  ``capabilities.extensions`` only what is contributed
  (:func:`declared_extensions`).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from reactor import PluginManifest, PluginPlatform, define_contribution_point, hookimpl

from .. import DEFAULT_ORDER, DESCRIPTIONS, ProtocolDescription, first_contribution
from ..commerce import CheckoutApprover, InMemoryProposalStore, ProposalStore
from .client import AGENTIC_COMMERCE_VERSION, PaymentData, SellerCredentials

PLUGIN = "agent-runtimes.protocols.agentic-commerce"

APPROVERS = define_contribution_point("agentic_commerce.approver")
PAYMENT_DATA = define_contribution_point("agentic_commerce.paymentData")
CREDENTIALS = define_contribution_point("agentic_commerce.credentials")
PROPOSAL_STORES = define_contribution_point("agentic_commerce.proposalStore")
DISCOUNT = define_contribution_point("agentic_commerce.extension.discount")
OTHER = define_contribution_point("agentic_commerce.extension.other")
POINTS = (APPROVERS, PAYMENT_DATA, CREDENTIALS, PROPOSAL_STORES, DISCOUNT, OTHER)


@dataclass(frozen=True)
class AgenticCommerceExtension:
    """An implementation of one extension of the protocol, by the name sellers declare."""

    name: str


DESCRIPTION = ProtocolDescription(
    id="agentic_commerce",
    name="Agentic Commerce Protocol",
    layer="commerce",
    version=AGENTIC_COMMERCE_VERSION,
    roles=("buyer",),
    status="partial",
    specification="https://github.com/agentic-commerce-protocol/agentic-commerce-protocol/tree/main/spec/2026-04-17",
    plugin=PLUGIN,
    catalogue="acp",
    points=tuple(point.id for point in POINTS),
)


class AgenticCommercePlugin:
    """Contributes the protocol's description and its one portable default."""

    @hookimpl
    def provide_contributions(self, contributions: Any) -> None:
        contribute = contributions.contribute
        contribute(
            DESCRIPTIONS,
            DESCRIPTION,
            contribution_id="agentic_commerce",
            order=DEFAULT_ORDER,
        )
        contribute(
            PROPOSAL_STORES,
            InMemoryProposalStore(),
            contribution_id="memory",
            order=DEFAULT_ORDER,
        )


def plugin() -> tuple[PluginManifest, AgenticCommercePlugin]:
    """The plugin, as the ``agent-protocols`` Extension delivers it."""
    return (
        PluginManifest(
            name=PLUGIN,
            version="1.0.0",
            description=f"Agentic Commerce Protocol {AGENTIC_COMMERCE_VERSION}: buy once approved.",
            tags=["agent-protocols", "commerce"],
            contribution_points=[point.id for point in POINTS],
        ),
        AgenticCommercePlugin(),
    )


def approver_of(platform: PluginPlatform) -> CheckoutApprover:
    return first_contribution(platform, APPROVERS, "Agentic Commerce approver")


def payment_data_of(platform: PluginPlatform) -> PaymentData:
    return first_contribution(platform, PAYMENT_DATA, "Agentic Commerce payment data")


def credentials_of(platform: PluginPlatform) -> SellerCredentials:
    return first_contribution(platform, CREDENTIALS, "Agentic Commerce credentials")


def proposal_store_of(platform: PluginPlatform) -> ProposalStore:
    return first_contribution(
        platform, PROPOSAL_STORES, "Agentic Commerce proposal store"
    )


def declared_extensions(platform: PluginPlatform) -> tuple[str, ...]:
    """The extensions an agent declares to a seller: those contributed here."""
    names: list[str] = []
    discount = platform.get_contributions(DISCOUNT)
    if discount:
        names.append(discount[0].value.name)
    names.extend(
        contribution.value.name for contribution in platform.get_contributions(OTHER)
    )
    return tuple(dict.fromkeys(names))


__all__ = [
    "APPROVERS",
    "AgenticCommerceExtension",
    "AgenticCommercePlugin",
    "CREDENTIALS",
    "DESCRIPTION",
    "DISCOUNT",
    "OTHER",
    "PAYMENT_DATA",
    "PLUGIN",
    "POINTS",
    "PROPOSAL_STORES",
    "approver_of",
    "credentials_of",
    "declared_extensions",
    "payment_data_of",
    "plugin",
    "proposal_store_of",
]
