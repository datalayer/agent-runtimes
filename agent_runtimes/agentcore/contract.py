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
is read and mapped to the session uid (`session_ids`), the AG-UI ``threadId``,
which is also the policy session the AgentCore Gateway's calls are decided in
(`mcp.agentcore_gateway.policy_session`).
A run naming another thread is refused in a sentence. A session this process
has not held is resumed from its record before the turn runs — the session model's
resume (`apps.sessions.rebuilt_from_record`, MH-03): its turns and tool rows
given to the run as the conversation so far.

Each run's ``output`` entry in the record carries its invocation
(`apps.record.invoked`): ``{target: agentcore, started_at, ended_at, seconds,
microvm_started_at}`` — when the invocation arrived, when its run ended, the
wall time between (what the usage reads as invocation hours), and when this
process, the microVM's, started.

A runtime the platform deployed for an application (``AGENTCORE_DEPLOYMENT_UID``)
runs the deployment's agent, made as a kept runtime's is (`apps.deployments.kept_payload`):
its Appspec and the deployment as its instance, read from ai-agents with the first
caller's token, once the secrets its MCP servers and skills declare were read
at IAM as the caller and given to this process (`secrets`: never in the image,
never in the agent runtime's environment at AWS). Its runs go through the application's session routes — a session
opened by its first run (``/api/v1/apps/agents/{agent}/ag-ui/``), resumed from its
record when this process does not hold it (``/api/v1/apps/sessions/{uid}/resume``)
— so each session is recorded under the deployment, where it runs said as
``{kind: agentcore, arn}``.

Behind Datalayer IAM's authorizer, the token AgentCore validated is exchanged
for the platform's tokens before anything else (AC-06, `exchange`): the run
is given the caller's platform token as its bearer, and its model calls the
caller's inference token. A refused exchange answers 401, in IAM's sentence.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import os
import time
import uuid
from collections import OrderedDict
from typing import Any, Awaitable, Callable, Iterator, Mapping, NamedTuple, Optional

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, Response

from .exchange import ExchangeRefused, PlatformTokens, runtime_exchange
from .secrets import SecretsRefused, give_declared
from .session_ids import agentcore_to_session_uid
from .settings import AGENT_ID, agentcore_settings, deployment_of_runtime

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

#: When this process started, as the platform's clock says it: taken as the
#: contract is loaded, at the runtime's start — the microVM's start, as near as
#: the process knows it. Written with each invocation (`_invoked`).
MICROVM_STARTED = time.time()


def _invoked(started: Optional[float]) -> Any:
    """Hold, for the run, when its invocation arrived (`apps.record.invoked`)."""
    from agent_runtimes.apps.record import invoked

    return invoked(
        "agentcore", time.time() if started is None else started, MICROVM_STARTED
    )


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
    _PROMPT_HISTORY.clear()


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


#: A session's conversation, kept in this process: its text turns as the last
#: run had them, with that run's answer. A ``{"prompt": ...}`` caller (AWS's
#: samples, ``loop``) sends only its new message, where an AG-UI client (the
#: Studio, through ai-agents) sends the whole conversation: whichever ran last,
#: the next prompt goes after it. Bounded per session and in sessions, the
#: oldest dropped first.
_PROMPT_HISTORY: "OrderedDict[str, list[dict[str, str]]]" = OrderedDict()
PROMPT_HISTORY_MESSAGES = 50
PROMPT_HISTORY_SESSIONS = 256


def with_prompt_history(body: dict[str, Any], uid: str) -> dict[str, Any]:
    """The prompt's run with the session's earlier turns before it, when this process kept them."""
    history = _PROMPT_HISTORY.get(uid)
    if not history:
        return body
    _PROMPT_HISTORY.move_to_end(uid)
    return {**body, "messages": [*history, *(body.get("messages") or [])]}


def _text_of(content: Any) -> str:
    """A message's text: its string, or its text parts joined."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            str(part.get("text") or "")
            for part in content
            if isinstance(part, dict) and part.get("type") == "text"
        )
    return ""


def remember_turn(uid: str, messages: list[Any], answer: str) -> None:
    """Keep the session's conversation: the text turns a run was given, then its answer."""
    if not answer:
        return
    history = [
        {"id": str(m.get("id") or uuid.uuid4()), "role": m["role"], "content": text}
        for m in messages
        if isinstance(m, dict)
        and m.get("role") in ("user", "assistant")
        and (text := _text_of(m.get("content")))
    ]
    history.append({"id": str(uuid.uuid4()), "role": "assistant", "content": answer})
    _PROMPT_HISTORY.pop(uid, None)
    _PROMPT_HISTORY[uid] = history[-PROMPT_HISTORY_MESSAGES:]
    while len(_PROMPT_HISTORY) > PROMPT_HISTORY_SESSIONS:
        _PROMPT_HISTORY.popitem(last=False)


def remember_turns(uid: str, messages: list[Any]) -> None:
    """Keep a session's conversation as it was resumed: its text turns."""
    history = [
        {"id": str(m.get("id") or uuid.uuid4()), "role": m["role"], "content": text}
        for m in messages
        if isinstance(m, dict)
        and m.get("role") in ("user", "assistant")
        and (text := _text_of(m.get("content")))
    ]
    _PROMPT_HISTORY.pop(uid, None)
    if history:
        _PROMPT_HISTORY[uid] = history[-PROMPT_HISTORY_MESSAGES:]


async def resumed(body: dict[str, Any], uid: str, bearer: str) -> dict[str, Any]:
    """The run, with the session's conversation from its record when this process never held it.

    The resume is the session model's (MH-03, `rebuilt_from_record`): the turns and
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


class Runner(NamedTuple):
    """What runs an invocation: an ASGI app, the path it is posted to, and
    whether the invocation's client address goes with it.

    The agent's own AG-UI app at ``/``; on a runtime running a deployment, the
    server itself at an application's session route, where the caller is who
    their token says, never the address AgentCore called from.
    """

    app: Any
    path: str = "/"
    with_client: bool = True


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


# --- a deployment's runtime -------------------------------------------------------------

#: Where the server's routes are, as it said at start.
_API_PREFIX = {"prefix": "/api/v1"}

#: The deployment's agent, once made here: ``{"agent": <id>}``.
_DEPLOYED: dict[str, str] = {}

#: One making of the deployment's agent at a time.
_MAKING: dict[str, asyncio.Lock] = {}


async def _create_agent(server: Any, payload: dict[str, Any], bearer: str) -> None:
    """Make the deployment's agent through the create route, in process, as the keeper's call would."""
    from starlette.requests import Request as StarletteRequest

    from agent_runtimes.routes.agents import CreateAgentRequest, create_agent

    scope = {
        "type": "http",
        "app": server,
        "method": "POST",
        "path": f"{_API_PREFIX['prefix']}/agents",
        "headers": [(b"authorization", f"Bearer {bearer}".encode("latin-1"))],
        "query_string": b"",
        "scheme": "http",
        "server": ("127.0.0.1", int(os.environ.get("AGENT_RUNTIMES_PORT") or 0)),
    }
    await create_agent(CreateAgentRequest(**payload), StarletteRequest(scope))


#: Who makes the deployment's agent from its payload; replaced by a test.
_maker: dict[str, Callable[[Any, dict[str, Any], str], Awaitable[None]]] = {
    "make": _create_agent
}


def use_deployment_maker(
    maker: Optional[Callable[[Any, dict[str, Any], str], Awaitable[None]]],
) -> None:
    """Who makes the deployment's agent: the create route, or a test; ``None`` for the route."""
    _maker["make"] = maker or _create_agent


def forget_deployment_agent() -> None:
    """Forget the deployment's agent made here (a test: a fresh microVM)."""
    _DEPLOYED.clear()


async def deployment_agent(server: Any, bearer: str) -> str:
    """The agent of the deployment this runtime runs, made at its first invocation.

    Made as the keeper makes a kept deployment's (`kept_payload`): the version
    ai-agents answers the caller (`principal.read_deployment`), its Appspec,
    the deployment as its instance. Never from what the invocation sends.

    Raises
    ------
    ContractRefused
        With no token to ask with (401), when ai-agents does not say what the
        deployment runs (502), or it cannot be made, in its sentence.
    """
    from agent_runtimes.apps.deployments import DeployRefused, kept_payload
    from agent_runtimes.apps.loading import AppNotRunnable
    from agent_runtimes.apps.principal import DeploymentCodeUnread, read_deployment

    if "agent" in _DEPLOYED:
        return _DEPLOYED["agent"]
    lock = _MAKING.setdefault("lock", asyncio.Lock())
    async with lock:
        if "agent" in _DEPLOYED:
            return _DEPLOYED["agent"]
        deployment = deployment_of_runtime()
        if not bearer:
            raise ContractRefused(
                401,
                f"This runtime runs deployment {deployment}: it is invoked with a Datalayer token.",
            )
        try:
            answer = await read_deployment(deployment, None, bearer)
        except DeploymentCodeUnread as unread:
            raise ContractRefused(502, str(unread)) from None
        try:
            payload = kept_payload(
                answer["spec"],
                app_uid=str(answer["app_uid"]),
                deployment_uid=deployment,
                version=int(answer["version"]),
                organization_uid=str(answer.get("organization_uid") or ""),
                spend_limit=float(answer.get("spend_limit") or 0.0),
                runs="on AWS AgentCore",
            )
        except AppNotRunnable as refused:
            raise ContractRefused(
                422,
                f"Deployment {deployment} does not run: {'; '.join(map(str, refused.problems))}",
            ) from None
        except DeployRefused as refused:
            raise ContractRefused(422, str(refused)) from None
        # What its MCP servers and skills need of the caller's secrets, read at
        # IAM as them and held by this process alone (`secrets`).
        try:
            await give_declared(payload, bearer)
        except SecretsRefused as refused:
            raise ContractRefused(refused.status, refused.sentence) from None
        except HTTPException as refused:
            raise ContractRefused(
                refused.status_code,
                f"The agent of deployment {deployment} was not made: {refused.detail}",
            ) from None
        try:
            await _maker["make"](server, payload, bearer)
        except HTTPException as refused:
            raise ContractRefused(
                refused.status_code,
                f"The agent of deployment {deployment} was not made: {refused.detail}",
            ) from None
        agent = str(payload["name"]).lower().replace(" ", "-")
        _DEPLOYED["agent"] = agent
        logger.info("AgentCore: deployment %s runs as agent %s", deployment, agent)
        return agent


def _session_route(agent: str) -> str:
    return f"{_API_PREFIX['prefix']}/apps/agents/{agent}/ag-ui/"


async def opened_from_record(
    server: Any,
    scope: Mapping[str, Any],
    uid: str,
    agent: str,
    headers: list[tuple[bytes, bytes]],
    tokens: Optional[PlatformTokens],
) -> None:
    """The session, held by this process: resumed from its record, or started.

    Through the application's own routes, as a page does: resumed
    (``/apps/sessions/{uid}/resume``) — its turns, tool rows and Rules given
    back, a ``session`` entry saying it resumed where it runs now, its earlier
    turns the conversation of a ``{"prompt"}`` run; or, the record holding no
    turn of it (404) or the application keeping no conversations, started
    (``/apps/sessions``) as the deployment's, its opening saying its agent and
    where it runs.

    Raises
    ------
    ContractRefused
        When the record refuses it — an ended session — or the session is not
        started, in its sentence.
    """
    from agent_runtimes.apps.principal import deployment_of
    from agent_runtimes.apps.sessions import agent_app, session_of

    if session_of(uid) is not None:
        return
    app, instance = agent_app(agent)
    include = {str(getattr(item, "value", item)) for item in app.record.include}
    sessions = f"{_API_PREFIX['prefix']}/apps/sessions"
    if "conversations" in include:
        status, _, raw = await collected(
            Runner(server, f"{sessions}/{uid}/resume", False),
            scope,
            {"agent": agent},
            headers,
            tokens=tokens,
        )
        if status == 200:
            live = session_of(uid)
            if live is not None:
                remember_turns(uid, live.messages)
            logger.info("AgentCore session %s resumed from its record", uid)
            return
        if status != 404:
            raise ContractRefused(status, _detail_of(raw))
    status, _, raw = await collected(
        Runner(server, sessions, False),
        scope,
        {"agent": agent, "deployment_uid": deployment_of(instance), "session": uid},
        headers,
        tokens=tokens,
    )
    if status != 200:
        raise ContractRefused(status, _detail_of(raw))


def _detail_of(raw: bytes) -> str:
    """A refusal's sentence, from its JSON ``detail`` or its text."""
    text = raw.decode("utf-8", errors="replace")
    with contextlib.suppress(ValueError):
        detail = json.loads(text).get("detail")
        if detail:
            return detail if isinstance(detail, str) else json.dumps(detail)
    return text


def _forwarded(
    headers: Mapping[str, str], tokens: Optional[PlatformTokens] = None
) -> list[tuple[bytes, bytes]]:
    """The invocation's headers the agent's AG-UI app reads.

    With the platform's tokens of an exchange, the run's bearer is the
    caller's platform token, never the token AgentCore validated.
    """
    said = {name: str(headers[name]) for name in FORWARDED_HEADERS if headers.get(name)}
    if tokens is not None:
        said["authorization"] = f"Bearer {tokens.platform}"
    return [
        (name.encode("latin-1"), value.encode("latin-1"))
        for name, value in said.items()
    ]


@contextlib.contextmanager
def _tokens_held(tokens: Optional[PlatformTokens]) -> Iterator[None]:
    """Hold, for the run, the caller's inference token of an exchange."""
    if tokens is None:
        yield
        return
    from agent_runtimes.models.offered import use_inference_token

    with use_inference_token(tokens.inference):
        yield


def _inner_scope(
    scope: Mapping[str, Any],
    headers: list[tuple[bytes, bytes]],
    length: int,
    path: str = "/",
    with_client: bool = True,
) -> dict[str, Any]:
    """An HTTP ``POST`` scope for the runner, from the invocation's own."""
    kept = ("app", "client", "server", "state", "asgi")
    inner = {
        key: scope[key]
        for key in kept
        if key in scope and (with_client or key != "client")
    }
    inner.update(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "POST",
            "scheme": "https" if scope.get("scheme") in ("https", "wss") else "http",
            "path": path,
            "raw_path": path.encode("latin-1"),
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
    """Hold, for the run, the workload token AgentCore Runtime sent with the invocation, and its bearer.

    The ``agentcore`` identity provider reads it to reach AgentCore's token
    vault for the person (ID-21); an invocation without one runs
    with none held.
    """
    from agent_runtimes.agentcore.identity import (
        invocation_token_from_headers,
        use_invocation_token,
        use_workload_token,
        workload_token_from_headers,
    )

    headers = {
        bytes(name).decode("latin-1"): bytes(value).decode("latin-1")
        for name, value in scope.get("headers") or []
    }
    # And the token the invocation carried, which AgentCore made the workload
    # token from: a consent asked in this turn is bound with it alone.
    held = contextlib.ExitStack()
    held.enter_context(use_workload_token(workload_token_from_headers(headers)))
    held.enter_context(use_invocation_token(invocation_token_from_headers(headers)))
    return held


class _Streamed(Response):
    """The agent's AG-UI app answering the invocation itself: its SSE as it runs."""

    def __init__(
        self,
        runner: Runner,
        body: dict[str, Any],
        headers: list[tuple[bytes, bytes]],
        tokens: Optional[PlatformTokens] = None,
        started: Optional[float] = None,
        remember: Optional[str] = None,
    ):
        self.remember = remember
        self.runner = runner
        self.payload = json.dumps(body).encode()
        self.forwarded = headers
        self.tokens = tokens
        self.started = started
        self.status_code = 200
        self.background = None

    async def __call__(self, scope: Any, receive: Any, send: Any) -> None:
        inner = _inner_scope(
            scope,
            self.forwarded,
            len(self.payload),
            self.runner.path,
            self.runner.with_client,
        )
        with (
            LIVENESS.working(),
            _invoked(self.started),
            _workload_of(scope),
            _tokens_held(self.tokens),
        ):
            if self.remember is None:
                await self.runner.app(inner, _receiver(self.payload, receive), send)
                return
            chunks: list[bytes] = []

            async def sent(message: Any) -> None:
                if message.get("type") == "http.response.body":
                    chunks.append(message.get("body") or b"")
                await send(message)

            await self.runner.app(inner, _receiver(self.payload, receive), sent)
            events, _ = _sse_events(b"".join(chunks).decode("utf-8", errors="replace"))
            if not error_of(events):
                remember_turn(
                    self.remember,
                    json.loads(self.payload).get("messages") or [],
                    answer_of(events),
                )


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
    runner: Any,
    scope: Mapping[str, Any],
    body: dict[str, Any],
    headers: list[tuple[bytes, bytes]],
    on_event: Optional[Callable[[dict[str, Any]], Awaitable[None]]] = None,
    tokens: Optional[PlatformTokens] = None,
    started: Optional[float] = None,
) -> tuple[int, list[dict[str, Any]], bytes]:
    """One run, read whole: its status, its events, and a refusal's body.

    ``runner`` is a `Runner`, or the agent's AG-UI app itself (at ``/``).
    ``started`` is when the invocation arrived (``time.time()``), now when unsaid.
    """
    if not isinstance(runner, Runner):
        runner = Runner(runner)
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

    with (
        LIVENESS.working(),
        _invoked(started),
        _workload_of(scope),
        _tokens_held(tokens),
    ):
        await runner.app(
            _inner_scope(scope, headers, len(payload), runner.path, runner.with_client),
            _receiver(payload, None),
            send,
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


async def tokens_of(headers: Mapping[str, str]) -> Optional[PlatformTokens]:
    """Exchange the token AgentCore validated for the platform's tokens (AC-06).

    Parameters
    ----------
    headers : Mapping[str, str]
        The invocation's headers.

    Returns
    -------
    PlatformTokens or None
        The caller's platform and inference tokens; ``None`` when the
        runtime exchanges nothing (no ``AGENTCORE_RUNTIME_ARN``).

    Raises
    ------
    ContractRefused
        When IAM refuses the token (401) or cannot be asked, in its sentence.
    """
    from agent_runtimes.apps.callers import bearer_of

    exchange = runtime_exchange()
    if exchange is None:
        return None
    try:
        return await exchange.tokens_for(bearer_of(headers.get("authorization")))
    except ExchangeRefused as refused:
        raise ContractRefused(refused.status, refused.sentence) from None


async def _prepared(
    payload: Any,
    headers: Mapping[str, str],
    scope: Optional[Mapping[str, Any]] = None,
) -> tuple[dict[str, Any], bool, str, Runner, Optional[PlatformTokens]]:
    """The run of an invocation, resumed when need be, what runs it, and its tokens."""
    from agent_runtimes.apps.callers import bearer_of
    from agent_runtimes.mcp.agentcore_gateway import policy_session

    uid, sid = session_of_headers(headers)
    policy_session().use(uid)
    body, prompt_shape = run_input_of(payload, uid, sid)
    tokens = await tokens_of(headers)
    bearer = (
        tokens.platform
        if tokens is not None
        else bearer_of(headers.get("authorization"))
    )
    if deployment_of_runtime():
        server = (scope or {}).get("app")
        if server is None:
            raise ContractRefused(503, "This invocation reaches no server to run it.")
        agent = await deployment_agent(server, bearer)
        await opened_from_record(
            server, scope or {}, uid, agent, _forwarded(headers, tokens), tokens
        )
        if prompt_shape:
            body = with_prompt_history(body, uid)
        return (
            body,
            prompt_shape,
            uid,
            Runner(server, _session_route(agent), False),
            tokens,
        )
    agent_app = _agent_app()
    if prompt_shape:
        body = with_prompt_history(body, uid)
    body = await resumed(body, uid, bearer)
    return body, prompt_shape, uid, Runner(agent_app), tokens


@router.post("/invocations")
async def invocations(request: Request) -> Response:
    """Run one AG-UI turn of the agent for AgentCore's ``InvokeAgentRuntime``, on the session's thread."""
    started = time.time()
    try:
        try:
            payload = await request.json()
        except ValueError:
            raise ContractRefused(
                400, 'An invocation is JSON: an AG-UI RunAgentInput or {"prompt": ...}.'
            ) from None
        body, prompt_shape, uid, runner, tokens = await _prepared(
            payload, request.headers, request.scope
        )
    except ContractRefused as refused:
        # Said in the runtime's own log too: AgentCore answers its caller a
        # status, not the sentence.
        logger.warning(
            "AgentCore invocation refused (%d): %s", refused.status, refused.sentence
        )
        raise HTTPException(
            status_code=refused.status, detail=refused.sentence
        ) from None
    forwarded = _forwarded(request.headers, tokens)
    if not prompt_shape or _wants_events(request.headers.get("accept")):
        return _Streamed(runner, body, forwarded, tokens, started, uid)
    status, events, raw = await collected(
        runner, request.scope, body, forwarded, tokens=tokens, started=started
    )
    if status != 200:
        return Response(raw, status_code=status, media_type="application/json")
    error = error_of(events)
    if error:
        return JSONResponse(
            {"response": answer_of(events), "status": "error", "error": error},
            status_code=500,
        )
    remember_turn(uid, body.get("messages") or [], answer_of(events))
    return JSONResponse({"response": answer_of(events), "status": "success"})


@router.websocket("/ws")
async def invocations_ws(websocket: WebSocket) -> None:
    """The same run over a WebSocket: ``{"prompt", "session_id"}`` in; its events, then its response, out."""
    from agent_runtimes.mcp.agentcore_gateway import policy_session

    try:
        uid, _ = session_of_headers(websocket.headers)
    except ContractRefused as refused:
        await websocket.close(code=1008, reason=refused.sentence)
        return
    policy_session().use(uid)
    await websocket.accept()

    async def said(event: dict[str, Any]) -> None:
        await websocket.send_text(json.dumps(event))

    while True:
        try:
            text = await websocket.receive_text()
        except WebSocketDisconnect:
            return
        started = time.time()
        try:
            try:
                payload = json.loads(text)
            except ValueError:
                raise ContractRefused(
                    400, 'A message is JSON: {"prompt": ..., "session_id": ...}.'
                ) from None
            body, prompt_shape, _, runner, tokens = await _prepared(
                payload, websocket.headers, websocket.scope
            )
        except ContractRefused as refused:
            await said(
                {"status": "error", "error": refused.sentence, "session_id": uid}
            )
            continue
        status, events, raw = await collected(
            runner,
            websocket.scope,
            body,
            _forwarded(websocket.headers, tokens),
            said,
            tokens,
            started,
        )
        error = error_of(events) or (
            "" if status == 200 else raw.decode("utf-8", errors="replace")
        )
        if not error:
            remember_turn(uid, body.get("messages") or [], answer_of(events))
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
    ``configure-from-spec``, in process, served over AG-UI. A runtime that runs
    a deployment (``AGENTCORE_DEPLOYMENT_UID``) makes the deployment's agent at
    its first invocation instead (`deployment_agent`).

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
    # The exchange's configuration, refused now rather than at the first
    # invocation (AC-06).
    runtime_exchange()
    _API_PREFIX["prefix"] = api_prefix
    deployment = deployment_of_runtime()
    if deployment:
        from agent_runtimes.apps.session_store import configured_store_name

        if configured_store_name() != "record":
            # A microVM's files go with it: a session kept there is never
            # resumed on the next one, nor recorded under the deployment.
            raise RuntimeError(
                f"Deployment {deployment} keeps its sessions in the platform's record: "
                "set DATALAYER_AI_AGENTS_URL (the record store), not a file store."
            )
        # The deployment's agent is made at its first invocation, with that
        # caller's token: ai-agents says what the deployment runs to them.
        logger.info(
            "AgentCore: deployment %s, its agent made at the first invocation",
            deployment,
        )
        return
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
    "MICROVM_STARTED",
    "SESSION_HEADER",
    "ContractRefused",
    "Liveness",
    "Runner",
    "answer_of",
    "collected",
    "configure_at_start",
    "deployment_agent",
    "error_of",
    "forget_deployment_agent",
    "forget_held",
    "opened_from_record",
    "resumed",
    "router",
    "run_input_of",
    "session_of_headers",
    "tokens_of",
    "track_background",
    "use_deployment_maker",
]
