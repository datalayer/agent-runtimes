# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Delegation to agents reached over A2A.

A subagent need not run inside the parent's process. One declared with an
``a2a`` target is a separate agent spoken to over the A2A protocol: either one
already running at a URL, or one this module launches from an agentspec — on
the local agent-runtimes server when the parent runs locally, on a Datalayer
runtime when the parent runs in the cloud.

Launching reuses the client this package already has (`ensure_local_agent`,
`AgentClient.create_runtime`) rather than a second way of starting agents, and
the remote run is republished on the parent's monitoring stream through the
same ``agent.subagent`` events an in-process subagent produces, with
``transport: "a2a"`` on them so a reader can tell the two apart.

A run the orchestration control plane dispatched takes no child this way
(ORCHESTRATOR.md, 19.8 decision 2, O2-06): it asks the control plane for one
(``request_child``), which resolves, authorizes and dispatches it inside the
tree's budget and depth, and resolving, launching or relaying to an agent
itself is refused (``ChildNotRequested``).
"""

from __future__ import annotations

import asyncio
import contextlib
import hashlib
import logging
import os
import re
import uuid
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, AsyncIterator, Callable, Literal, Mapping

if TYPE_CHECKING:
    from datalayer_core.orchestration import AgentBinding

logger = logging.getLogger(__name__)

LaunchMode = Literal["local", "cloud", "auto"]

TERMINAL_STATES = frozenset({"completed", "canceled", "failed", "rejected"})

DEFAULT_LOCAL_AGENT_RUNTIMES_URL = "http://127.0.0.1:8765"

EmitFn = Callable[..., None]
"""``emit(phase, **payload)``: republish one step of the remote run."""


@dataclass(frozen=True)
class A2ARemoteTarget:
    """Where an A2A subagent lives, or how to launch it.

    Parameters
    ----------
    url : str | None
        The JSON-RPC endpoint of an agent already running.
    spec_id : str | None
        The agentspec to launch an agent from, when there is no ``url``.
    launch : str
        ``local``, ``cloud`` or ``auto`` — the last picks by where the parent
        runs, which is the default and nearly always right.
    environment : str | None
        Runtime environment for a cloud launch.
    """

    url: str | None = None
    spec_id: str | None = None
    launch: str = "auto"
    environment: str | None = None

    def __post_init__(self) -> None:
        if not self.url and not self.spec_id:
            raise ValueError("An A2A subagent needs a url or an agentspec to launch")


@dataclass
class A2ARemoteAgent:
    """An A2A agent this parent can talk to, once resolved or launched."""

    name: str
    url: str
    launch: str
    card: dict[str, Any] | None = None
    runtime_uid: str | None = None
    token: str | None = field(default=None, repr=False)

    @property
    def terminate_url(self) -> str | None:
        """agent-runtimes' out-of-band stop for a task, when the agent is one of ours.

        A2A's own ``tasks/cancel`` reaches a worker only between tasks; this
        endpoint interrupts the running one.
        """
        marker = "/api/v1/a2a/agents/"
        if marker not in self.url:
            return None
        return f"{self.url.split(marker, 1)[0]}/api/v1/a2a/terminate"

    def describe(self) -> dict[str, Any]:
        """What the transcript is told about this agent."""
        payload: dict[str, Any] = {
            "transport": "a2a",
            "url": self.url,
            "launch": self.launch,
        }
        if self.runtime_uid:
            payload["runtimeUid"] = self.runtime_uid
        summary = card_summary(self.card)
        if summary:
            payload["agentCard"] = summary
        return payload


def running_in_cloud() -> bool:
    """Whether this agent-runtimes server is itself a Datalayer runtime."""
    return bool((os.environ.get("DATALAYER_RUNTIME_ID") or "").strip())


def resolve_launch(mode: str | None) -> str:
    """``local`` or ``cloud``: an explicit choice, else where the parent runs."""
    normalized = (mode or "auto").strip().lower()
    if normalized in {"local", "cloud"}:
        return normalized
    return "cloud" if running_in_cloud() else "local"


def local_agent_runtimes_url() -> str:
    """The URL this server answers on, for launching a sibling agent on it."""
    explicit = (os.environ.get("AGENT_RUNTIMES_URL") or "").strip()
    if explicit:
        return explicit.rstrip("/")
    host = (os.environ.get("AGENT_RUNTIMES_HOST") or "").strip() or "127.0.0.1"
    if host in {"0.0.0.0", "::", "[::]"}:
        host = "127.0.0.1"
    port = (os.environ.get("AGENT_RUNTIMES_PORT") or "").strip()
    if not port:
        return DEFAULT_LOCAL_AGENT_RUNTIMES_URL
    return f"http://{host}:{port}"


def caller_token() -> str | None:
    """The token to launch and call with: the request's user, else the server's key."""
    try:
        from ..context.identities import get_request_user_jwt

        token = get_request_user_jwt()
    except Exception:  # noqa: BLE001 - context is optional
        token = None
    return token or (os.environ.get("DATALAYER_API_KEY") or "").strip() or None


class ChildNotRequested(PermissionError):
    """A worker reaching or starting a child itself, rather than asking the control plane for it (O2-06)."""


def refuse_in_an_orchestrated_run(what: str) -> None:
    """
    Refuse, inside a run the control plane dispatched, what only it may do.

    Such a run asks for its children (``request_child``). An agent it
    resolved, launched or relayed to itself would be a child the tree's
    budget and depth never saw (19.8, decision 2).

    Parameters
    ----------
    what : str
        What was attempted, in the words of the refusal.

    Raises
    ------
    ChildNotRequested
        When the current run works on an execution.
    """
    from ..context.delegation import run_execution

    execution = run_execution()
    if execution is not None:
        raise ChildNotRequested(
            f"The worker of execution '{execution.get('executionId')}' does not {what} "
            "itself: it asks the control plane for a child execution."
        )


def child_slot(name: str, task: str) -> str:
    """
    A requested child's place under its parent: the subagent, and the task it was given.

    The same task to the same subagent is the same child, so a run replayed
    after its worker restarted finds the child it asked for rather than
    starting a second (O2-01); another task is another child.

    Parameters
    ----------
    name : str
        The subagent.
    task : str
        The task it is given.

    Returns
    -------
    str
        A slot the control plane takes: a letter or a digit, then at most 63
        letters, digits, ``.``, ``_``, ``:`` or ``-``.
    """
    stem = re.sub(r"[^A-Za-z0-9._-]+", "-", name).strip("-._")[:48] or "subagent"
    return f"{stem}:{hashlib.sha256(task.encode()).hexdigest()[:12]}"


def _orchestration_client(token: str) -> Any:
    """The client a worker asks the control plane with, as its execution."""
    from datalayer_core.utils.urls import DatalayerURLs

    from ..client.agent_client import AgentClient

    return AgentClient(urls=DatalayerURLs.from_environment(), api_key=token)


async def request_child(
    execution: Mapping[str, Any],
    name: str,
    agent: AgentBinding,
    task: str,
    *,
    emit: EmitFn,
) -> str:
    """
    Ask the control plane for a child execution, follow it, and answer with what it produced.

    Asked with the run's own token, which the control plane holds to the
    run's execution (O2-06). The child is resolved, authorized, dispatched,
    watched and committed as any execution is, over whichever protocol its
    agent speaks: the control plane places an A2A child and an ACP child
    under the same parent alike. What it does reaches the parent's stream as
    the phases a relayed subagent's run produces, and a parent that stops
    cancels it.

    Parameters
    ----------
    execution : Mapping[str, Any]
        The run's execution, as its delegation named it.
    name : str
        The child's name under its parent: with the task, its slot.
    agent : AgentBinding
        The agent it is delegated to: an A2A subagent's URL or agentspec, or
        an ACP agent's endpoint.
    task : str
        The task it is given.
    emit : EmitFn
        Where the child's progress is republished.

    Returns
    -------
    str
        The text of what the child's completing attempt produced.

    Raises
    ------
    ChildNotRequested
        When the run holds no token of its execution's to ask with.
    RuntimeError
        When the child did not complete, saying how it ended.
    """
    from datalayer_core.orchestration import (
        ExecutionEventType,
        ExecutionsCancel,
        ExecutionsCollect,
        ExecutionsDelegate,
        ExecutionState,
        Objective,
    )

    from ..context.identities import get_request_user_jwt

    parent = str(execution.get("executionId") or "")
    token = get_request_user_jwt()
    if not token:
        raise ChildNotRequested(
            f"The worker of execution '{parent}' holds no token of its execution's, "
            "so it cannot ask the control plane for a child."
        )
    account_uid = str(execution.get("accountUid") or "") or None
    slot = child_slot(name, task)
    client = _orchestration_client(token)
    receipt = await asyncio.to_thread(
        client.delegate_execution,
        ExecutionsDelegate(
            idempotency_key=f"{parent}:{slot}",
            parent_execution_id=parent,
            slot=slot,
            agent=agent,
            objective=Objective(goal=task),
        ),
        account_uid=account_uid,
    )
    child = receipt.execution.execution_id
    emit("status", state="requested", executionId=child)

    loop = asyncio.get_running_loop()
    events: asyncio.Queue[Any] = asyncio.Queue()

    def follow() -> None:
        try:
            for event, _ in client.subscribe_execution(
                child, include_children=False, account_uid=account_uid
            ):
                loop.call_soon_threadsafe(events.put_nowait, event)
        finally:
            loop.call_soon_threadsafe(events.put_nowait, None)

    following = asyncio.ensure_future(asyncio.to_thread(follow))
    state = receipt.execution.status
    error = receipt.execution.error
    bodies: dict[tuple[str, str], str] = {}
    try:
        while (event := await events.get()) is not None:
            data = dict(event.data or {})
            if event.type is ExecutionEventType.STATE_CHANGED and event.state is not None:
                state, error = event.state, event.error or error
                emit("status", state=state.value, executionId=child)
            elif event.type is ExecutionEventType.ARTIFACT_REGISTERED and event.artifact:
                produced_by = event.artifact.provenance[-1].attempt_id if event.artifact.provenance else ""
                if isinstance(data.get("text"), str):
                    bodies[(event.artifact.artifact_id, produced_by)] = data["text"]
            elif event.type is ExecutionEventType.PROGRESS and isinstance(data.get("phase"), str):
                # A relayed phase of the child's worker, told as its own.
                emit(data.pop("phase"), **data)
        await following
    except asyncio.CancelledError:
        # The parent stopped, and so does the child it asked for.
        with contextlib.suppress(Exception):
            await asyncio.to_thread(
                client.cancel_execution,
                ExecutionsCancel(
                    idempotency_key=f"{parent}:{slot}:cancel",
                    execution_id=child,
                    reason="Its parent's run stopped.",
                ),
                account_uid=account_uid,
            )
        raise
    if state is not ExecutionState.COMPLETED:
        said = f": {error.message}" if error is not None else "."
        raise RuntimeError(f"Child execution '{child}' ended {state.value}{said}")
    collected = await asyncio.to_thread(
        client.collect_execution, ExecutionsCollect(execution_id=child), account_uid=account_uid
    )
    completing = collected.execution.current_attempt_id or ""
    return "\n\n".join(
        bodies[key]
        for key in ((artifact.artifact_id, completing) for artifact in collected.artifacts)
        if key in bodies
    )


def a2a_agent_url(base_url: str, agent_id: str) -> str:
    """Where agent-runtimes mounts an agent's A2A endpoint."""
    return f"{base_url.rstrip('/')}/api/v1/a2a/agents/{agent_id}"


def spec_id_of(ref: str | None) -> str | None:
    """The agentspec id in a ``<id>:<version>`` reference."""
    if not ref:
        return None
    return ref.split(":", 1)[0].strip() or None


def agent_name_for(subagent_name: str) -> str:
    """The name the launched agent is registered under."""
    slug = re.sub(r"[^a-z0-9]+", "-", subagent_name.lower()).strip("-") or "agent"
    return f"a2a-{slug}"


def spec_declares_skills(spec_id: str) -> bool:
    """Whether the agentspec lists skills, read from this server's catalogue.

    ``False`` when the spec is not in the catalogue here — the launching server
    resolves the spec itself; this only decides whether to hand it a toolset.
    """
    try:
        from agent_runtimes.specs.agents.agents import get_agent_spec

        spec = get_agent_spec(spec_id)
    except Exception:  # noqa: BLE001 - catalogue absent or spec unknown
        return False
    return bool(getattr(spec, "skills", None))


def card_summary(card: dict[str, Any] | None) -> dict[str, Any] | None:
    """The part of an agent card worth showing: name, description, version, skills."""
    if not isinstance(card, dict):
        return None
    summary: dict[str, Any] = {}
    for key in ("name", "description", "version", "url"):
        if card.get(key):
            summary[key] = card[key]
    skills = card.get("skills")
    if isinstance(skills, list):
        summary["skills"] = [
            str(skill.get("name") or skill.get("id"))
            for skill in skills
            if isinstance(skill, dict) and (skill.get("name") or skill.get("id"))
        ]
    return summary or None


async def fetch_agent_card(
    url: str, token: str | None = None, *, attempts: int = 1, delay: float = 0.5
) -> dict[str, Any] | None:
    """The agent card at ``url``, or ``None`` — a card is nice to have, not needed.

    With ``attempts`` above one this doubles as a readiness check: a just-mounted
    A2A app answers its card only once its task manager runs.
    """
    import httpx

    headers = {"Authorization": f"Bearer {token}"} if token else {}
    for attempt in range(max(1, attempts)):
        try:
            async with httpx.AsyncClient(timeout=10.0, headers=headers) as http:
                response = await http.get(
                    f"{url.rstrip('/')}/.well-known/agent-card.json"
                )
                if response.status_code < 400:
                    data = response.json()
                    return data if isinstance(data, dict) else None
        except Exception:  # noqa: BLE001 - best effort
            logger.debug("Could not fetch the agent card at %s", url, exc_info=True)
        if attempt + 1 < attempts:
            await asyncio.sleep(delay)
    return None


async def ensure_remote_agent(
    name: str, description: str, target: A2ARemoteTarget
) -> A2ARemoteAgent:
    """Resolve the agent for ``target``, launching it if it is an agentspec.

    A ``url`` is taken as is. An agentspec is launched through the same client
    calls the CLI and the evals use: `ensure_local_agent` against this server
    for a local launch, `AgentClient.create_runtime` and then the same
    registration against the new runtime for a cloud one.

    Refused inside a run the control plane dispatched, which asks for its
    children instead (O2-06).
    """
    refuse_in_an_orchestrated_run("resolve or launch an agent")
    token = caller_token()
    if target.url:
        remote = A2ARemoteAgent(
            name=name, url=target.url.rstrip("/"), launch="remote", token=token
        )
        remote.card = await fetch_agent_card(remote.url, token)
        return remote

    launch = resolve_launch(target.launch)
    runtime_uid: str | None = None
    if launch == "cloud":
        base_url, runtime_uid = await asyncio.to_thread(
            _launch_cloud_runtime, target, token
        )
    else:
        base_url = local_agent_runtimes_url()
    return await serve_agentspec(
        name,
        description,
        str(target.spec_id),
        base_url,
        token,
        launch=launch,
        runtime_uid=runtime_uid,
        # Provisioned is not answering yet: wait for the runtime's server.
        wait=launch == "cloud",
    )


async def serve_agentspec(
    name: str,
    description: str,
    spec_id: str,
    base_url: str,
    token: str | None,
    *,
    launch: str,
    runtime_uid: str | None = None,
    wait: bool = False,
) -> A2ARemoteAgent:
    """
    Register an agentspec on an agent-runtimes server over A2A, and answer the agent it serves.

    What launching an agent comes down to once there is a server to launch it
    on: this server, a Datalayer runtime this module launched, or the runtime
    the orchestration control plane brought up for an execution (O2-06).

    Parameters
    ----------
    name : str
        The agent's name, which its registration is derived from.
    description : str
        What it is for.
    spec_id : str
        The agentspec.
    base_url : str
        The agent-runtimes server to register it on.
    token : str | None
        Who registers it, and calls it.
    launch : str
        Where it was launched, for the transcript.
    runtime_uid : str | None
        The runtime it runs on, when it has one of its own.
    wait : bool
        Whether the server may still be starting, as a runtime just
        provisioned is.

    Returns
    -------
    A2ARemoteAgent
        The agent, with its card.

    Raises
    ------
    ChildNotRequested
        Inside a run the control plane dispatched.
    """
    refuse_in_an_orchestrated_run("launch an agent")
    from ..client.agent_client import ensure_local_agent, wait_for_local_runtime

    if wait:
        await asyncio.to_thread(wait_for_local_runtime, base_url, 180)
    agent_name = agent_name_for(name)
    agent_id = await asyncio.to_thread(
        ensure_local_agent,
        base_url=base_url,
        agent_name=agent_name,
        token=token or "",
        agent_spec_id=spec_id,
        transport="a2a",
        # Skills only when the spec has some: an empty skills toolset is an
        # invitation for the model to call a skill that does not exist.
        enable_skills=spec_declares_skills(spec_id),
        description=description or f"A2A agent '{name}'",
    )
    remote = A2ARemoteAgent(
        name=name,
        url=a2a_agent_url(base_url, agent_id or agent_name),
        launch=launch,
        runtime_uid=runtime_uid,
        token=token,
    )
    remote.card = await fetch_agent_card(remote.url, token, attempts=20)
    return remote


def _launch_cloud_runtime(
    target: A2ARemoteTarget, token: str | None
) -> tuple[str, str | None]:
    """A Datalayer runtime for the agentspec; its agent-runtimes base URL and uid."""
    from datalayer_core.utils.defaults import DEFAULT_ENVIRONMENT
    from datalayer_core.utils.urls import DatalayerURLs

    from ..client.agent_client import AgentClient, build_agent_runtimes_base_url

    client = AgentClient(urls=DatalayerURLs.from_environment(), api_key=token)
    runtime = client.create_runtime(
        environment=target.environment or DEFAULT_ENVIRONMENT,
        agent_spec_id=target.spec_id,
    )
    ingress = getattr(runtime, "ingress", None)
    if not ingress:
        raise RuntimeError("The runtime was created without an ingress to reach it on")
    return build_agent_runtimes_base_url(str(ingress)), getattr(runtime, "uid", None)


@dataclass
class RelayOutcome:
    """What a relayed A2A stream amounted to."""

    task_id: str | None = None
    state: str | None = None
    streamed: str = ""
    final: str | None = None
    detail: str | None = None
    """What the remote agent said with its final status: the reason, when it failed."""
    metadata: dict[str, Any] | None = None
    """The final status message's metadata: which limit of a delegated model
    budget stopped the run, when one did (ORCHESTRATOR.md, O1-07)."""

    @property
    def output(self) -> str:
        return self.final if self.final else self.streamed


def _artifact_text(artifact: dict[str, Any]) -> str:
    return "".join(
        str(part.get("text") or "")
        for part in artifact.get("parts") or []
        if isinstance(part, dict) and "text" in part
    )


def _message_text(message: dict[str, Any]) -> str:
    return "\n".join(
        str(part.get("text"))
        for part in message.get("parts") or []
        if isinstance(part, dict) and part.get("text")
    )


def _relay_message(message: dict[str, Any], emit: EmitFn) -> None:
    for part in message.get("parts") or []:
        if not isinstance(part, dict):
            continue
        if part.get("text"):
            emit("text", text=str(part["text"]))
            continue
        data = part.get("data")
        if not isinstance(data, dict):
            continue
        if isinstance(data.get("tool_call"), dict):
            call = data["tool_call"]
            emit(
                "tool_call",
                toolName=str(call.get("name") or ""),
                toolArgs=call.get("arguments")
                if isinstance(call.get("arguments"), dict)
                else {},
            )
        elif isinstance(data.get("tool_result"), dict):
            result = data["tool_result"]
            emit(
                "tool_result",
                toolName=str(result.get("name") or ""),
                result=str(result.get("error") or result.get("result") or ""),
            )


async def relay_stream(
    responses: AsyncIterator[Any], emit: EmitFn, outcome: RelayOutcome | None = None
) -> RelayOutcome:
    """Republish an A2A ``message/stream`` as subagent phases; return what it amounted to.

    Text parts and appended artifact chunks become ``text``; a data part
    naming a ``tool_call`` or ``tool_result`` becomes that phase; every task
    state change is a ``status`` with the task id, so a reader can follow the
    task; a whole artifact (``append`` false) is kept as the final answer
    rather than repeated as text. Stops at a terminal state.
    """
    # The caller may hand the outcome in, to keep what was learnt — the task
    # id above all — if the relay is cancelled midway.
    outcome = outcome if outcome is not None else RelayOutcome()
    async for response in responses:
        error = response.get("error") if isinstance(response, dict) else None
        if error:
            message = (
                str(error.get("message") or error)
                if isinstance(error, dict)
                else str(error)
            )
            raise RuntimeError(f"A2A error: {message}")
        result = response.get("result") if isinstance(response, dict) else None
        if not isinstance(result, dict):
            continue

        task = result.get("task")
        if isinstance(task, dict):
            outcome.task_id = task.get("id") or outcome.task_id
            outcome.state = (task.get("status") or {}).get("state") or outcome.state
            emit("status", taskId=outcome.task_id, state=outcome.state)

        status_update = result.get("status_update")
        if isinstance(status_update, dict):
            status = status_update.get("status") or {}
            message = status.get("message")
            outcome.task_id = status_update.get("task_id") or outcome.task_id
            outcome.state = status.get("state") or outcome.state
            if outcome.state in TERMINAL_STATES:
                # The message on a final status is the agent's last word — the
                # reason, when it failed — not more of the answer.
                if isinstance(message, dict):
                    outcome.detail = _message_text(message) or None
                    if isinstance(message.get("metadata"), dict):
                        outcome.metadata = dict(message["metadata"])
                emit(
                    "status",
                    taskId=outcome.task_id,
                    state=outcome.state,
                    **({"metadata": outcome.metadata} if outcome.metadata else {}),
                )
                break
            if isinstance(message, dict):
                _relay_message(message, emit)
            emit("status", taskId=outcome.task_id, state=outcome.state)

        artifact_update = result.get("artifact_update")
        if isinstance(artifact_update, dict):
            artifact = artifact_update.get("artifact") or {}
            text = _artifact_text(artifact)
            if artifact_update.get("append") and not artifact_update.get("last_chunk"):
                if text:
                    outcome.streamed += text
                    emit("text", text=text)
            elif text:
                outcome.final = text

        message = result.get("message")
        if isinstance(message, dict):
            _relay_message(message, emit)
    return outcome


async def relay_a2a_task(
    remote: A2ARemoteAgent,
    task: str,
    *,
    context_id: str,
    emit: EmitFn,
    metadata: dict[str, Any] | None = None,
) -> str:
    """Send ``task`` to the remote agent and republish its run; return its answer.

    ``metadata`` goes on the message: what an orchestrated delegation carries
    beside the objective, its model budget (ORCHESTRATOR.md, O1-07).

    Refused inside a run the control plane dispatched, which asks for its
    children instead (O2-06).
    """
    refuse_in_an_orchestrated_run("delegate a task to an agent")
    import httpx
    from fasta2a.client import A2AClient
    from fasta2a.schema import Message, Part

    headers = {"Authorization": f"Bearer {remote.token}"} if remote.token else {}
    async with httpx.AsyncClient(
        base_url=remote.url,
        headers=headers,
        timeout=httpx.Timeout(None, connect=30.0),
    ) as http:
        client = A2AClient(base_url=remote.url, http_client=http)
        message = Message(
            role="user",
            parts=[Part(text=task)],
            message_id=str(uuid.uuid4()),
            context_id=context_id,
        )
        if metadata:
            message["metadata"] = metadata
        outcome = RelayOutcome()
        try:
            await relay_stream(client.stream_message(message), emit, outcome)
        except asyncio.CancelledError:
            # Stopped from the parent's side: tell the remote agent, so it does
            # not go on spending on an answer nobody will read.
            await cancel_remote_task(remote, outcome.task_id)
            raise

        if outcome.state in {"failed", "canceled", "rejected"}:
            reason = f": {outcome.detail}" if outcome.detail else ""
            raise RuntimeError(f"The remote agent's task ended {outcome.state}{reason}")

        output = outcome.output
        if not output and outcome.task_id:
            # An agent that reports nothing while it works still leaves its
            # answer in the task's artifacts.
            response = await client.get_task(outcome.task_id)
            task_result = response.get("result") if isinstance(response, dict) else None
            if isinstance(task_result, dict):
                output = "\n".join(
                    filter(
                        None,
                        (_artifact_text(a) for a in task_result.get("artifacts") or []),
                    )
                )
        return output


async def cancel_remote_task(remote: A2ARemoteAgent, task_id: str | None) -> None:
    """Ask the remote agent to stop a task; best effort, bounded, never raises.

    Both ways it can be asked: agent-runtimes' terminate endpoint, which
    interrupts a running task, and A2A's ``tasks/cancel``, which any A2A
    server understands.
    """
    if not task_id:
        return
    import httpx

    headers = {"Authorization": f"Bearer {remote.token}"} if remote.token else {}
    try:
        async with httpx.AsyncClient(headers=headers, timeout=5.0) as http:
            if remote.terminate_url:
                try:
                    await http.post(remote.terminate_url, json={"task_id": task_id})
                except Exception:  # noqa: BLE001 - best effort
                    logger.debug("terminate failed for %s", task_id, exc_info=True)
            try:
                await http.post(
                    remote.url.rstrip("/") + "/",
                    json={
                        "jsonrpc": "2.0",
                        "id": str(uuid.uuid4()),
                        "method": "tasks/cancel",
                        "params": {"id": task_id},
                    },
                )
            except Exception:  # noqa: BLE001 - best effort
                logger.debug("tasks/cancel failed for %s", task_id, exc_info=True)
    except Exception:  # noqa: BLE001 - best effort
        logger.debug(
            "Could not reach %s to cancel %s", remote.url, task_id, exc_info=True
        )
