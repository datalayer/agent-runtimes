# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
DBOS durable execution for one agent run, inside one runtime.

This wraps a PydanticAI agent so a run recovers from a transient failure
without losing its steps: DBOS in this process, against this runtime's own
database.

**This is not the platform's durable execution, and nothing new should be
built on it** (PLAN_ORCHESTRATOR.md, O0-16, and the decision recorded in
19.8). `datalayer-durable` is the control plane that owns durability for the
platform — an agent run, a benchmark run, a sandbox's whole life, an
approval, a scheduled notebook — because those outlive the pod that started
them, and a workflow whose state lives in one runtime's process cannot. The
orchestration control plane of Phase 1 is a catalog entry there, not a
second engine here.

What this keeps is the narrow case it was written for: a single agent run
recovering *within* one runtime, where the runtime is the boundary anyway.
Two callers use it today (`app.py` and `routes/agents.py`, both behind
configuration) and the item's rule is that no third is added.

Key components:
- ``DurableConfig`` — DBOS configuration (SQLite path, Postgres URL)
- ``wrap_agent_durable`` — Wrap a PydanticAI agent with DBOSAgent
- ``DurableLifecycle`` — DBOS launch/shutdown lifecycle management
"""

from .config import DurableConfig
from .lifecycle import DurableLifecycle
from .wrapper import wrap_agent_durable

__all__ = [
    "DurableConfig",
    "DurableLifecycle",
    "wrap_agent_durable",
]
