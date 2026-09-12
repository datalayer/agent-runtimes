# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The orchestrator as one agent, with a tree of executions behind it (ORCHESTRATOR.md, 7.4, O2-08).

It is registered on the ACP route as any agent is, so an IDE or a coding
agent sees one agent. Each turn is a root execution: the prompt is delegated,
as the person the connection is, to the agent this orchestrator was
registered with, and that agent's worker asks the control plane for its
children (O2-06). While the tree works, the turn says what it is doing as
thoughts; it answers with what the root produced. The client never names an
execution.

A turn asked again is the same execution. Its idempotency key is the session
and the prompt, so a client that lost its connection, or a runtime that
restarted mid-turn, finds the root already running rather than starting a
second tree (O1-11, O2-01).
"""

from __future__ import annotations

import asyncio
import contextlib
import hashlib
from typing import AsyncIterator

from datalayer_core.orchestration import (
    AgentBinding,
    ExecutionEvent,
    ExecutionEventType,
    ExecutionsCancel,
    ExecutionsDelegate,
    Objective,
)

from ..adapters.base import (
    AgentContext,
    AgentResponse,
    BaseAgent,
    StreamEvent,
    ToolDefinition,
)
from . import following

#: The id the orchestrator is registered under.
ORCHESTRATOR_AGENT_ID = "orchestrator"


def turn_key(session_id: str, prompt: str) -> str:
    """
    The idempotency key of a turn's root execution: its session, and what was asked.

    Parameters
    ----------
    session_id : str
        The ACP session.
    prompt : str
        The text of the prompt.

    Returns
    -------
    str
        The key, the same for the same prompt in the same session.
    """
    return f"acp:{session_id}:{hashlib.sha256(prompt.encode()).hexdigest()[:16]}"


def root_binding(root: str) -> AgentBinding:
    """
    The agent an orchestrator delegates its turns to, from how it was named.

    An ``http(s)`` URL is an A2A agent's endpoint and a ``ws(s)`` URL an ACP
    agent's. Anything else names an agentspec of the library, which the
    control plane brings a worker up for and reaches over A2A (O2-06).

    Parameters
    ----------
    root : str
        An endpoint, or an agentspec ID.

    Returns
    -------
    AgentBinding
        The binding each turn's root execution is delegated to.

    Raises
    ------
    ValueError
        When it names neither an endpoint nor an agentspec the library has.
    """
    from urllib.parse import urlparse

    from datalayer_core.orchestration import AgentProtocol

    from ..specs.agents import get_agent_spec

    scheme = urlparse(root).scheme
    if scheme in ("http", "https", "ws", "wss"):
        agent_id = root.rstrip("/").rsplit("/", 1)[-1]
        protocol = AgentProtocol.ACP if scheme in ("ws", "wss") else AgentProtocol.A2A
        return AgentBinding(agent_id=agent_id, capability=agent_id, protocol=protocol, endpoint=root)
    if get_agent_spec(root) is None:
        raise ValueError(
            f"The orchestrator's root '{root}' is neither an endpoint nor an agentspec of the library."
        )
    return AgentBinding(agent_id=root, capability=root, protocol=AgentProtocol.A2A)


class OrchestratorAgent(BaseAgent):
    """An agent whose every turn is a tree of executions the control plane runs."""

    def __init__(
        self,
        root: AgentBinding,
        *,
        name: str = ORCHESTRATOR_AGENT_ID,
        description: str = "",
    ) -> None:
        """
        Parameters
        ----------
        root : AgentBinding
            The agent each turn's root execution is delegated to: an
            agentspec, which the control plane brings a worker up for, or an
            endpoint.
        name : str
            The agent's name.
        description : str
            What it says it does.
        """
        self.root = root
        self._name = name
        self._description = (
            description or f"Delegates each turn to {root.agent_id}, and what it delegates on."
        )

    @property
    def name(self) -> str:
        return self._name

    @property
    def description(self) -> str:
        return self._description

    def get_tools(self) -> list[ToolDefinition]:
        # None of its own: what the tree does, its workers' tools do.
        return []

    async def run(self, prompt: str, context: AgentContext) -> AgentResponse:
        said: list[str] = []
        async for event in self.stream(prompt, context):
            if event.type == "error":
                raise RuntimeError(str(event.data))
            if event.type == "text":
                said.append(str(event.data))
        return AgentResponse(content="".join(said))

    async def stream(
        self, prompt: str, context: AgentContext
    ) -> AsyncIterator[StreamEvent]:
        from ..context.identities import get_request_user_jwt
        from ..monitoring.otel import command_with_trace

        token = get_request_user_jwt()
        if not token:
            yield StreamEvent(
                type="error",
                data="The orchestrator delegates as the person connected, and this connection names nobody.",
            )
            return
        key = turn_key(context.session_id, prompt)
        client = following.orchestration_client(token)
        receipt = await asyncio.to_thread(
            client.delegate_execution,
            command_with_trace(
                ExecutionsDelegate(
                    idempotency_key=key, agent=self.root, objective=Objective(goal=prompt)
                )
            ),
        )
        root = receipt.execution
        thoughts: asyncio.Queue[str] = asyncio.Queue()

        def told(event: ExecutionEvent) -> None:
            if event.type is ExecutionEventType.STATE_CHANGED and event.state is not None:
                thoughts.put_nowait(f"{event.agent_id or 'A worker'}: {event.state.value}")

        answer = asyncio.ensure_future(
            following.follow_execution(
                client,
                root,
                account_uid=None,
                on_event=told,
                include_children=True,
                cancel=ExecutionsCancel(
                    idempotency_key=f"{key}:cancel",
                    execution_id=root.execution_id,
                    reason="The turn that started it was cancelled.",
                ),
            )
        )
        try:
            while not answer.done() or not thoughts.empty():
                thought = asyncio.ensure_future(thoughts.get())
                await asyncio.wait({thought, answer}, return_when=asyncio.FIRST_COMPLETED)
                if thought.done():
                    yield StreamEvent(type="thought", data=thought.result())
                else:
                    thought.cancel()
        except BaseException:
            # The turn stopped, and so does the tree it started.
            answer.cancel()
            with contextlib.suppress(BaseException):
                await answer
            raise
        try:
            text = answer.result()
        except RuntimeError as ended:
            yield StreamEvent(type="error", data=str(ended))
            return
        yield StreamEvent(type="text", data=text)
        yield StreamEvent(type="done", data={})
