# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Orchestration in agent-runtimes (PLAN_ORCHESTRATOR.md, O0-04 to O0-07).

The canonical model is not here. It is
``datalayer_core.orchestration`` — the agent descriptor, the execution and
its attempts, the context manifest, the artifacts, the lifecycle, the twelve
commands, the five acknowledgements, the event envelope and the errors — and
19.8 put it there because ``core`` is the typed client the app, the CLI and
the services already share, and a second copy of those types in this
repository is how the two would drift. Nothing in this package restates a
state, a command name or a field of it.

What is here is what stands between that model and a real worker:

- ``store``: where executions, attempts, events, acknowledgements and
  artifacts live, behind the ``ExecutionStore`` port. In Phase 0 that is a
  dictionary; in Phase 1 it is Solr (O1-02), and only the implementation
  changes because ``durable``, ``runtimes`` and ``jupyter-mcp-server``
  already consume this package in process.
- ``adapter``: the ``WorkerAdapter`` port of section 7, where an adapter
  reports what it saw and says out loud what it cannot do.
- ``adapters.a2a`` and ``adapters.acp``: the two bindings, built on the A2A
  and ACP clients this repository already has.

The adapters are not imported here. Each pulls in its protocol's client, and
a caller that wants one asks for it by name; importing this package should
not decide which protocol libraries a process loads.
"""

from agent_runtimes.orchestration.adapter import (
    AdapterCapabilities,
    Observation,
    OperationOutcome,
    Performed,
    ResolvedWorker,
    Unsupported,
    WorkerAdapter,
    answer_artifact,
    capability_report,
    now,
    objective_prompt,
    trace_id_of,
)
from agent_runtimes.orchestration.store import (
    ExecutionConflict,
    ExecutionNotFound,
    ExecutionStore,
    ExecutionStoreError,
    InMemoryExecutionStore,
    event_for,
)

__all__ = [
    "AdapterCapabilities",
    "ExecutionConflict",
    "ExecutionNotFound",
    "ExecutionStore",
    "ExecutionStoreError",
    "InMemoryExecutionStore",
    "Observation",
    "OperationOutcome",
    "Performed",
    "ResolvedWorker",
    "Unsupported",
    "WorkerAdapter",
    "answer_artifact",
    "capability_report",
    "event_for",
    "now",
    "objective_prompt",
    "trace_id_of",
]
