# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A gateway-started run, as its own execution (ORCHESTRATOR.md, O4-05).

MCP stays the tool and context protocol; a `tools/call` the gateway routes
straight to a durable workflow (`NotebookRunWorkflow` and its kin, over
`jupyter-mcp-server`'s `create_run`) never goes through the orchestration
control plane at all — it has no agent, no objective, no worker to resolve,
so it was never an `ExecutionsDelegate`. Its only record used to be its
`mcp_task` row, `tsk_…`, which is why such a run showed on the Tasks surface
and nowhere under `/executions`: the two surfaces were never the same object,
by construction, for this kind of work (unlike a team's or an agentspec's
run, which O4-05's other half — `_project_execution_task` in
`activities_orchestration.py` — already projects the other way).

A *shadow* execution closes that gap without pretending the work is
something it is not: the tool itself stands in for the worker
(`AgentBinding(agent_id=f"mcp:{tool}", protocol=AgentProtocol.DATALAYER)`),
its objective names the call, and it is recorded already working — assigned
and on its first attempt — because by the time a caller here knows the
durable workflow started, it already has. Nothing here dispatches anything:
`store.set_state(..., LifecycleEvent.ASSIGN)` and `store.record_attempt`
are exactly what `resolve_worker` (durable's own orchestration step) already
calls once a worker is found, called here for a worker — the tool call
itself — that was never resolved because it needed no resolving.

Both ends of a shadow's own lifecycle reach the same `ExecutionStore` a
caller already holds (jupyter-mcp-server and durable both depend on
agent-runtimes and datalayer-solr already, and durable's own orchestration
steps construct `datalayer_solr.orchestration.SolrExecutionStore` the same
way) — no new HTTP surface, no new service credential, the same store every
other execution is written to.
"""

from __future__ import annotations

import uuid
from typing import Literal

from datalayer_core.orchestration import (
    AgentBinding,
    AgentProtocol,
    Attempt,
    Execution,
    LifecycleEvent,
    Objective,
)

from agent_runtimes.orchestration.adapter import Observation, now
from agent_runtimes.orchestration.store import ExecutionStore

#: The outcome an ended gateway task closes a shadow execution with, mapped
#: onto the one lifecycle event that reaches it (`_ALWAYS`, every non-terminal
#: state accepts these) — the same three a worker's own report can end on.
_OUTCOME_EVENTS: dict[str, LifecycleEvent] = {
    "completed": LifecycleEvent.COMPLETE,
    "failed": LifecycleEvent.FAIL,
    "cancelled": LifecycleEvent.CANCEL,
}

#: The idempotency key a shadow is created under: one gateway task, one
#: shadow, found again rather than duplicated by a retried call (O2-01's
#: rule, reused here for a root that is not a delegation).
_KEY_PREFIX = "mcp-shadow:"


def shadow_idempotency_key(task_uid: str) -> str:
    """The key `open_shadow_execution` and a later lookup both use."""
    return f"{_KEY_PREFIX}{task_uid}"


async def open_shadow_execution(
    store: ExecutionStore, *, tool: str, task_uid: str, message: str = ""
) -> Execution:
    """Record `task_uid`'s run as its own root execution, already working.

    Idempotent: a retried call for the same `task_uid` finds the shadow the
    first call made rather than creating a second one, the same guarantee
    `executions.delegate` gives a retried delegation.

    Parameters
    ----------
    store : ExecutionStore
        The account's store — `SolrExecutionStore(account_uid=…)` in every
        real caller, a memory store in tests.
    tool : str
        The MCP tool the call named; becomes the shadow's agent id,
        capability and part of its objective.
    task_uid : str
        The `mcp_task` row's own uid (`tsk_…`) — what correlates the two
        surfaces, and the shadow's idempotency key.
    message : str
        Why it is assigned, for the execution's own event log; a sensible
        default is used when empty.

    Returns
    -------
    Execution
        The shadow, already `assigned` with one open attempt.
    """
    idempotency_key = shadow_idempotency_key(task_uid)
    existing = await store.find_by_idempotency_key(idempotency_key)
    if existing is not None:
        return existing
    execution_id = f"exec_{uuid.uuid4().hex}"
    stamp = now()
    agent = AgentBinding(agent_id=f"mcp:{tool}", capability=tool, protocol=AgentProtocol.DATALAYER)
    execution = Execution(
        execution_id=execution_id,
        root_execution_id=execution_id,
        agent=agent,
        objective=Objective(goal=f"MCP tool call: {tool} ({task_uid})"),
        created_at=stamp,
        updated_at=stamp,
    )
    execution = await store.create(execution, idempotency_key=idempotency_key)
    execution = await store.set_state(
        execution.execution_id,
        LifecycleEvent.ASSIGN,
        message=message or f"Started by the gateway as its own run, {task_uid}.",
    )
    await store.record_attempt(
        Attempt(
            attempt_id=f"att_{execution.execution_id.removeprefix('exec_')}_1",
            execution_id=execution.execution_id,
            number=1,
            agent_id=agent.agent_id,
            protocol=agent.protocol,
            state=execution.status,
            started_at=stamp,
        )
    )
    # A real worker reaches `running` on its own first report — an A2A
    # "working" status becomes `LifecycleEvent.START` in `adapters/a2a.py`,
    # for instance. A shadow has no worker to report that, and by the time
    # this runs the gateway's own workflow call has already succeeded, so
    # the move is made here explicitly rather than left never to happen.
    execution = await store.set_state(
        execution.execution_id,
        LifecycleEvent.START,
        attempt_id=execution.current_attempt_id,
        message="The gateway's own run is under way.",
    )
    return execution


async def close_shadow_execution(
    store: ExecutionStore,
    *,
    task_uid: str,
    outcome: Literal["completed", "failed", "cancelled"],
    message: str = "",
) -> Execution | None:
    """End `task_uid`'s shadow the way its gateway task ended.

    `None` when `task_uid` names no shadow — an ordinary, expected answer
    for every task that was never routed to durable in the first place, not
    a failure to log.

    Parameters
    ----------
    store : ExecutionStore
        The same account's store `open_shadow_execution` was given.
    task_uid : str
        The `mcp_task` row's own uid.
    outcome : "completed" | "failed" | "cancelled"
        What the gateway task ended as.
    message : str
        Why, for the execution's own event log.

    Returns
    -------
    Execution | None
        The shadow as it ended, or `None` when there was none to close.
    """
    shadow = await store.find_by_idempotency_key(shadow_idempotency_key(task_uid))
    if shadow is None:
        return None
    await store.record(
        shadow.execution_id,
        Observation.moved(_OUTCOME_EVENTS[outcome], message=message or None),
    )
    return await store.get(shadow.execution_id)
