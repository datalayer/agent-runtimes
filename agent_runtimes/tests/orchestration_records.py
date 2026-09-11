# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The canonical records the orchestration tests are written against.

One place to build an execution and an attempt, so that a test about the
store, a test about the A2A adapter and a test about the ACP adapter are all
talking about the same shape of work. The records come from
``datalayer_core.orchestration``; nothing here invents a field.
"""

from __future__ import annotations

from datalayer_core.orchestration import (
    AgentBinding,
    AgentProtocol,
    Attempt,
    ContextManifest,
    ContextReference,
    Execution,
    Objective,
    Trace,
)

#: A W3C traceparent, so a test can assert the trace reaches an artifact.
TRACEPARENT = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"

#: A versioned notebook, in the URI form 19.8 decided.
NOTEBOOK = "datalayer:notebook/nb-7@3"


def an_execution(
    *,
    execution_id: str = "exec_1",
    parent_execution_id: str | None = None,
    root_execution_id: str | None = None,
    protocol: AgentProtocol = AgentProtocol.A2A,
    agent_id: str = "notebook-validator",
    endpoint: str | None = "http://worker.test/api/v1/a2a/agents/validator",
    goal: str = "Validate the notebook from a clean sandbox",
    references: tuple[str, ...] = (NOTEBOOK,),
) -> Execution:
    """
    One execution, in the state a freshly created one is in.

    Parameters
    ----------
    execution_id : str
        Its identifier.
    parent_execution_id : str | None
        Its parent, when it is a child.
    root_execution_id : str | None
        Its tree; defaults to itself, as a root's does.
    protocol : AgentProtocol
        Which binding the worker speaks.
    agent_id : str
        Which worker.
    endpoint : str | None
        Where the worker answers.
    goal : str
        What it is being asked for.
    references : tuple[str, ...]
        The context URIs it is given.

    Returns
    -------
    Execution
        The execution.
    """
    return Execution(
        execution_id=execution_id,
        parent_execution_id=parent_execution_id,
        root_execution_id=root_execution_id or execution_id,
        depth=0 if parent_execution_id is None else 1,
        agent=AgentBinding(
            agent_id=agent_id,
            capability="notebook.validate",
            protocol=protocol,
            endpoint=endpoint,
        ),
        objective=Objective(
            goal=goal,
            acceptance_criteria=["Every cell runs", "No cell errors"],
            instructions="Run it top to bottom.",
        ),
        context=ContextManifest(
            references=[ContextReference(uri=uri) for uri in references]
        ),
        trace=Trace(traceparent=TRACEPARENT),
        created_at="2026-09-09T10:00:00+00:00",
        updated_at="2026-09-09T10:00:00+00:00",
    )


def an_attempt(
    execution: Execution,
    *,
    attempt_id: str = "att_1",
    number: int = 1,
    session_id: str | None = None,
    protocol_task_id: str | None = None,
    resumed_from: str | None = None,
) -> Attempt:
    """
    One dispatch of an execution to a worker.

    Parameters
    ----------
    execution : Execution
        The execution being dispatched.
    attempt_id : str
        Its identifier, which is what tells a retry from a duplicate.
    number : int
        1 for the first dispatch, then upwards.
    session_id : str | None
        The protocol session, when the attempt already has one.
    protocol_task_id : str | None
        The protocol task, when the attempt already has one.
    resumed_from : str | None
        The checkpoint the attempt resumes from, when a resume sent it.

    Returns
    -------
    Attempt
        The attempt.
    """
    return Attempt(
        attempt_id=attempt_id,
        execution_id=execution.execution_id,
        number=number,
        agent_id=execution.agent.agent_id,
        protocol=execution.agent.protocol,
        session_id=session_id,
        protocol_task_id=protocol_task_id,
        resumed_from=resumed_from,
    )
