# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Following an execution the control plane runs, from outside it.

What a worker asking for a child does (O2-06), and what the orchestrator
answering an ACP turn does with the root it delegated (O2-08): read the
execution's events as they happen, stop it when the caller stops, and answer
with what its completing attempt produced. Core's orchestration client
subscribes with a blocking iterator, so the events are read in a thread and
handed to the loop.
"""

from __future__ import annotations

import asyncio
import contextlib
from typing import Any, Callable

from datalayer_core.orchestration import (
    Execution,
    ExecutionEvent,
    ExecutionEventType,
    ExecutionsCancel,
    ExecutionsCollect,
    ExecutionState,
)


def orchestration_client(token: str) -> Any:
    """
    Core's orchestration client, asking as whoever holds ``token``.

    A worker's execution token, when a run asks for a child (O2-06); the
    person's, when the orchestrator delegates a turn (O2-08).

    Parameters
    ----------
    token : str
        The bearer token to ask with.

    Returns
    -------
    Any
        The client, pointed at the platform the environment names.
    """
    from datalayer_core.utils.urls import DatalayerURLs

    from ..client.agent_client import AgentClient

    return AgentClient(urls=DatalayerURLs.from_environment(), api_key=token)


async def follow_execution(
    client: Any,
    execution: Execution,
    *,
    account_uid: str | None,
    on_event: Callable[[ExecutionEvent], None],
    cancel: ExecutionsCancel,
    include_children: bool = False,
) -> str:
    """
    Follow an execution to its end, and answer with the text of what it produced.

    Parameters
    ----------
    client : Any
        Core's orchestration client, holding the caller's token.
    execution : Execution
        The execution, as the control plane answered its delegation.
    account_uid : str | None
        The account it belongs to.
    on_event : Callable[[ExecutionEvent], None]
        Handed every event as it arrives: the execution's, and with
        ``include_children`` those of the executions below it.
    cancel : ExecutionsCancel
        Sent when the caller stops before the execution has ended.
    include_children : bool
        Whether the executions below it are followed too.

    Returns
    -------
    str
        The text of the artifacts its completing attempt produced.

    Raises
    ------
    RuntimeError
        When it did not complete, saying how it ended.
    """
    followed = execution.execution_id
    loop = asyncio.get_running_loop()
    events: asyncio.Queue[ExecutionEvent | None] = asyncio.Queue()

    def read() -> None:
        try:
            for event, _ in client.subscribe_execution(
                followed, include_children=include_children, account_uid=account_uid
            ):
                loop.call_soon_threadsafe(events.put_nowait, event)
        finally:
            loop.call_soon_threadsafe(events.put_nowait, None)

    reading = asyncio.ensure_future(asyncio.to_thread(read))
    state, error = execution.status, execution.error
    bodies: dict[tuple[str, str], str] = {}
    try:
        while (event := await events.get()) is not None:
            if event.execution_id == followed:
                data = event.data or {}
                if (
                    event.type is ExecutionEventType.STATE_CHANGED
                    and event.state is not None
                ):
                    state, error = event.state, event.error or error
                elif (
                    event.type is ExecutionEventType.ARTIFACT_REGISTERED
                    and event.artifact
                ):
                    produced_by = (
                        event.artifact.provenance[-1].attempt_id
                        if event.artifact.provenance
                        else ""
                    )
                    if isinstance(data.get("text"), str):
                        bodies[(event.artifact.artifact_id, produced_by)] = data["text"]
            on_event(event)
        await reading
    except asyncio.CancelledError:
        # The caller stopped, and so does what it followed.
        with contextlib.suppress(Exception):
            await asyncio.to_thread(
                client.cancel_execution, cancel, account_uid=account_uid
            )
        raise
    if state is not ExecutionState.COMPLETED:
        said = f": {error.message}" if error is not None else "."
        raise RuntimeError(f"Execution '{followed}' ended {state.value}{said}")
    collected = await asyncio.to_thread(
        client.collect_execution,
        ExecutionsCollect(execution_id=followed),
        account_uid=account_uid,
    )
    completing = collected.execution.current_attempt_id or ""
    return "\n\n".join(
        bodies[key]
        for key in (
            (artifact.artifact_id, completing) for artifact in collected.artifacts
        )
        if key in bodies
    )
