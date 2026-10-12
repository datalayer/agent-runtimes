# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The Universal Commerce Protocol, ``2026-08-25`` (AGENT_PROTOCOLS PR-30 to PR-32).

A shopping client over the REST binding, read through ``ucp-sdk``'s models
(:mod:`.client`); UCP as a Reactor plugin whose approver, payment instruments,
proposal store and capability extensions are contribution points
(:mod:`.plugin`); and a local test merchant (:mod:`.merchant`). A purchase is
an exact, revisioned proposal, approved by the person, completed once.

Tools and their action classes (F-10): ``search`` and ``propose`` are
``read``; ``create``, ``update`` and ``cancel`` a checkout are ``write``;
``complete`` is ``buy``.
"""

from ..commerce import operation_classes
from .client import (
    CHECKOUT_CAPABILITY,
    PROFILE_PATH,
    SHOPPING_SERVICE,
    UCP_VERSION,
    BusinessProfile,
    CheckoutApprover,
    CheckoutProposal,
    InMemoryProposalStore,
    PaymentInstruments,
    ProposalStore,
    UcpClient,
    UcpError,
    checkout_summary,
    revision_of,
)

#: Each operation's action class (F-10), for Rules (R-05): agentspecs'
#: ``protocol-tools/ucp.yaml`` (AGENT_PROTOCOLS PR-54).
ACTION_CLASSES = operation_classes("ucp")

__all__ = [
    "ACTION_CLASSES",
    "CHECKOUT_CAPABILITY",
    "PROFILE_PATH",
    "SHOPPING_SERVICE",
    "UCP_VERSION",
    "BusinessProfile",
    "CheckoutApprover",
    "CheckoutProposal",
    "InMemoryProposalStore",
    "PaymentInstruments",
    "ProposalStore",
    "UcpClient",
    "UcpError",
    "checkout_summary",
    "revision_of",
]
