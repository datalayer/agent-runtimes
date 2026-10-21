# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What agent-runtimes contributes to the session's points (MH-F01).

One function, :func:`contribute_builtins`, called by the built-in plugin's
``provide_contributions``: the harness catalogue to ``harness`` (MH-F02),
the stores to ``session.store`` (MH-F03), ``datalayer-session/1`` to
``session.format`` (MH-F04), the default policy to ``session.carry``
(MH-F05), the audit rows and the OTEL spans to ``session.hook`` (MH-F06).
Each lands here as its box does; nothing is contributed twice.
"""

from __future__ import annotations

from typing import Any

from agent_runtimes.plugins.points import HARNESSES, HarnessContribution


def catalogue_harnesses() -> list[HarnessContribution]:
    """The catalogue's harnesses, each with the ACP adapter that drives it."""
    from agent_runtimes.adapters.acp_agent import harness_agent
    from agent_runtimes.specs.harnesses import HARNESS_CATALOGUE

    return [
        HarnessContribution(spec=spec, adapter=harness_agent)
        for spec in HARNESS_CATALOGUE.values()
    ]


def contribute_builtins(contributions: Any, *, order: int = 100) -> None:
    """Contribute today's implementations, as the built-in plugin."""
    for harness in catalogue_harnesses():
        contributions.contribute(
            HARNESSES, harness, contribution_id=harness.id, order=order
        )


__all__ = ["catalogue_harnesses", "contribute_builtins"]
