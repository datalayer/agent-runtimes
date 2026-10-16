# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""UCP as a Reactor plugin (PR-30 to PR-32).

Points it declares:

- ``ucp.approver`` — asks the person to approve one exact purchase. No
  default: without one, nothing is ever bought (Datalayer: tool approvals,
  U-19, and approvals in advance, U-25).
- ``ucp.paymentInstruments`` — the payment instrument of an approved
  purchase. No default: the host holds payment tokens (IAM custody, PI-11).
- ``ucp.proposalStore`` — spends a proposal once; default ``memory``.
- ``ucp.extension.fulfillment``, ``ucp.extension.discount``,
  ``ucp.extension.buyer_consent`` — UCP's capability extensions of checkout
  (``dev.ucp.shopping.fulfillment``, ``.discount``, ``.buyer_consent``),
  each a contribution point; none has a default yet, so a platform built
  from this plugin negotiates checkout alone (:func:`negotiate_capabilities`).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

from reactor import PluginManifest, PluginPlatform, define_contribution_point, hookimpl

from .. import DEFAULT_ORDER, DESCRIPTIONS, ProtocolDescription, first_contribution
from .client import (
    CHECKOUT_CAPABILITY,
    UCP_VERSION,
    CheckoutApprover,
    InMemoryProposalStore,
    PaymentInstruments,
    ProposalStore,
)

PLUGIN = "agent-runtimes.protocols.ucp"

APPROVERS = define_contribution_point("ucp.approver")
PAYMENT_INSTRUMENTS = define_contribution_point("ucp.paymentInstruments")
PROPOSAL_STORES = define_contribution_point("ucp.proposalStore")
#: UCP's capability extensions, by the name of their point.
EXTENSIONS = {
    "fulfillment": define_contribution_point("ucp.extension.fulfillment"),
    "discount": define_contribution_point("ucp.extension.discount"),
    "buyer_consent": define_contribution_point("ucp.extension.buyer_consent"),
}
FULFILLMENT = EXTENSIONS["fulfillment"]
DISCOUNT = EXTENSIONS["discount"]
BUYER_CONSENT = EXTENSIONS["buyer_consent"]
POINTS = (APPROVERS, PAYMENT_INSTRUMENTS, PROPOSAL_STORES, *EXTENSIONS.values())


@dataclass(frozen=True)
class UcpExtension:
    """An implementation of one UCP capability extension, as a platform supports it."""

    capability: str
    version: str = UCP_VERSION


DESCRIPTION = ProtocolDescription(
    id="ucp",
    name="Universal Commerce Protocol",
    layer="commerce",
    version=UCP_VERSION,
    roles=("shopper",),
    status="partial",
    specification=f"https://ucp.dev/{UCP_VERSION}/specification/overview",
    plugin=PLUGIN,
    catalogue="ucp",
    points=tuple(point.id for point in POINTS),
)


class UcpPlugin:
    """Contributes UCP's description and its one portable default."""

    @hookimpl
    def provide_contributions(self, contributions: Any) -> None:
        contribute = contributions.contribute
        contribute(
            DESCRIPTIONS, DESCRIPTION, contribution_id="ucp", order=DEFAULT_ORDER
        )
        contribute(
            PROPOSAL_STORES,
            InMemoryProposalStore(),
            contribution_id="memory",
            order=DEFAULT_ORDER,
        )


def plugin() -> tuple[PluginManifest, UcpPlugin]:
    """The UCP plugin, as the ``agent-protocols`` Extension delivers it."""
    return (
        PluginManifest(
            name=PLUGIN,
            version="1.0.0",
            description=f"Universal Commerce Protocol {UCP_VERSION}: shop, propose, buy once approved.",
            tags=["agent-protocols", "commerce"],
            contribution_points=[point.id for point in POINTS],
        ),
        UcpPlugin(),
    )


def approver_of(platform: PluginPlatform) -> CheckoutApprover:
    return first_contribution(platform, APPROVERS, "UCP approver")


def instruments_of(platform: PluginPlatform) -> PaymentInstruments:
    return first_contribution(platform, PAYMENT_INSTRUMENTS, "UCP payment instruments")


def proposal_store_of(platform: PluginPlatform) -> ProposalStore:
    return first_contribution(platform, PROPOSAL_STORES, "UCP proposal store")


def negotiate_capabilities(
    profile: Mapping[str, Any], platform: PluginPlatform
) -> list[str]:
    """The capabilities in use with a business: checkout, and the extensions both support.

    ``profile`` is the business's ``/.well-known/ucp`` document.
    """
    offered = set(profile.get("ucp", {}).get("capabilities", {}))
    if CHECKOUT_CAPABILITY not in offered:
        raise ValueError("the business offers no checkout")
    active = [CHECKOUT_CAPABILITY]
    for point in EXTENSIONS.values():
        contributions = platform.get_contributions(point)
        if contributions and contributions[0].value.capability in offered:
            active.append(contributions[0].value.capability)
    return active


__all__ = [
    "APPROVERS",
    "BUYER_CONSENT",
    "DESCRIPTION",
    "DISCOUNT",
    "EXTENSIONS",
    "FULFILLMENT",
    "PAYMENT_INSTRUMENTS",
    "PLUGIN",
    "POINTS",
    "PROPOSAL_STORES",
    "UcpExtension",
    "UcpPlugin",
    "approver_of",
    "instruments_of",
    "negotiate_capabilities",
    "plugin",
    "proposal_store_of",
]
