# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What every commerce protocol shares (AGENT_PROTOCOLS §3, *one approval model*).

A purchase over UCP or the Agentic Commerce Protocol is never one call: the
checkout becomes an exact, revisioned :class:`CheckoutProposal`, the person
approves it (a :class:`CheckoutApprover`, contributed by the host to each
protocol plugin's ``<protocol>.approver`` point), and it is completed once
(a :class:`ProposalStore` spends it). A host contributes the same approver
to both protocols, so a person approves the same way whichever carries the
purchase.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any, Optional, Protocol, runtime_checkable


def digest(what: Any) -> str:
    """The SHA-256 of a canonical JSON (sorted keys, no spaces): a proposal's revision."""
    canonical = json.dumps(what, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def operation_classes(protocol: str) -> dict[str, str]:
    """Each operation's action class (F-10) for Rules (R-05), as agentspecs classes
    a protocol's tools (``protocol-tools/<protocol>.yaml``, AGENT_PROTOCOLS PR-54).

    The table names the gateway's tools (``ucp_search``, ``acp_complete``): an
    operation is the tool's name without its connection's prefix. A commerce
    operation does one thing: one with several classes, or none, or a tool not
    under the prefix, is refused here rather than guessed.
    """
    from agent_runtimes.specs.actions import PROTOCOL_TOOL_CLASSES

    table = PROTOCOL_TOOL_CLASSES[protocol]
    prefix = f"{table['connection']}_"
    out: dict[str, str] = {}
    for name, classes in table["tools"].items():
        if len(classes) != 1:
            raise ValueError(
                f"{protocol} {name} is classed {classes!r}: one class each"
            )
        if not name.startswith(prefix):
            raise ValueError(f"{protocol} {name} is not one of its `{prefix}` tools")
        out[name[len(prefix) :]] = classes[0]
    return out


def money(amount: int, currency: str) -> str:
    return f"{currency} {amount / 100:,.2f}"


@dataclass(frozen=True)
class CheckoutProposal:
    """One exact purchase, proposed to a person before it is made.

    ``revision`` is the SHA-256 of what is bought — the line items, their
    quantities and prices, the totals and the currency — so a checkout that
    changed after the person approved is not completed under that approval.
    """

    id: str
    merchant: str
    checkout_id: str
    revision: str
    currency: str
    total: int
    lines: tuple[tuple[str, int, int], ...]
    expires_at: Optional[str] = None

    def summary(self) -> str:
        """In words, for the person and the model: never a credential."""
        items = ", ".join(f"{quantity} × {title}" for title, quantity, _ in self.lines)
        return f"Buy {items} at {self.merchant} for {money(self.total, self.currency)}"


@runtime_checkable
class CheckoutApprover(Protocol):
    """Asks the person (``ucp.approver``): ``True`` only when they approved this exact proposal."""

    async def approve(self, proposal: CheckoutProposal) -> bool: ...


@runtime_checkable
class ProposalStore(Protocol):
    """Spends a proposal once (``ucp.proposalStore``)."""

    async def take(self, proposal_id: str) -> bool: ...


class InMemoryProposalStore:
    """Spends proposals within one process."""

    def __init__(self) -> None:
        self._taken: set[str] = set()

    async def take(self, proposal_id: str) -> bool:
        if proposal_id in self._taken:
            return False
        self._taken.add(proposal_id)
        return True


__all__ = [
    "CheckoutApprover",
    "CheckoutProposal",
    "InMemoryProposalStore",
    "ProposalStore",
    "digest",
    "money",
    "operation_classes",
]
