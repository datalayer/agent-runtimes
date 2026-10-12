# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The Agentic Commerce Protocol, ``2026-04-17`` (AGENT_PROTOCOLS PR-40 to PR-43).

Never ``acp`` in code: that is the Agent Client Protocol (PR-40). Models
generated from the specification's JSON Schema (:mod:`.models`, PR-41), a
client (:mod:`.client`), the protocol as a Reactor plugin (:mod:`.plugin`),
and a local test seller (:mod:`.merchant`).

Action classes (F-10): ``propose_completion`` and ``get_checkout`` are
``read``; creating, updating and cancelling a session are ``write``;
``complete`` is ``buy``.
"""

from ..commerce import operation_classes
from .client import (
    AGENTIC_COMMERCE_VERSION,
    DISCOVERY_PATH,
    AgenticCommerceClient,
    AgenticCommerceError,
    PaymentData,
    SellerCredentials,
    SellerDiscovery,
    revision_of,
    session_summary,
)

#: Each operation's action class (F-10), for Rules (R-05): agentspecs'
#: ``protocol-tools/agentic-commerce.yaml`` (AGENT_PROTOCOLS PR-54).
ACTION_CLASSES = operation_classes("agentic-commerce")

__all__ = [
    "ACTION_CLASSES",
    "AGENTIC_COMMERCE_VERSION",
    "AgenticCommerceClient",
    "AgenticCommerceError",
    "DISCOVERY_PATH",
    "PaymentData",
    "SellerCredentials",
    "SellerDiscovery",
    "revision_of",
    "session_summary",
]
