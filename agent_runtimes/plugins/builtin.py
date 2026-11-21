# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What agent-runtimes contributes to the session's points.

One function, :func:`contribute_builtins`, called by the built-in plugin's
``provide_contributions``: the stores to ``session.store``, ``datalayer-session/1`` to
``session.format``, the default policy to ``session.carry``,
the audit rows and the OTEL spans to ``session.hook``,
the ``agentcore`` target to ``runtime.target``, and the
``datalayer`` and ``agentcore`` providers to ``identity.provider``.
Each lands here as its box does; nothing is contributed twice. The
harnesses of the catalogue are each a plugin of their own
(:mod:`agent_runtimes.plugins.harnesses`), whose manifest is its spec.
"""

from __future__ import annotations

from typing import Any

from agent_runtimes.plugins.points import (
    IDENTITY_PROVIDERS,
    RUNTIME_TARGETS,
    SESSION_CARRY,
    SESSION_FORMATS,
    SESSION_HOOKS,
    SESSION_STORES,
)


def contribute_builtins(contributions: Any, *, order: int = 0) -> None:
    """Contribute today's implementations, as the built-in plugin."""
    from agent_runtimes.apps.session_store import FILE_STORE, RECORD_STORE

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
    from agent_runtimes.agentcore.identity import AGENTCORE_IDENTITY
    from agent_runtimes.agentcore.target import AGENTCORE_TARGET
    from agent_runtimes.identity.datalayer import DATALAYER_IDENTITY

    contributions.contribute(
        RUNTIME_TARGETS,
        AGENTCORE_TARGET,
        contribution_id=AGENTCORE_TARGET.id,
        order=order,
    )
    for provider in (DATALAYER_IDENTITY, AGENTCORE_IDENTITY):
        contributions.contribute(
            IDENTITY_PROVIDERS, provider, contribution_id=provider.id, order=order
        )


__all__ = ["contribute_builtins"]
