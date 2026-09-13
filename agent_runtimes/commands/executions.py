# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The ``executions`` command group, mirrored here so it is reachable through
the standalone ``agent-runtimes`` / ``datalayer-agents`` CLI too, not only
through ``datalayer`` (ORCHESTRATOR.md, O1-13).

The commands — ``run``, ``watch``, ``steer``, ``pause``, ``resume``,
``cancel``, ``artifacts`` — are core's own: ``datalayer_core.cli.commands.
executions`` is already the one implementation, over ``OrchestrationMixin``'s
client, of what it means to delegate work and watch it. Reusing that
``Typer`` app directly, rather than building a second one, is what keeps the
two CLIs from drifting apart: a fix to one is a fix to both, because there is
only one.

When both are installed, the Datalayer CLI's own reactor merges a plugin
group into whichever one it already has by that name (``_ExtensionHost`` in
``datalayer_core.cli.__main__``) — every command here is already
``datalayer``'s own, so nothing is added there, and this module earns its
keep on the standalone entry points (``agent-runtimes``, ``datalayer-agents``,
``loop``, ``l``), which have no ``executions`` group of their own to merge
into.
"""

from __future__ import annotations

from datalayer_core.cli.commands.executions import app

__all__ = ["app"]
