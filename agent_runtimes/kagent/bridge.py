# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The kagent bridge: what kagent (1.0) talks to in an agent-runtimes actor.

kagent runs a BYO Harness's image as a Substrate actor and expects of it:

- its configuration materialized from the bootstrap bundle
  (``kagent.core.materialize_from_bootstrap``: ``/config/config.json`` and
  ``/config/agent-card.json``);
- private **A2A v1 over gRPC** on ``runtime.port`` (80);
- ``GET /readyz`` on **8081**;
- every task created, saved and settled through the controller's
  **TaskStore** gRPC (kagent-core's ``KAgentTaskStore`` and
  ``KAgentRequestHandler``).

The bridge does those, and nothing else: it starts ``agent-runtimes serve
--target kagent`` beside it (loopback, the agentspec of ``AGENT_SPEC_ID``)
and forwards each A2A task to that server's own A2A mount (fasta2a, A2A 1.0
JSON-RPC), relaying the artifacts and the final state. ``/readyz`` answers
200 once that server serves its agent card.

It runs in its own environment (kagent-core needs a2a-sdk 1.x, agent-runtimes
pins 0.3) and imports nothing of agent-runtimes; the helpers above
:class:`ForwardingExecutor` import nothing but the standard library, so the
relay's logic is tested anywhere.

Outside kagent (a laptop, a test), ``KAGENT_BRIDGE_LOCAL=true`` keeps the
tasks in memory instead of the controller's store; the configuration is then
read from ``/config`` (``KAGENT_CONFIG_DIR``) as written there.

**Datalayer mode.** With ``DATALAYER_RUNTIME_ENVIRONMENT`` set, the bridge
starts no agent-runtimes beside it: on the first task it obtains a Datalayer
runtime for its Agent (``client_id="kagent"``, ``agent_uid`` the Agent's
``<namespace>/<name>`` from the configuration), through ``agent-runtimes
kagent launch-runtime`` in agent-runtimes' environment, which launches it the
way every Datalayer client does: from the platform's pools, with its credits
reservation, known by its uid. Each task is forwarded to that runtime's A2A
endpoint; the runtime is kept, its uid in the actor's durable ``/data``,
across the tasks of the actor's session, and a new one is launched once it
has expired. When kagent stops the actor, the bridge ends the runtime
(``agent-runtimes kagent end-runtime``), which closes its reservation.

The Datalayer API key is either read from a mounted Secret
(``DATALAYER_API_KEY_FILE``) or, under kagent, which mounts no Secret in an
actor, put in each request by Substrate's egress gateway
(``DATALAYER_API_KEY_INJECTED=true`` and an ``EgressPolicy`` binding the
Secret to the plane's origin): the bridge then sends kagent's placeholder.
Exactly one of the two; a key in the environment itself is refused. Whatever
is missing stops the bridge at start, in a sentence: Datalayer mode never
falls back to the local server.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
import sys
import time
import uuid
from contextlib import suppress
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Mapping, Optional
from urllib.request import urlopen

logger = logging.getLogger("agent_runtimes.kagent.bridge")

#: Where kagent-core materializes the configuration.
CONFIG_DIR_VARIABLE = "KAGENT_CONFIG_DIR"
DEFAULT_CONFIG_DIR = "/config"

#: The agent-runtimes command the bridge starts (the other environment's).
COMMAND_VARIABLE = "AGENT_RUNTIMES_COMMAND"
DEFAULT_COMMAND = "agent-runtimes"

#: The loopback port agent-runtimes listens on (as ``settings.PORT_VARIABLE``).
PORT_VARIABLE = "AGENT_RUNTIMES_KAGENT_PORT"
DEFAULT_PORT = 8765

#: Tasks in memory, not in kagent's store: outside kagent only.
LOCAL_VARIABLE = "KAGENT_BRIDGE_LOCAL"

#: How long one task may take upstream, in seconds.
TIMEOUT_VARIABLE = "KAGENT_BRIDGE_TASK_TIMEOUT"
DEFAULT_TIMEOUT = 600.0

#: kagent's readiness port.
READY_PORT = 8081

#: The A2A mount of the agent agent-runtimes serves (as ``settings.A2A_PATH``).
A2A_PATH = "/api/v1/a2a/agents/default/"

#: Datalayer mode: the environment the runtime is launched in (as
#: ``datalayer.ENVIRONMENT_VARIABLE``); set, the bridge is in Datalayer mode.
ENVIRONMENT_VARIABLE = "DATALAYER_RUNTIME_ENVIRONMENT"

#: Datalayer mode: the plane (as ``datalayer.RUN_URL_VARIABLE``).
RUN_URL_VARIABLE = "DATALAYER_RUN_URL"

#: Datalayer mode: the agentspec the runtime serves.
SPEC_VARIABLE = "AGENT_SPEC_ID"

#: Datalayer mode: the reservation in minutes (as ``datalayer.MINUTES_VARIABLE``).
MINUTES_VARIABLE = "DATALAYER_RUNTIME_MINUTES"

#: Datalayer mode: the file of a mounted Secret holding the Datalayer API key.
API_KEY_FILE_VARIABLE = "DATALAYER_API_KEY_FILE"

#: Datalayer mode: ``true`` when kagent's egress gateway puts the key in each
#: request (an ``EgressPolicy`` on the plane's origin).
API_KEY_INJECTED_VARIABLE = "DATALAYER_API_KEY_INJECTED"

#: The key as Datalayer clients read it: never in the bridge's own environment.
API_KEY_VARIABLE = "DATALAYER_API_KEY"

#: What a request carries for the egress gateway to replace (kagent's
#: ``CredentialPlaceholder``).
CREDENTIAL_PLACEHOLDER = "kagent-credential-injected"

#: Datalayer mode: where the runtime's uid is kept (the actor's durable /data).
STATE_DIR_VARIABLE = "DATALAYER_RUNTIME_STATE_DIR"
DEFAULT_STATE_DIR = "/data/datalayer"
STATE_FILE = "kagent-runtime.json"

#: A runtime this close to its expiry is not handed a new task, in seconds.
EXPIRY_MARGIN = 60.0

#: The states a task ends in, as A2A 1.0 JSON names them.
TERMINAL_STATES = frozenset(
    {
        "TASK_STATE_COMPLETED",
        "TASK_STATE_FAILED",
        "TASK_STATE_CANCELED",
        "TASK_STATE_REJECTED",
        "TASK_STATE_INPUT_REQUIRED",
        "TASK_STATE_AUTH_REQUIRED",
    }
)


def upstream_url(environ: Optional[Mapping[str, str]] = None) -> str:
    """The A2A endpoint of the agent-runtimes server beside the bridge."""
    env = os.environ if environ is None else environ
    port = (env.get(PORT_VARIABLE) or "").strip() or str(DEFAULT_PORT)
    return f"http://127.0.0.1:{port}{A2A_PATH}"


def send_request(message: Mapping[str, Any], context_id: str) -> dict[str, Any]:
    """The JSON-RPC ``SendMessage`` forwarding a kagent message upstream.

    The message keeps its parts and metadata; it gets an id of its own, and
    the kagent context (the Session) as its context, so the conversation
    goes on upstream as it does in kagent. kagent's task id is not sent: the
    upstream task is another one.
    """
    forwarded = {
        key: value
        for key, value in message.items()
        if key not in {"messageId", "taskId", "contextId"}
    }
    forwarded.update(
        {"messageId": str(uuid.uuid4()), "contextId": context_id, "role": "ROLE_USER"}
    )
    return {
        "jsonrpc": "2.0",
        "id": str(uuid.uuid4()),
        "method": "SendMessage",
        "params": {"message": forwarded},
    }


def rpc_request(method: str, task_id: str) -> dict[str, Any]:
    """A JSON-RPC call on one upstream task (``GetTask``, ``CancelTask``)."""
    return {
        "jsonrpc": "2.0",
        "id": str(uuid.uuid4()),
        "method": method,
        "params": {"id": task_id},
    }


def task_of(answer: Mapping[str, Any]) -> dict[str, Any]:
    """The task a JSON-RPC answer carries.

    Raises
    ------
    RuntimeError
        When the answer is an error, or carries no task, in a sentence.
    """
    if answer.get("error"):
        error = answer["error"]
        raise RuntimeError(
            f"agent-runtimes refused the task: {error.get('message') or error}"
        )
    result = answer.get("result") or {}
    task = result.get("task", result)
    if not isinstance(task, dict) or not task.get("id"):
        raise RuntimeError(
            f"agent-runtimes answered no task: {json.dumps(answer)[:300]}"
        )
    return task


def state_of(task: Mapping[str, Any]) -> str:
    """The state of an upstream task, as A2A 1.0 JSON names it."""
    return str((task.get("status") or {}).get("state") or "TASK_STATE_UNSPECIFIED")


def upstream_ready(environ: Optional[Mapping[str, str]] = None) -> bool:
    """Whether agent-runtimes serves its agent's card."""
    card = upstream_url(environ) + ".well-known/agent-card.json"
    try:
        with urlopen(card, timeout=2) as response:  # nosec B310 - loopback URL built here
            return 200 <= response.status < 300
    except OSError:
        return False


class DatalayerModeError(RuntimeError):
    """What the Datalayer mode cannot start with, in a sentence."""


@dataclass(frozen=True)
class DatalayerMode:
    """What the bridge's Datalayer mode runs with, read once at start."""

    environment: str
    run_url: str
    spec_id: str
    #: The kagent Agent, ``<namespace>/<name>``: the runtime's ``agent_uid``.
    agent_uid: str
    #: The key, or :data:`CREDENTIAL_PLACEHOLDER` when the gateway injects it.
    api_key: str
    injected: bool
    state_dir: str
    minutes: str = ""

    def __repr__(self) -> str:  # the key is never shown
        return (
            f"DatalayerMode(environment={self.environment!r}, run_url={self.run_url!r}, "
            f"spec_id={self.spec_id!r}, agent_uid={self.agent_uid!r}, "
            f"injected={self.injected!r}, state_dir={self.state_dir!r})"
        )

    @property
    def headers(self) -> dict[str, str]:
        """What each request to the platform and the runtime carries."""
        return {"Authorization": f"Bearer {self.api_key}"}


def datalayer_mode(
    environ: Optional[Mapping[str, str]] = None,
    config: Optional[Mapping[str, Any]] = None,
) -> Optional[DatalayerMode]:
    """The Datalayer mode the environment asks for, or ``None`` when it asks for none.

    ``config`` is the materialized ``config.json``: its ``runtime`` names the
    Agent (``namespace``, ``name``).

    Raises
    ------
    DatalayerModeError
        When the mode is asked for and anything it needs is missing: the plane,
        the agentspec, the Agent, the key (a mounted Secret's file, or the
        gateway's injection, exactly one), or when the key is in the
        environment itself.
    """
    env = os.environ if environ is None else environ
    environment = (env.get(ENVIRONMENT_VARIABLE) or "").strip()
    if not environment:
        return None
    problems = [
        f"{name} is not set"
        for name in (RUN_URL_VARIABLE, SPEC_VARIABLE)
        if not (env.get(name) or "").strip()
    ]
    runtime = (config or {}).get("runtime") or {}
    namespace = str(runtime.get("namespace") or "").strip()
    name = str(runtime.get("name") or "").strip()
    if not namespace or not name:
        problems.append(
            "the configuration names no Agent (runtime.namespace, runtime.name)"
        )
    if (env.get(API_KEY_VARIABLE) or "").strip():
        problems.append(
            f"{API_KEY_VARIABLE} is in the environment: the key comes from a mounted "
            f"Secret ({API_KEY_FILE_VARIABLE}) or kagent's egress gateway "
            f"({API_KEY_INJECTED_VARIABLE}=true), never from a manifest"
        )
    key_file = (env.get(API_KEY_FILE_VARIABLE) or "").strip()
    injected = (env.get(API_KEY_INJECTED_VARIABLE) or "").strip().lower() == "true"
    api_key = ""
    if key_file and injected:
        problems.append(
            f"both {API_KEY_FILE_VARIABLE} and {API_KEY_INJECTED_VARIABLE} are set: say one"
        )
    elif injected:
        api_key = CREDENTIAL_PLACEHOLDER
    elif key_file:
        try:
            with open(key_file, encoding="utf-8") as file:
                api_key = file.read().strip()
        except OSError as error:
            problems.append(
                f"the key file {key_file} cannot be read ({error.strerror})"
            )
        else:
            if not api_key:
                problems.append(f"the key file {key_file} is empty")
    else:
        problems.append(
            f"no key: set {API_KEY_FILE_VARIABLE} (a mounted Secret) or "
            f"{API_KEY_INJECTED_VARIABLE}=true (kagent's egress gateway)"
        )
    if problems:
        raise DatalayerModeError(
            f"Datalayer mode ({ENVIRONMENT_VARIABLE}={environment}) cannot start: "
            + "; ".join(problems)
            + "."
        )
    return DatalayerMode(
        environment=environment,
        run_url=env[RUN_URL_VARIABLE].strip().rstrip("/"),
        spec_id=env[SPEC_VARIABLE].strip(),
        agent_uid=f"{namespace}/{name}",
        api_key=api_key,
        injected=injected,
        state_dir=(env.get(STATE_DIR_VARIABLE) or "").strip() or DEFAULT_STATE_DIR,
        minutes=(env.get(MINUTES_VARIABLE) or "").strip(),
    )


#: Runs ``agent-runtimes kagent <args>`` with the Datalayer environment; the
#: JSON of its last line on stdout.
Runner = Callable[[DatalayerMode, list[str]], Awaitable[dict[str, Any]]]


async def run_agent_runtimes(mode: DatalayerMode, args: list[str]) -> dict[str, Any]:
    """``agent-runtimes kagent <args>`` in agent-runtimes' environment.

    The key reaches that process in its environment only (never on its
    command line); a failure raises its sentence from stderr.
    """
    command = os.environ.get(COMMAND_VARIABLE) or DEFAULT_COMMAND
    env = {
        key: value
        for key, value in os.environ.items()
        if key not in {API_KEY_FILE_VARIABLE, API_KEY_INJECTED_VARIABLE}
    }
    env.update(
        {
            API_KEY_VARIABLE: mode.api_key,
            RUN_URL_VARIABLE: mode.run_url,
            ENVIRONMENT_VARIABLE: mode.environment,
            SPEC_VARIABLE: mode.spec_id,
        }
    )
    if mode.minutes:
        env[MINUTES_VARIABLE] = mode.minutes
    process = await asyncio.create_subprocess_exec(
        command,
        "kagent",
        *args,
        env=env,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    out, err = await process.communicate()
    if process.returncode != 0:
        said = [
            line for line in err.decode(errors="replace").splitlines() if line.strip()
        ]
        raise RuntimeError(
            f"agent-runtimes kagent {args[0]} failed: "
            + (said[-1] if said else f"exit code {process.returncode}")
        )
    lines = [line for line in out.decode(errors="replace").splitlines() if line.strip()]
    try:
        answer = json.loads(lines[-1])
    except (IndexError, ValueError) as error:
        raise RuntimeError(
            f"agent-runtimes kagent {args[0]} answered no JSON: {error}"
        ) from error
    if not isinstance(answer, dict):
        raise RuntimeError(f"agent-runtimes kagent {args[0]} answered {answer!r}.")
    return answer


class DatalayerRuntime:
    """The Datalayer runtime the bridge forwards to, in its Datalayer mode.

    Launched on the first task, kept across the session's tasks (its uid,
    endpoint and expiry in ``<state_dir>/kagent-runtime.json``, which holds
    no key), launched again once expired, ended when the actor stops.
    """

    def __init__(
        self,
        mode: DatalayerMode,
        runner: Runner = run_agent_runtimes,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.mode = mode
        self.runner = runner
        self.clock = clock
        self.state: Optional[dict[str, Any]] = None
        self._loaded = False
        self._lock = asyncio.Lock()

    @property
    def path(self) -> str:
        return os.path.join(self.mode.state_dir, STATE_FILE)

    def _load(self) -> None:
        if self._loaded:
            return
        self._loaded = True
        try:
            with open(self.path, encoding="utf-8") as file:
                state = json.load(file)
        except FileNotFoundError:
            return
        except (OSError, ValueError):
            logger.warning("The runtime state %s is unreadable: ignored", self.path)
            return
        if isinstance(state, dict) and state.get("uid") and state.get("url"):
            self.state = state

    def _save(self, state: dict[str, Any]) -> None:
        os.makedirs(self.mode.state_dir, exist_ok=True)
        temporary = self.path + ".tmp"
        with open(
            os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600),
            "w",
            encoding="utf-8",
        ) as file:
            json.dump(state, file)
        os.replace(temporary, self.path)

    def _forget(self) -> None:
        self.state = None
        with suppress(FileNotFoundError):
            os.remove(self.path)

    def _alive(self, state: Mapping[str, Any]) -> bool:
        expired_at = float(state.get("expired_at") or 0)
        return not expired_at or self.clock() < expired_at - EXPIRY_MARGIN

    async def target(self) -> tuple[str, dict[str, str]]:
        """The A2A endpoint to forward to and its headers, launching a runtime when none is alive."""
        async with self._lock:
            self._load()
            if self.state is not None and not self._alive(self.state):
                logger.info(
                    "The runtime %s has expired: launching another", self.state["uid"]
                )
                self._forget()
            if self.state is None:
                launched = await self.runner(
                    self.mode, ["launch-runtime", "--agent", self.mode.agent_uid]
                )
                state = {
                    "uid": str(launched["uid"]),
                    "url": str(launched["url"]),
                    "expired_at": float(launched.get("expired_at") or 0),
                }
                self._save(state)
                self.state = state
                logger.info(
                    "The runtime %s serves the kagent Agent %s",
                    state["uid"],
                    self.mode.agent_uid,
                )
            return self.state["url"], self.mode.headers

    async def end(self) -> None:
        """End the runtime, closing its reservation; nothing when none was launched."""
        async with self._lock:
            self._load()
            if self.state is None:
                return
            uid = self.state["uid"]
            try:
                await self.runner(self.mode, ["end-runtime", uid])
            except Exception:  # noqa: BLE001 - its reservation ends it anyway
                logger.exception(
                    "The runtime %s could not be ended: its reservation will end it",
                    uid,
                )
            else:
                logger.info("The runtime %s is ended", uid)
            self._forget()


async def readiness_server(
    environ: Optional[Mapping[str, str]] = None,
    port: int = READY_PORT,
    ready: Optional[Callable[[], bool]] = None,
) -> asyncio.AbstractServer:
    """``GET /readyz`` on ``port``: 200 once agent-runtimes is up, 503 before.

    ``ready`` replaces the check (the Datalayer mode, with no agent-runtimes
    beside the bridge, is ready once started).
    """
    check = ready or (lambda: upstream_ready(environ))

    async def handle(
        reader: asyncio.StreamReader, writer: asyncio.StreamWriter
    ) -> None:
        request = await reader.readline()
        if request.startswith(b"GET /readyz "):
            ready = await asyncio.to_thread(check)
            status = b"200 OK" if ready else b"503 Service Unavailable"
        else:
            status = b"404 Not Found"
        body = status.split(b" ", 1)[1]
        writer.write(
            b"HTTP/1.1 "
            + status
            + b"\r\nContent-Length: "
            + str(len(body)).encode()
            + b"\r\nConnection: close\r\n\r\n"
            + body
        )
        with suppress(ConnectionError):
            await writer.drain()
        writer.close()

    # Every interface and family: Substrate probes the actor's IPv4 address.
    return await asyncio.start_server(handle, host=None, port=port)


class ForwardingExecutor:
    """An a2a-sdk ``AgentExecutor`` forwarding each task to agent-runtimes.

    Built by :func:`executor`, which makes it a subclass of a2a-sdk's
    ``AgentExecutor`` (imported there, in the bridge's environment).

    ``target``, when given, answers the endpoint and the headers of each task
    (the Datalayer mode's runtime); otherwise every task goes to ``url``.
    """

    def __init__(
        self,
        url: str = "",
        timeout: float = DEFAULT_TIMEOUT,
        poll: float = 0.5,
        target: Optional[Callable[[], Awaitable[tuple[str, dict[str, str]]]]] = None,
    ) -> None:
        import httpx

        if not url and target is None:
            raise ValueError("A forwarding executor needs a url or a target.")
        self.url = url
        self.target = target
        self.timeout = timeout
        self.poll = poll
        self.client = httpx.AsyncClient(timeout=30.0)
        #: kagent's task id → where the upstream task runs and its id, while it runs.
        self.upstream: dict[str, tuple[tuple[str, dict[str, str]], str]] = {}

    async def _target(self) -> tuple[str, dict[str, str]]:
        if self.target is None:
            return self.url, {}
        return await self.target()

    async def _call(
        self, body: Mapping[str, Any], target: tuple[str, dict[str, str]]
    ) -> dict[str, Any]:
        url, headers = target
        response = await self.client.post(
            url, json=body, headers={**headers, "A2A-Version": "1.0"}
        )
        response.raise_for_status()
        return task_of(response.json())

    async def execute(self, context: Any, event_queue: Any) -> None:
        """Forward the task's message, wait for its end, relay what it produced."""
        from a2a.types import Task, TaskState, TaskStatus, TaskStatusUpdateEvent
        from google.protobuf.json_format import MessageToDict

        if context.message is None:
            raise ValueError("An A2A request without a message.")
        if not context.current_task:
            await event_queue.enqueue_event(
                Task(
                    id=context.task_id,
                    context_id=context.context_id,
                    status=TaskStatus(
                        state=TaskState.TASK_STATE_SUBMITTED, message=context.message
                    ),
                )
            )
        await event_queue.enqueue_event(
            TaskStatusUpdateEvent(
                task_id=context.task_id,
                context_id=context.context_id,
                status=TaskStatus(state=TaskState.TASK_STATE_WORKING),
            )
        )
        try:
            target = await self._target()
            task = await self._call(
                send_request(MessageToDict(context.message), context.context_id),
                target,
            )
            self.upstream[context.task_id] = (target, task["id"])
            async with asyncio.timeout(self.timeout):
                while state_of(task) not in TERMINAL_STATES:
                    await asyncio.sleep(self.poll)
                    task = await self._call(rpc_request("GetTask", task["id"]), target)
        except Exception as error:  # noqa: BLE001 - the task fails in a sentence
            logger.exception("The task %s failed upstream", context.task_id)
            await self._settle(
                context,
                event_queue,
                "TASK_STATE_FAILED",
                None,
                f"{type(error).__name__}: {error}",
            )
            return
        finally:
            self.upstream.pop(context.task_id, None)
        await self._relay(context, event_queue, task)

    async def _relay(
        self, context: Any, event_queue: Any, task: Mapping[str, Any]
    ) -> None:
        from a2a.types import Artifact, TaskArtifactUpdateEvent
        from google.protobuf.json_format import ParseDict

        for artifact in task.get("artifacts") or []:
            await event_queue.enqueue_event(
                TaskArtifactUpdateEvent(
                    task_id=context.task_id,
                    context_id=context.context_id,
                    artifact=ParseDict(
                        artifact, Artifact(), ignore_unknown_fields=True
                    ),
                    last_chunk=True,
                )
            )
        status = task.get("status") or {}
        await self._settle(
            context, event_queue, state_of(task), status.get("message"), None
        )

    async def _settle(
        self,
        context: Any,
        event_queue: Any,
        state: str,
        message: Optional[Mapping[str, Any]],
        sentence: Optional[str],
    ) -> None:
        from a2a.types import (
            Message,
            Part,
            Role,
            TaskState,
            TaskStatus,
            TaskStatusUpdateEvent,
        )
        from google.protobuf.json_format import ParseDict

        status = TaskStatus(state=TaskState.Value(state))
        if message:
            status.message.CopyFrom(
                ParseDict(message, Message(), ignore_unknown_fields=True)
            )
        elif sentence:
            status.message.CopyFrom(
                Message(
                    message_id=str(uuid.uuid4()),
                    role=Role.ROLE_AGENT,
                    parts=[Part(text=sentence)],
                )
            )
        if status.HasField("message"):
            status.message.task_id = context.task_id
            status.message.context_id = context.context_id
        await event_queue.enqueue_event(
            TaskStatusUpdateEvent(
                task_id=context.task_id, context_id=context.context_id, status=status
            )
        )

    async def cancel(self, context: Any, event_queue: Any) -> None:
        """Cancel the upstream task, and say the task is canceled."""
        upstream = self.upstream.pop(context.task_id, None)
        if upstream:
            target, task_id = upstream
            with suppress(Exception):
                await self._call(rpc_request("CancelTask", task_id), target)
        await self._settle(context, event_queue, "TASK_STATE_CANCELED", None, None)


def executor(
    url: str = "",
    timeout: float = DEFAULT_TIMEOUT,
    poll: float = 0.5,
    target: Optional[Callable[[], Awaitable[tuple[str, dict[str, str]]]]] = None,
) -> Any:
    """A :class:`ForwardingExecutor` that is an a2a-sdk ``AgentExecutor``."""
    from a2a.server.agent_execution import AgentExecutor

    class _Executor(ForwardingExecutor, AgentExecutor):
        pass

    return _Executor(url, timeout=timeout, poll=poll, target=target)


def request_handler(card: Any, forward: Any, local: bool) -> Any:
    """kagent-core's request handler: the controller's task store, or memory when local."""
    from kagent.core.a2a import KAgentRequestContextBuilder, TelemetryRequestHandler

    if local:
        from a2a.server.tasks import InMemoryTaskStore

        store: Any = InMemoryTaskStore()
        handler_type: Any = TelemetryRequestHandler
        controller = None
    else:
        from kagent.core import (
            AsyncControllerClient,
            AsyncFileTokenProvider,
            KAgentConfig,
        )
        from kagent.core.a2a._task_store import KAgentRequestHandler, KAgentTaskStore

        config = KAgentConfig.from_file(_config_path("config.json"))
        controller = AsyncControllerClient(
            config.api_url,
            agent_name=config.app_name,
            token_provider=AsyncFileTokenProvider(),
        )
        store = KAgentTaskStore(controller)
        handler_type = KAgentRequestHandler
    handler = handler_type(
        agent_executor=forward,
        task_store=store,
        agent_card=card,
        request_context_builder=KAgentRequestContextBuilder(task_store=store),
    )
    return handler, controller


async def grpc_server(handler: Any, address: str) -> Any:
    """A2A v1 over gRPC at ``address``, with gRPC health, as kagent's runtimes serve it."""
    import grpc
    from a2a.server.request_handlers.grpc_handler import GrpcHandler
    from a2a.types import a2a_pb2, a2a_pb2_grpc
    from grpc_health.v1 import health, health_pb2, health_pb2_grpc
    from kagent.core.a2a import KAgentGrpcServerCallContextBuilder

    server = grpc.aio.server()
    a2a_pb2_grpc.add_A2AServiceServicer_to_server(
        GrpcHandler(handler, context_builder=KAgentGrpcServerCallContextBuilder()),
        server,
    )
    health_service = health.aio.HealthServicer()
    await health_service.set(
        a2a_pb2.DESCRIPTOR.services_by_name["A2AService"].full_name,
        health_pb2.HealthCheckResponse.SERVING,
    )
    health_pb2_grpc.add_HealthServicer_to_server(health_service, server)
    if server.add_insecure_port(address) == 0:
        raise RuntimeError(f"Could not bind the A2A gRPC server to {address}.")
    await server.start()
    return server


def _config_path(name: str) -> str:
    return os.path.join(os.environ.get(CONFIG_DIR_VARIABLE) or DEFAULT_CONFIG_DIR, name)


def _card() -> Any:
    from a2a.types import AgentCard
    from google.protobuf.json_format import Parse

    with open(_config_path("agent-card.json"), encoding="utf-8") as file:
        return Parse(file.read(), AgentCard(), ignore_unknown_fields=True)


def _config() -> dict[str, Any]:
    with open(_config_path("config.json"), encoding="utf-8") as file:
        return json.load(file)


def _port(config: Mapping[str, Any]) -> int:
    return int((config.get("runtime") or {}).get("port") or 80)


async def serve() -> int:
    """Run the bridge until agent-runtimes exits or the actor is stopped."""
    if os.environ.get("KAGENT_BOOTSTRAP_JSON"):
        from kagent.core import materialize_from_bootstrap

        materialize_from_bootstrap(
            os.environ.get(CONFIG_DIR_VARIABLE) or DEFAULT_CONFIG_DIR
        )
    local = (os.environ.get(LOCAL_VARIABLE) or "").strip().lower() == "true"
    config = _config()
    # Refused here, before anything listens, when Datalayer mode is asked
    # for and cannot run: it never falls back to the local server.
    mode = datalayer_mode(os.environ, config)
    timeout = float(os.environ.get(TIMEOUT_VARIABLE) or DEFAULT_TIMEOUT)
    child = None
    runtime: Optional[DatalayerRuntime] = None
    if mode is None:
        child = await asyncio.create_subprocess_exec(
            os.environ.get(COMMAND_VARIABLE) or DEFAULT_COMMAND,
            "serve",
            "--target",
            "kagent",
            env={**os.environ, "KAGENT_CONFIG_PATH": _config_path("config.json")},
        )
        forward = executor(upstream_url(), timeout=timeout)
        upstream = upstream_url()
    else:
        runtime = DatalayerRuntime(mode)
        forward = executor(timeout=timeout, target=runtime.target)
        upstream = f"a Datalayer runtime ({mode.environment}) on {mode.run_url}"
    handler, controller = request_handler(_card(), forward, local)
    address = f"[::]:{_port(config)}"
    server = await grpc_server(handler, address)
    ready = await readiness_server(ready=(lambda: True) if mode else None)
    logger.info(
        "kagent bridge: A2A gRPC on %s, /readyz on %d, forwarding to %s",
        address,
        READY_PORT,
        upstream,
    )

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop.set)
    stopper = asyncio.create_task(stop.wait())
    waited = {stopper}
    if child is not None:
        waited.add(asyncio.create_task(child.wait()))
    await asyncio.wait(waited, return_when=asyncio.FIRST_COMPLETED)
    if child is not None and child.returncode is None:
        child.terminate()
        with suppress(asyncio.TimeoutError):
            await asyncio.wait_for(child.wait(), 20)
    ready.close()
    await server.stop(grace=5)
    if runtime is not None:
        # kagent stops the actor: its runtime ends, and its reservation with it.
        await runtime.end()
    await forward.client.aclose()
    if controller is not None:
        await controller.close()
    stopper.cancel()
    if child is None:
        return 0
    return 0 if stop.is_set() else (child.returncode or 1)


def main() -> None:
    """The bridge's entry point (the Harness's command)."""
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s"
    )
    try:
        sys.exit(asyncio.run(serve()))
    except DatalayerModeError as error:
        logger.error("%s", error)
        sys.exit(2)


if __name__ == "__main__":
    main()
