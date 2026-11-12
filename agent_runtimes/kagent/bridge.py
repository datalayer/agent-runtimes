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
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
import sys
import uuid
from contextlib import suppress
from typing import Any, Mapping, Optional
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


async def readiness_server(
    environ: Optional[Mapping[str, str]] = None, port: int = READY_PORT
) -> asyncio.AbstractServer:
    """``GET /readyz`` on ``port``: 200 once agent-runtimes is up, 503 before."""

    async def handle(
        reader: asyncio.StreamReader, writer: asyncio.StreamWriter
    ) -> None:
        request = await reader.readline()
        if request.startswith(b"GET /readyz "):
            ready = await asyncio.to_thread(upstream_ready, environ)
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
    """

    def __init__(
        self, url: str, timeout: float = DEFAULT_TIMEOUT, poll: float = 0.5
    ) -> None:
        import httpx

        self.url = url
        self.timeout = timeout
        self.poll = poll
        self.client = httpx.AsyncClient(timeout=30.0)
        #: kagent's task id → the upstream task's, while it runs.
        self.upstream: dict[str, str] = {}

    async def _call(self, body: Mapping[str, Any]) -> dict[str, Any]:
        response = await self.client.post(
            self.url, json=body, headers={"A2A-Version": "1.0"}
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
            task = await self._call(
                send_request(MessageToDict(context.message), context.context_id)
            )
            self.upstream[context.task_id] = task["id"]
            async with asyncio.timeout(self.timeout):
                while state_of(task) not in TERMINAL_STATES:
                    await asyncio.sleep(self.poll)
                    task = await self._call(rpc_request("GetTask", task["id"]))
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
            with suppress(Exception):
                await self._call(rpc_request("CancelTask", upstream))
        await self._settle(context, event_queue, "TASK_STATE_CANCELED", None, None)


def executor(url: str, timeout: float = DEFAULT_TIMEOUT, poll: float = 0.5) -> Any:
    """A :class:`ForwardingExecutor` that is an a2a-sdk ``AgentExecutor``."""
    from a2a.server.agent_execution import AgentExecutor

    class _Executor(ForwardingExecutor, AgentExecutor):
        pass

    return _Executor(url, timeout=timeout, poll=poll)


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


def _port() -> int:
    with open(_config_path("config.json"), encoding="utf-8") as file:
        runtime = json.load(file).get("runtime") or {}
    return int(runtime.get("port") or 80)


async def serve() -> int:
    """Run the bridge until agent-runtimes exits or the actor is stopped."""
    if os.environ.get("KAGENT_BOOTSTRAP_JSON"):
        from kagent.core import materialize_from_bootstrap

        materialize_from_bootstrap(
            os.environ.get(CONFIG_DIR_VARIABLE) or DEFAULT_CONFIG_DIR
        )
    local = (os.environ.get(LOCAL_VARIABLE) or "").strip().lower() == "true"
    child = await asyncio.create_subprocess_exec(
        os.environ.get(COMMAND_VARIABLE) or DEFAULT_COMMAND,
        "serve",
        "--target",
        "kagent",
        env={**os.environ, "KAGENT_CONFIG_PATH": _config_path("config.json")},
    )
    forward = executor(
        upstream_url(),
        timeout=float(os.environ.get(TIMEOUT_VARIABLE) or DEFAULT_TIMEOUT),
    )
    handler, controller = request_handler(_card(), forward, local)
    address = f"[::]:{_port()}"
    server = await grpc_server(handler, address)
    ready = await readiness_server()
    logger.info(
        "kagent bridge: A2A gRPC on %s, /readyz on %d, forwarding to %s",
        address,
        READY_PORT,
        upstream_url(),
    )

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop.set)
    waiter = asyncio.create_task(child.wait())
    stopper = asyncio.create_task(stop.wait())
    await asyncio.wait({waiter, stopper}, return_when=asyncio.FIRST_COMPLETED)
    if child.returncode is None:
        child.terminate()
        with suppress(asyncio.TimeoutError):
            await asyncio.wait_for(child.wait(), 20)
    ready.close()
    await server.stop(grace=5)
    await forward.client.aclose()
    if controller is not None:
        await controller.close()
    stopper.cancel()
    return 0 if stop.is_set() else (child.returncode or 1)


def main() -> None:
    """The bridge's entry point (the Harness's command)."""
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s"
    )
    sys.exit(asyncio.run(serve()))


if __name__ == "__main__":
    main()
