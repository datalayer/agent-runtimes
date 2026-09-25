# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
The notebook analyst, served over ACP.

The same shell as its A2A twin, over the other protocol: read the prompt,
call ``notebook_analysis.analyse``, stream what is happening as session updates, and
end the turn. The analysis is the module next door, shared with the A2A
worker, so the two cannot disagree about the notebook
(PLAN_ORCHESTRATOR.md, O0-13).

Why this is not ``agent_runtimes.routes.acp``: that route serves an agent
that runs a model, so it needs credentials and gives a different answer every
time, and neither is a thing an example should need. This is a real ACP
agent on the wire — the methods, the ``session/update`` shape and the stop
reason are the SDK's own models, dumped by alias — and the client under test
is the repository's own ``ACPClient``.

``loadSession`` is declared and implemented, because the adapter narrows its
capability report for an agent that does not have it, and an example whose
worker was missing it would be demonstrating the reduction rather than the
orchestration. The turn's updates are kept per session and replayed, which
is what ``session/load`` is.
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import websockets.exceptions
from acp import (
    AGENT_METHODS,
    CLIENT_METHODS,
    PROTOCOL_VERSION,
    session_notification,
    update_agent_message_text,
    update_agent_thought_text,
)
from acp.schema import (
    AgentCapabilities,
    Implementation,
    InitializeResponse,
    LoadSessionResponse,
    NewSessionResponse,
    PromptCapabilities,
    PromptResponse,
)
from notebook_analysis import analyse
from websockets.asyncio.server import serve as ws_serve

logger = logging.getLogger(__name__)

#: What the agent calls itself when a client asks.
AGENT_NAME = "Notebook Analyst"


def _text_of(prompt: Any) -> str:
    """
    The text of an ACP prompt, whatever blocks it carries.

    Parameters
    ----------
    prompt : Any
        The ``prompt`` parameter of ``session/prompt``.

    Returns
    -------
    str
        Its text blocks, joined.
    """
    blocks = prompt if isinstance(prompt, list) else []
    return "\n".join(
        str(block.get("text") or "")
        for block in blocks
        if isinstance(block, dict) and block.get("text")
    ).strip()


@dataclass
class NotebookAnalystAgent:
    """The agent side of one connection's worth of ACP.

    Sessions outlive a connection, which is what makes ``session/load``
    meaningful: the adapter opens a connection per operation (a durable step
    cannot hold one), so the session it prompted on is reached again over a
    different socket.
    """

    notebook: Path
    #: Session id to the updates that have been sent on it, for replay.
    sessions: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    _next: int = 0

    def initialize(self) -> dict[str, Any]:
        """
        What this agent is and what it can do.

        Returns
        -------
        dict[str, Any]
            The ``initialize`` result.
        """
        return InitializeResponse(
            protocol_version=PROTOCOL_VERSION,
            agent_capabilities=AgentCapabilities(
                load_session=True,
                prompt_capabilities=PromptCapabilities(embedded_context=True),
            ),
            agent_info=Implementation(name=AGENT_NAME, version="1.0.0"),
        ).model_dump(by_alias=True, exclude_none=True)

    def new_session(self) -> dict[str, Any]:
        """
        Open a session.

        Returns
        -------
        dict[str, Any]
            The ``session/new`` result.
        """
        self._next += 1
        session_id = f"sess_{self._next:03d}"
        self.sessions[session_id] = []
        return NewSessionResponse(session_id=session_id).model_dump(
            by_alias=True, exclude_none=True
        )

    async def prompt(self, session_id: str, asked: str, send: Any) -> dict[str, Any]:
        """
        Run one turn: analyse the notebook, streaming as it goes.

        Parameters
        ----------
        session_id : str
            The session.
        asked : str
            The objective, as the orchestrator rendered it.
        send : Any
            Where to put a ``session/update`` notification.

        Returns
        -------
        dict[str, Any]
            The ``session/prompt`` result, carrying the stop reason.
        """
        updates = self.sessions.setdefault(session_id, [])

        async def update(notification: Any) -> None:
            params = notification.model_dump(by_alias=True, exclude_none=True)
            updates.append(params)
            await send(CLIENT_METHODS["session_update"], params)

        await update(
            session_notification(
                session_id, update_agent_thought_text(f"Reading {self.notebook.name}.")
            )
        )
        report = analyse(self.notebook)
        await update(
            session_notification(
                session_id,
                update_agent_thought_text(
                    f"{report.code_cells} code cells read, "
                    f"{len(report.findings)} problems found."
                ),
            )
        )
        answer = report.as_text()
        if asked:
            answer = f"{answer}\n\nAsked for:\n{asked}"
        await update(
            session_notification(session_id, update_agent_message_text(answer))
        )
        return PromptResponse(stop_reason="end_turn").model_dump(
            by_alias=True, exclude_none=True
        )

    async def load_session(self, session_id: str, send: Any) -> dict[str, Any]:
        """
        Replay a session's updates onto this connection.

        Parameters
        ----------
        session_id : str
            The session to load.
        send : Any
            Where to put each replayed notification.

        Returns
        -------
        dict[str, Any]
            The ``session/load`` result.
        """
        for params in self.sessions.get(session_id, []):
            await send(CLIENT_METHODS["session_update"], params)
        return LoadSessionResponse().model_dump(by_alias=True, exclude_none=True)


async def _serve_connection(socket: Any, agent: NotebookAnalystAgent) -> None:
    """
    Speak ACP JSON-RPC over one WebSocket, until the client goes away.

    Parameters
    ----------
    socket : Any
        The connection.
    agent : NotebookAnalystAgent
        The agent answering on it.
    """
    lock = asyncio.Lock()

    async def send(method: str, params: dict[str, Any]) -> None:
        async with lock:
            await socket.send(
                json.dumps({"jsonrpc": "2.0", "method": method, "params": params})
            )

    async def answer(request_id: Any, result: dict[str, Any]) -> None:
        async with lock:
            await socket.send(
                json.dumps({"jsonrpc": "2.0", "id": request_id, "result": result})
            )

    async def refuse(request_id: Any, message: str) -> None:
        async with lock:
            await socket.send(
                json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "id": request_id,
                        "error": {"code": -32601, "message": message},
                    }
                )
            )

    async for raw in socket:
        try:
            message = json.loads(raw)
        except json.JSONDecodeError:
            continue
        method = message.get("method")
        params = message.get("params") or {}
        request_id = message.get("id")
        if method == AGENT_METHODS["initialize"]:
            await answer(request_id, agent.initialize())
        elif method == AGENT_METHODS["session_new"]:
            await answer(request_id, agent.new_session())
        elif method == AGENT_METHODS["session_prompt"]:
            result = await agent.prompt(
                str(params.get("sessionId") or ""), _text_of(params.get("prompt")), send
            )
            await answer(request_id, result)
        elif method == AGENT_METHODS["session_load"]:
            result = await agent.load_session(str(params.get("sessionId") or ""), send)
            await answer(request_id, result)
        elif method == AGENT_METHODS["session_cancel"]:
            # A notification, so there is nothing to answer. The analysis is
            # one read of one file and has no window to stop in.
            continue
        elif request_id is not None:
            await refuse(request_id, f"Unknown method: {method}")


async def serve(notebook: Path, host: str, port: int) -> Any:
    """
    Start the ACP agent.

    Parameters
    ----------
    notebook : Path
        The notebook to analyse.
    host : str
        Where to listen.
    port : int
        Which port; 0 asks the operating system for a free one.

    Returns
    -------
    Any
        The running server, whose ``sockets`` name the port it got.
    """
    agent = NotebookAnalystAgent(notebook=notebook)

    async def handler(socket: Any) -> None:
        try:
            await _serve_connection(socket, agent)
        except websockets.exceptions.ConnectionClosed:
            return

    return await ws_serve(handler, host, port)
