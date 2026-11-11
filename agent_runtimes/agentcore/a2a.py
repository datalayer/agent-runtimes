# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A2A on port 9000 at ``/``: a team seat in AgentCore Runtime (AC-05).

AgentCore's A2A protocol contract calls a container on port 9000, JSON-RPC
2.0 at ``/``, its agent card at ``/.well-known/agent-card.json``. The agent
an AgentCore runtime serves (the agentspec of ``AGENT_SPEC_ID``, configured
at start) is registered with the runtime's own A2A transport
(`agent_runtimes.routes.a2a.register_a2a_agent`: the FastA2A application and
the ``A2AWorker`` every A2A agent of agent-runtimes has), and
:class:`SeatApp` serves that application at the root of a second listener,
:data:`A2A_PORT`, beside the AG-UI contract on 8080. There is no second A2A
server here.

- **The card** is the agentspec's: its name, its description, its skills.
  Its URL is ``AGENTCORE_RUNTIME_URL`` when set (the address callers reach
  the runtime at), else the listener's own.
- **The token.** Behind Datalayer IAM's authorizer, the token AgentCore
  validated is exchanged as an invocation's is (AC-06): the A2A application
  is given the caller's platform token as its bearer. A refused exchange
  answers 401 in IAM's sentence.
- **Busy.** ``/ping`` answers on this port too, and a request in flight
  (a streamed task) keeps the runtime ``HealthyBusy``.
- **The session.** AgentCore routes a call to a microVM by its
  ``X-Amzn-Bedrock-AgentCore-Runtime-Session-Id``: a session uid behind its
  padding (`session_ids`). A message is of the A2A context that session is
  (``contextId``, the session uid); a message naming another context is
  refused in a sentence. What the task does is recorded as any team seat's
  is: a turn of the seat's session of the team run (`orchestration.seat_sessions`).
- **The run** holds the workload token AgentCore sent with the call, the
  token the call carried, and the session on its spans, as an invocation's
  run does (`contract`).
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import os
from typing import Any, Iterator, Mapping, Optional

from .contract import LIVENESS, SESSION_HEADER, ContractRefused, _workload_of, tokens_of
from .session_ids import agentcore_to_session_uid
from .settings import AGENT_ID, HOST

logger = logging.getLogger(__name__)

#: AgentCore's port for A2A.
A2A_PORT = 9000

#: The address callers reach the runtime at, written in the card.
RUNTIME_URL_VARIABLE = "AGENTCORE_RUNTIME_URL"


def seat_card(environ: Optional[Mapping[str, str]] = None) -> Any:
    """Make the A2A card of the agent the runtime serves, from its agentspec.

    Parameters
    ----------
    environ : Mapping[str, str], optional
        The environment the card's URL is read from.

    Returns
    -------
    agent_runtimes.routes.a2a.A2AAgentCard
        The spec's name, description and skills, at the runtime's URL.

    Raises
    ------
    RuntimeError
        When no agent was configured from the spec.
    """
    from agent_runtimes.routes.a2a import A2AAgentCard
    from agent_runtimes.routes.agents import get_stored_agent_spec

    env = os.environ if environ is None else environ
    spec = get_stored_agent_spec(AGENT_ID)
    if not spec:
        raise RuntimeError(
            f"No agent '{AGENT_ID}' was configured from the agentspec: there is "
            "no team seat to serve over A2A."
        )
    url = (env.get(RUNTIME_URL_VARIABLE) or "").strip() or (
        f"http://127.0.0.1:{A2A_PORT}/"
    )
    skills = [
        {"id": str(name), "name": str(name), "description": f"The {name} skill."}
        for name in spec.get("skills") or []
    ]
    return A2AAgentCard(
        id=AGENT_ID,
        name=str(spec.get("name") or AGENT_ID),
        description=str(spec.get("description") or spec.get("name") or AGENT_ID),
        url=url,
        skills=skills or None,
    )


def register_seat(environ: Optional[Mapping[str, str]] = None) -> None:
    """Register the agent the runtime serves with the runtime's A2A transport.

    Parameters
    ----------
    environ : Mapping[str, str], optional
        The environment the card's URL is read from.

    Raises
    ------
    RuntimeError
        When no agent was configured from the spec.
    """
    from agent_runtimes.routes.a2a import register_a2a_agent
    from agent_runtimes.routes.agui import get_agui_adapter

    card = seat_card(environ)
    adapter = get_agui_adapter(AGENT_ID)
    if adapter is None:
        raise RuntimeError(
            f"The agent '{AGENT_ID}' is not served over AG-UI: there is no agent "
            "to give the A2A seat."
        )
    register_a2a_agent(adapter.agent, card)
    logger.info("AgentCore: agent '%s' served over A2A at %s", AGENT_ID, card.url)


def _seat_application() -> Any:
    """Return the A2A application registered for the agent, as its mount serves it."""
    from agent_runtimes.routes.a2a import get_a2a_mounts

    return next(
        (m.app for m in get_a2a_mounts() if m.path == f"/{AGENT_ID}"),
        None,
    )


async def _answer(send: Any, status: int, body: Mapping[str, Any]) -> None:
    payload = json.dumps(body).encode()
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(payload)).encode()),
            ],
        }
    )
    await send({"type": "http.response.body", "body": payload})


def context_of(body: bytes) -> str:
    """The A2A context a JSON-RPC call's message names (``params.message.contextId``), or ``""``."""
    try:
        call = json.loads(body or b"{}")
    except ValueError:
        return ""
    params = call.get("params") if isinstance(call, dict) else None
    message = params.get("message") if isinstance(params, dict) else None
    if not isinstance(message, dict):
        return ""
    return str(message.get("contextId") or message.get("context_id") or "").strip()


def session_of_call(headers: Mapping[str, str], body: bytes) -> str:
    """The session uid of a call AgentCore routed here, its message's context checked against it.

    Parameters
    ----------
    headers : Mapping[str, str]
        The call's headers, lower-cased.
    body : bytes
        The JSON-RPC call.

    Returns
    -------
    str
        The session uid behind the AgentCore session id; ``""`` for a call
        that names no AgentCore session (one made to the listener itself).

    Raises
    ------
    ContractRefused
        When the AgentCore session id is not a Datalayer session, or the
        message names another context (400), in a sentence.
    """
    sid = (headers.get(SESSION_HEADER.lower()) or "").strip()
    if not sid:
        return ""
    try:
        uid = agentcore_to_session_uid(sid)
    except ValueError as refused:
        raise ContractRefused(400, str(refused)) from None
    context = context_of(body)
    if context and context != uid:
        raise ContractRefused(
            400,
            f"The message is of context {context!r}, and the call of AgentCore session "
            f"{uid!r}: a seat's A2A context is its session.",
        )
    return uid


class SeatApp:
    """Serve the agent's A2A application at the root, with ``/ping`` beside it."""

    async def __call__(self, scope: Any, receive: Any, send: Any) -> None:
        """Answer one ASGI connection."""
        if scope["type"] == "lifespan":
            while True:
                message = await receive()
                if message["type"] == "lifespan.startup":
                    await send({"type": "lifespan.startup.complete"})
                elif message["type"] == "lifespan.shutdown":
                    await send({"type": "lifespan.shutdown.complete"})
                    return
        if scope["type"] != "http":
            return
        if scope.get("path") == "/ping" and scope.get("method") == "GET":
            await _answer(send, 200, LIVENESS.ping())
            return
        served = _seat_application()
        if served is None:
            await _answer(
                send,
                503,
                {"detail": "No agent is served over A2A on this runtime yet."},
            )
            return
        headers = {
            bytes(k).decode("latin-1").lower(): bytes(v).decode("latin-1")
            for k, v in scope.get("headers") or []
        }
        from agent_runtimes.apps.a2a import read_body, replay

        body = await read_body(receive) if scope.get("method") == "POST" else b""
        receive = replay(body, receive) if body else receive
        try:
            context = session_of_call(headers, body)
            tokens = await tokens_of(headers)
        except ContractRefused as refused:
            await _answer(send, refused.status, {"detail": refused.sentence})
            return
        # What the run holds, from the call as AgentCore made it: its workload
        # token, the token it carried, its session.
        held = _workload_of(scope)
        if tokens is not None:
            # The task runs in the A2A worker, apart from this request: its
            # model calls find the caller's inference token by its context.
            from agent_runtimes.models.offered import give_context_inference_token

            give_context_inference_token(context, tokens.inference)
            scope = {
                **scope,
                "headers": [
                    (k, v)
                    for k, v in scope.get("headers") or []
                    if bytes(k).lower() != b"authorization"
                ]
                + [(b"authorization", f"Bearer {tokens.platform}".encode())],
            }
        with LIVENESS.working(), held:
            await served(scope, receive, send)


class _SeatServer:
    """The second listener: uvicorn, leaving the process's signals to the first."""

    def __init__(self, port: int = A2A_PORT) -> None:
        import uvicorn

        class Server(uvicorn.Server):
            @contextlib.contextmanager
            def capture_signals(self) -> Iterator[None]:
                # The main server owns SIGINT and SIGTERM, and stops this one.
                yield

        self.server = Server(
            uvicorn.Config(SeatApp(), host=HOST, port=port, log_level="info")
        )
        self.task: Optional["asyncio.Task[None]"] = None

    def start(self) -> None:
        """Start listening, in the running loop."""
        self.task = asyncio.create_task(self.server.serve(), name="agentcore-a2a")

    async def stop(self) -> None:
        """Stop listening, and wait for it."""
        self.server.should_exit = True
        if self.task is not None:
            with contextlib.suppress(asyncio.CancelledError):
                await self.task


async def start_seat(environ: Optional[Mapping[str, str]] = None) -> _SeatServer:
    """Register the seat and start serving it on :data:`A2A_PORT`.

    Parameters
    ----------
    environ : Mapping[str, str], optional
        The environment the card's URL is read from.

    Returns
    -------
    _SeatServer
        The listener, to stop when the runtime stops.
    """
    register_seat(environ)
    seat = _SeatServer()
    seat.start()
    return seat


__all__ = [
    "A2A_PORT",
    "RUNTIME_URL_VARIABLE",
    "SeatApp",
    "context_of",
    "register_seat",
    "seat_card",
    "session_of_call",
    "start_seat",
]
