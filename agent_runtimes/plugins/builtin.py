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

from agent_runtimes.plugins.points import (
    HARNESSES,
    SESSION_CARRY,
    SESSION_FORMATS,
    SESSION_HOOKS,
    SESSION_STORES,
    HarnessContribution,
)


def catalogue_harnesses() -> list[HarnessContribution]:
    """The catalogue's harnesses, each with the ACP adapter that drives it."""
    from agent_runtimes.adapters.acp_agent import acp_harness_agent
    from agent_runtimes.specs.harnesses import HARNESS_CATALOGUE

    return [
        HarnessContribution(spec=spec, adapter=acp_harness_agent)
        for spec in HARNESS_CATALOGUE.values()
    ]


def contribute_builtins(contributions: Any, *, order: int = 0) -> None:
    """Contribute today's implementations, as the built-in plugin."""
    from agent_runtimes.apps.session_store import FILE_STORE, RECORD_STORE

    for harness in catalogue_harnesses():
        contributions.contribute(
            HARNESSES, harness, contribution_id=harness.id, order=order
        )
    for store in (RECORD_STORE, FILE_STORE):
        contributions.contribute(
            SESSION_STORES, store, contribution_id=store.name, order=order
        )
    from agent_runtimes.apps.session_carry import DEFAULT_CARRY
    from agent_runtimes.apps.session_files import DATALAYER_SESSION_FORMAT
    from agent_runtimes.apps.session_hooks import AUDIT_HOOK, OTEL_HOOK

    contributions.contribute(
        SESSION_FORMATS,
        DATALAYER_SESSION_FORMAT,
        contribution_id=DATALAYER_SESSION_FORMAT.id,
        order=order,
    )
    contributions.contribute(
        SESSION_CARRY, DEFAULT_CARRY, contribution_id="default", order=order
    )
    for hook in (AUDIT_HOOK, OTEL_HOOK):
        contributions.contribute(
            SESSION_HOOKS, hook, contribution_id=hook.name, order=order
        )


__all__ = ["catalogue_harnesses", "contribute_builtins"]
