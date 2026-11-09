# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The Amazon Bedrock AgentCore Runtime contract, answered by agent-runtimes (AC-01..AC-03).

At the root, as AgentCore calls a container:

- ``POST /invocations`` — an AG-UI ``RunAgentInput``, streamed back as SSE;
  or ``{"prompt": "..."}``, answered as one AG-UI run: SSE when the client
  accepts ``text/event-stream``, else ``{"response": ..., "status": "success"}``.
  Both are run by the agent's own AG-UI app (`routes.agui`), the one
  ``/api/v1/ag-ui/default/`` serves: there is no second agent loop here.
- ``GET /ping`` — ``Healthy``, or ``HealthyBusy`` while a turn or a background
  task runs; ``time_of_last_update`` only once the status has changed, and
  the same on every ping until it changes again (AgentCore's idle timeout
  counts from it).
- ``/ws`` — the same run over a WebSocket: ``{"prompt", "session_id"}`` text
  messages in, each run's AG-UI events and then its response out.

Every request is a session: ``X-Amzn-Bedrock-AgentCore-Runtime-Session-Id``
is read and mapped to the session uid (`session_ids`), the AG-UI ``threadId``.
A run naming another thread is refused in a sentence. A session this process
has not held is resumed from its record before the turn runs — META_HARNESS's
resume (`apps.sessions.rebuilt_from_record`, MH-03): its turns and tool rows
given to the run as the conversation so far.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import os
import time
import uuid
from typing import Any, Awaitable, Callable, Iterator, Mapping, Optional

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, Response

from .session_ids import agentcore_to_session_uid
from .settings import AGENT_ID, agentcore_settings

logger = logging.getLogger(__name__)

#: The header AgentCore Runtime names an invocation's session in.
SESSION_HEADER = "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id"

#: The headers of an invocation the agent's AG-UI app is given.
FORWARDED_HEADERS = (
    "authorization",
    "x-external-token",
    "traceparent",
    "tracestate",
    SESSION_HEADER.lower(),
)

router = APIRouter(tags=["agentcore"])


class ContractRefused(Exception):
    """What the contract will not do: an HTTP status, and why in a sentence."""

    def __init__(self, status: int, sentence: str) -> None:
        self.status = status
        self.sentence = sentence
        super().__init__(sentence)


# --- /ping ------------------------------------------------------------------------------


class Liveness:
    """What ``/ping`` answers: busy while work runs, and when that last changed.

    The time is taken when the status changes — a turn starts on an idle
    runtime, the last work ends — never when it is asked, so pings in between
    read the same ``time_of_last_update``, and none before the first change.
    """

    def __init__(self, clock: Callable[[], float] = time.time) -> None:
        self._clock = clock
        self._work = 0
        self._status = "Healthy"
        self._changed_at: Optional[int] = None

    @property
    def status(self) -> str:
        """``Healthy`` or ``HealthyBusy``."""
        return self._status

    def ping(self) -> dict[str, Any]:
        """The ``/ping`` answer."""
        answer: dict[str, Any] = {"status": self._status}
        if self._changed_at is not None:
            answer["time_of_last_update"] = self._changed_at
        return answer

    def _changed(self) -> None:
        status = "HealthyBusy" if self._work else "Healthy"
        if status != self._status:
            self._status = status
            self._changed_at = int(self._clock())

    def begin(self) -> None:
        """A turn or a background task starts."""
        self._work += 1
        self._changed()

    def end(self) -> None:
        """A turn or a background task ends."""
        self._work = max(0, self._work - 1)
        self._changed()

    @contextlib.contextmanager
    def working(self) -> Iterator[None]:
        """Busy for the time of the block."""
        self.begin()
        try:
            yield
        finally:
            self.end()

    def track(self, task: "asyncio.Future[Any]") -> "asyncio.Future[Any]":
        """Busy until ``task`` is done: work that goes on after a response."""
        self.begin()
        task.add_done_callback(lambda _: self.end())
        return task

    def reset(self) -> None:
        """Idle, never changed (a test)."""
        self._work = 0
        self._status = "Healthy"
        self._changed_at = None


#: This process's liveness, as ``/ping`` says it.
LIVENESS = Liveness()


def track_background(task: "asyncio.Future[Any]") -> "asyncio.Future[Any]":
    """Keep the runtime ``HealthyBusy`` until ``task`` is done."""
    return LIVENESS.track(task)


@router.get("/ping")
async def ping() -> dict[str, Any]:
    """Answer AgentCore's health check: ``Healthy`` or ``HealthyBusy``."""
    return LIVENESS.ping()


# --- the session ------------------------------------------------------------------------

#: The sessions this process has run a turn of: no resume for them.
_HELD: set[str] = set()


def forget_held() -> None:
    """Forget the sessions this process ran (a test: a fresh microVM)."""
    _HELD.clear()


def session_of_headers(headers: Mapping[str, str]) -> tuple[str, str]:
    """The session uid an invocation names, and the AgentCore session id it came as.

    Raises
    ------
    ContractRefused
        When the header is missing, or is not a Datalayer session (400).
    """
    sid = (headers.get(SESSION_HEADER) or "").strip()
    if not sid:
        raise ContractRefused(
            400, f"An invocation names its session in {SESSION_HEADER}."
        )
    try:
        return agentcore_to_session_uid(sid), sid
    except ValueError as wrong:
        raise ContractRefused(400, str(wrong)) from None


def run_input_of(payload: Any, uid: str, sid: str) -> tuple[dict[str, Any], bool]:
    """The AG-UI ``RunAgentInput`` of an invocation, on the session's thread.

    Returns
    -------
    tuple
        The run, and whether it was asked as ``{"prompt": ...}``.

    Raises
    ------
    ContractRefused
        When it is neither shape, or it names another thread than the
        session's (400).
    """
    if not isinstance(payload, dict):
        raise ContractRefused(
            400,
            'An invocation is a JSON object: an AG-UI RunAgentInput or {"prompt": ...}.',
        )
    if "messages" in payload:
        named = payload.get("threadId") or payload.get("thread_id")
        prompt_shape = False
        body = {k: v for k, v in payload.items() if k not in ("thread_id", "run_id")}
        body["runId"] = str(
            payload.get("runId") or payload.get("run_id") or uuid.uuid4()
        )
    else:
        prompt = payload.get("prompt")
        if not isinstance(prompt, str) or not prompt.strip():
            raise ContractRefused(
                400,
                'An invocation is an AG-UI RunAgentInput or {"prompt": ...} with some text.',
            )
        named = payload.get("session_id") or payload.get("threadId")
        prompt_shape = True
        body = {
            "runId": str(uuid.uuid4()),
            "messages": [{"id": str(uuid.uuid4()), "role": "user", "content": prompt}],
        }
    if named and str(named) not in (uid, sid):
        raise ContractRefused(
            400,
            f"The run names thread {named}, but the invocation is session {uid} "
            f"({SESSION_HEADER}): one session per invocation.",
        )
    body["threadId"] = uid
    body.setdefault("state", {})
    body.setdefault("tools", [])
    body.setdefault("context", [])
    body.setdefault("forwardedProps", {})
    return body, prompt_shape


def _carries_history(body: Mapping[str, Any]) -> bool:
    """Whether a run brings its conversation so far: more than its new message."""
    messages = [m for m in body.get("messages") or [] if isinstance(m, dict)]
    return len(messages) > 1 or any(m.get("role") != "user" for m in messages)


async def resumed(body: dict[str, Any], uid: str, bearer: str) -> dict[str, Any]:
    """The run, with the session's conversation from its record when this process never held it.

    The resume is META_HARNESS's (MH-03, `rebuilt_from_record`): the turns and
    the tool rows of the record, on the application the agent runs. A run
    bringing its own conversation, a session the record has no turn of (its
    first), and an agent running no application (nothing of its sessions is
    recorded) are run as they come.

    Raises
    ------
    ContractRefused
        When the record refuses the resume — an ended session, no token to
        read it with, another application's session — in its sentence.
    """
    from agent_runtimes.apps.sessions import (
        SessionRefused,
        agent_app,
        rebuilt_from_record,
        session_of,
    )

    if uid in _HELD or session_of(uid) is not None or _carries_history(body):
        _HELD.add(uid)
        return body
    try:
        app, instance = agent_app(AGENT_ID)
    except SessionRefused:
        _HELD.add(uid)
        return body
    try:
        rebuilt = await rebuilt_from_record(uid, app, instance, bearer)
    except SessionRefused as refused:
        if refused.status == 404:
            _HELD.add(uid)
            return body
        raise ContractRefused(refused.status, refused.reason) from None
    history = [
        {
            "id": str(m.get("id") or uuid.uuid4()),
            "role": m["role"],
            "content": str(m["content"]),
        }
        for m in rebuilt.messages
        if m.get("role") in ("user", "assistant") and m.get("content")
    ]
    logger.info(
        "AgentCore session %s resumed from its record: %d message(s)", uid, len(history)
    )
    _HELD.add(uid)
    return {**body, "messages": history + list(body.get("messages") or [])}


# --- the run, by the agent's AG-UI app --------------------------------------------------


def _agent_app() -> Any:
    """The AG-UI app of the configured agent.

    Raises
    ------
    ContractRefused
        When no agent is configured (503).
    """
    from agent_runtimes.routes.agui import get_agui_app

    app = get_agui_app(AGENT_ID)
    if app is None:
        raise ContractRefused(503, "No agent is configured on this runtime to invoke.")
    return app


def _forwarded(headers: Mapping[str, str]) -> list[tuple[bytes, bytes]]:
    """The invocation's headers the agent's AG-UI app reads."""
    return [
        (name.encode("latin-1"), str(headers[name]).encode("latin-1"))
        for name in FORWARDED_HEADERS
        if headers.get(name)
    ]


def _inner_scope(
    scope: Mapping[str, Any], headers: list[tuple[bytes, bytes]], length: int
) -> dict[str, Any]:
    """An HTTP ``POST /`` scope for the agent's AG-UI app, from the invocation's own."""
    inner = {
        key: scope[key]
        for key in ("app", "client", "server", "state", "asgi")
        if key in scope
    }
    inner.update(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "POST",
            "scheme": "https" if scope.get("scheme") in ("https", "wss") else "http",
            "path": "/",
            "raw_path": b"/",
            "root_path": "",
            "query_string": b"",
            "headers": [
                *headers,
                (b"content-type", b"application/json"),
                (b"accept", b"text/event-stream"),
                (b"content-length", str(length).encode()),
            ],
        }
    )
    return inner


def _receiver(payload: bytes, receive: Optional[Callable[[], Awaitable[Any]]]) -> Any:
    """The body once; then the invocation's own messages, or nothing ever."""
    given = False

    async def receive_() -> Any:
        nonlocal given
        if not given:
            given = True
            return {"type": "http.request", "body": payload, "more_body": False}
        if receive is not None:
            return await receive()
        await asyncio.Future()  # never: the run ends first, and cancels it

    return receive_


def _workload_of(scope: Mapping[str, Any]) -> Any:
    """Hold, for the run, the workload token AgentCore Runtime sent with the invocation.

    The ``agentcore`` identity provider reads it to reach AgentCore's token
    vault for the person (AWS_IDENTITY ID-21); an invocation without one runs
    with none held.
    """
    from agent_runtimes.agentcore.identity import (
        use_workload_token,
        workload_token_from_headers,
    )

    headers = {
        bytes(name).decode("latin-1"): bytes(value).decode("latin-1")
        for name, value in scope.get("headers") or []
    }
    return use_workload_token(workload_token_from_headers(headers))


class _Streamed(Response):
    """The agent's AG-UI app answering the invocation itself: its SSE as it runs."""

    def __init__(
        self, agent_app: Any, body: dict[str, Any], headers: list[tuple[bytes, bytes]]
    ):
        self.agent_app = agent_app
        self.payload = json.dumps(body).encode()
        self.forwarded = headers
        self.status_code = 200
        self.background = None

    async def __call__(self, scope: Any, receive: Any, send: Any) -> None:
        inner = _inner_scope(scope, self.forwarded, len(self.payload))
        with LIVENESS.working(), _workload_of(scope):
            await self.agent_app(inner, _receiver(self.payload, receive), send)


def _sse_events(buffer: str) -> tuple[list[dict[str, Any]], str]:
    """The complete SSE events of ``buffer`` as JSON, and what is left of it."""
    events: list[dict[str, Any]] = []
    *blocks, rest = buffer.replace("\r\n", "\n").split("\n\n")
    for block in blocks:
        data = "".join(
            line[len("data:") :].strip()
            for line in block.splitlines()
            if line.startswith("data:")
        )
        if data:
            with contextlib.suppress(ValueError):
                events.append(json.loads(data))
    return events, rest


async def collected(
    agent_app: Any,
    scope: Mapping[str, Any],
    body: dict[str, Any],
    headers: list[tuple[bytes, bytes]],
    on_event: Optional[Callable[[dict[str, Any]], Awaitable[None]]] = None,
) -> tuple[int, list[dict[str, Any]], bytes]:
    """One run of the agent's AG-UI app, read whole: its status, its events, and a refusal's body."""
    payload = json.dumps(body).encode()
    status = 500
    streamed = False
    buffer = ""
    raw = bytearray()
    events: list[dict[str, Any]] = []

    async def send(message: Mapping[str, Any]) -> None:
        nonlocal status, streamed, buffer
        if message["type"] == "http.response.start":
            status = int(message["status"])
            kinds = [
                v
                for k, v in message.get("headers") or []
                if k.lower() == b"content-type"
            ]
            streamed = any(b"text/event-stream" in kind for kind in kinds)
        elif message["type"] == "http.response.body":
            chunk = message.get("body") or b""
            if not streamed:
                raw.extend(chunk)
                return
            new, buffer = _sse_events(buffer + chunk.decode("utf-8", errors="replace"))
            for event in new:
                events.append(event)
                if on_event is not None:
                    await on_event(event)

    with LIVENESS.working(), _workload_of(scope):
        await agent_app(
            _inner_scope(scope, headers, len(payload)), _receiver(payload, None), send
        )
    return status, events, bytes(raw)


def answer_of(events: list[dict[str, Any]]) -> str:
    """The text a run answered."""
    return "".join(
        str(event.get("delta") or "")
        for event in events
        if event.get("type") == "TEXT_MESSAGE_CONTENT"
    )


def error_of(events: list[dict[str, Any]]) -> str:
    """Why a run failed, or ``""``."""
    return next(
        (str(e.get("message") or "") for e in events if e.get("type") == "RUN_ERROR"),
        "",
    )


def _wants_events(accept: Optional[str]) -> bool:
    return "text/event-stream" in (accept or "").lower()


# --- the routes -------------------------------------------------------------------------


async def _prepared(
    payload: Any, headers: Mapping[str, str]
) -> tuple[dict[str, Any], bool, str, Any]:
    """The run of an invocation, resumed when need be, and the app that runs it."""
    from agent_runtimes.apps.callers import bearer_of

    uid, sid = session_of_headers(headers)
    body, prompt_shape = run_input_of(payload, uid, sid)
    agent_app = _agent_app()
    body = await resumed(body, uid, bearer_of(headers.get("authorization")))
    return body, prompt_shape, uid, agent_app


@router.post("/invocations")
async def invocations(request: Request) -> Response:
    """Run one AG-UI turn of the agent for AgentCore's ``InvokeAgentRuntime``, on the session's thread."""
    try:
        try:
            payload = await request.json()
        except ValueError:
            raise ContractRefused(
                400, 'An invocation is JSON: an AG-UI RunAgentInput or {"prompt": ...}.'
            ) from None
        body, prompt_shape, _, agent_app = await _prepared(payload, request.headers)
    except ContractRefused as refused:
        raise HTTPException(
            status_code=refused.status, detail=refused.sentence
        ) from None
    forwarded = _forwarded(request.headers)
    if not prompt_shape or _wants_events(request.headers.get("accept")):
        return _Streamed(agent_app, body, forwarded)
    status, events, raw = await collected(agent_app, request.scope, body, forwarded)
    if status != 200:
        return Response(raw, status_code=status, media_type="application/json")
    error = error_of(events)
    if error:
        return JSONResponse(
            {"response": answer_of(events), "status": "error", "error": error},
            status_code=500,
        )
    return JSONResponse({"response": answer_of(events), "status": "success"})


@router.websocket("/ws")
async def invocations_ws(websocket: WebSocket) -> None:
    """The same run over a WebSocket: ``{"prompt", "session_id"}`` in; its events, then its response, out."""
    try:
        uid, _ = session_of_headers(websocket.headers)
    except ContractRefused as refused:
        await websocket.close(code=1008, reason=refused.sentence)
        return
    await websocket.accept()
    forwarded = _forwarded(websocket.headers)

    async def said(event: dict[str, Any]) -> None:
        await websocket.send_text(json.dumps(event))

    while True:
        try:
            text = await websocket.receive_text()
        except WebSocketDisconnect:
            return
        try:
            try:
                payload = json.loads(text)
            except ValueError:
                raise ContractRefused(
                    400, 'A message is JSON: {"prompt": ..., "session_id": ...}.'
                ) from None
            body, _, _, agent_app = await _prepared(payload, websocket.headers)
        except ContractRefused as refused:
            await said(
                {"status": "error", "error": refused.sentence, "session_id": uid}
            )
            continue
        status, events, raw = await collected(
            agent_app, websocket.scope, body, forwarded, said
        )
        error = error_of(events) or (
            "" if status == 200 else raw.decode("utf-8", errors="replace")
        )
        await said(
            {
                "response": answer_of(events),
                "status": "error" if error else "success",
                **({"error": error} if error else {}),
                "session_id": uid,
            }
        )


# --- at start ---------------------------------------------------------------------------


async def configure_at_start(app: Any, api_prefix: str) -> None:
    """Configure the agent from ``AGENT_SPEC_ID`` as a pool pod's is: through
    ``configure-from-spec``, in process, served over AG-UI.

    Raises
    ------
    RuntimeError
        When the spec is refused, in its sentence: the runtime does not
        start without the agent it was started for.
    """
    from starlette.requests import Request as StarletteRequest

    from agent_runtimes.routes.agents import (
        ConfigureFromSpecRequest,
        configure_from_spec_endpoint,
    )

    settings = agentcore_settings()
    scope = {
        "type": "http",
        "app": app,
        "method": "POST",
        "path": f"{api_prefix}/agents/configure-from-spec",
        "headers": [],
        "query_string": b"",
        "scheme": "http",
        "server": ("127.0.0.1", int(os.environ.get("AGENT_RUNTIMES_PORT") or 0)),
    }
    try:
        await configure_from_spec_endpoint(
            StarletteRequest(scope),
            ConfigureFromSpecRequest(
                agent_spec_id=settings.spec_id, agent_id=AGENT_ID, transport="ag-ui"
            ),
        )
    except HTTPException as refused:
        raise RuntimeError(
            f"The agentspec {settings.spec_id} was not configured: {refused.detail}"
        ) from None
    logger.info("AgentCore: agent '%s' configured from %s", AGENT_ID, settings.spec_id)


__all__ = [
    "FORWARDED_HEADERS",
    "LIVENESS",
    "SESSION_HEADER",
    "ContractRefused",
    "Liveness",
    "answer_of",
    "collected",
    "configure_at_start",
    "error_of",
    "forget_held",
    "resumed",
    "router",
    "run_input_of",
    "session_of_headers",
    "track_background",
]
