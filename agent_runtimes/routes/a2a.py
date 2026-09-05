# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
A2A (Agent-to-Agent) protocol routes.

Implements the A2A protocol with fasta2a. Every registered agent gets a FastA2A
application mounted under ``{api_prefix}/a2a/agents/{agent_id}``, run by the
`A2AWorker` of ``transports/a2a.py`` — the agent adapter with everything it has
(MCP servers, skills, codemode, guardrails), streamed over ``message/stream``.
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any, AsyncIterator

from fastapi import APIRouter
from pydantic import BaseModel
from starlette.routing import Mount

try:
    from fasta2a import FastA2A, Skill
    from fasta2a.broker import InMemoryBroker
    from fasta2a.schema import AgentProvider
    from fasta2a.storage import InMemoryStorage

    FASTA2A_AVAILABLE = True
except ImportError:
    FASTA2A_AVAILABLE = False
    FastA2A = None
    Skill = None

from ..adapters.base import BaseAgent

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/a2a", tags=["A2A"])


@dataclass
class A2AAgentCard:
    """Agent card configuration for A2A discovery."""

    id: str
    name: str
    description: str
    url: str
    version: str = "1.0.0"
    skills: list[dict[str, Any]] | None = None
    provider: dict[str, str] | None = None


@dataclass
class A2AAgentRegistration:
    """Registration info for an A2A agent."""

    agent: BaseAgent
    card: A2AAgentCard
    app: Any | None = None  # FastA2A instance
    broker: Any | None = None
    storage: Any | None = None


# In-memory store for registered A2A agents
_a2a_agents: dict[str, A2AAgentRegistration] = {}
_a2a_mounts: list[Mount] = []

# Store app reference for dynamic mounting
_app: Any | None = None
_api_prefix: str = "/api/v1"

# Track running tasks per task ID for termination
# Maps task_id to a cancellation event
_running_tasks: dict[str, asyncio.Event] = {}


class TerminateRequest(BaseModel):
    """Request to terminate a running A2A task."""

    task_id: str | None = None


class TerminateResponse(BaseModel):
    """Response from terminate request."""

    success: bool
    message: str
    task_id: str | None = None


def register_task(task_id: str) -> asyncio.Event:
    """
    Register a running task and return its cancellation event.

    Args:
        task_id: The unique task identifier.

    Returns:
        An asyncio.Event that can be set to signal cancellation.
    """
    cancel_event = asyncio.Event()
    _running_tasks[task_id] = cancel_event
    logger.debug(f"Registered A2A task: {task_id}")
    return cancel_event


def unregister_task(task_id: str) -> None:
    """
    Unregister a task when it completes.

    Args:
        task_id: The task identifier to remove.
    """
    if task_id in _running_tasks:
        del _running_tasks[task_id]
        logger.debug(f"Unregistered A2A task: {task_id}")


def cancel_task(task_id: str) -> bool:
    """
    Cancel a running task.

    Args:
        task_id: The task identifier to cancel.

    Returns:
        True if the task was found and cancelled, False otherwise.
    """
    if task_id in _running_tasks:
        _running_tasks[task_id].set()
        logger.info(f"Cancelled A2A task: {task_id}")
        return True
    return False


def cancel_all_tasks() -> int:
    """
    Cancel all running tasks.

    Returns:
        Number of tasks cancelled.
    """
    count = 0
    for task_id, cancel_event in _running_tasks.items():
        cancel_event.set()
        count += 1
        logger.info(f"Cancelled A2A task: {task_id}")
    return count


def set_a2a_app(app: Any, api_prefix: str = "/api/v1") -> None:
    """
    Set the FastAPI app reference for dynamic route mounting.
    """
    global _app, _api_prefix
    _app = app
    _api_prefix = api_prefix


def register_a2a_agent(
    agent: BaseAgent,
    card: A2AAgentCard,
    broker: Any | None = None,
    storage: Any | None = None,
) -> None:
    """
    Register an agent with the A2A server.

    Builds a FastA2A application for the agent — its own storage and broker,
    and an `A2AWorker` running the agent adapter — and mounts it under
    ``{api_prefix}/a2a/agents/{agent_id}``. Any `BaseAgent` will do: the worker
    speaks to the adapter, not to the framework agent underneath it, so the
    agent answers over A2A with the same tools and guardrails it has over the
    other transports.

    Args:
        agent: The agent to register.
        card: Agent card configuration.
        broker: Optional custom broker (defaults to InMemoryBroker).
        storage: Optional custom storage (defaults to InMemoryStorage).
    """
    if not FASTA2A_AVAILABLE:
        logger.warning("fasta2a not installed, A2A agent registration skipped")
        return

    agent_id = card.id

    from ..transports.a2a import A2AWorker

    try:
        # Convert skills to fasta2a Skill format if provided
        skills = None
        if card.skills:
            skills = [
                Skill(
                    id=s.get("id", s.get("name", "").lower().replace(" ", "-")),
                    name=s.get("name", ""),
                    description=s.get("description"),
                )
                for s in card.skills
            ]

        # Convert provider to fasta2a AgentProvider if provided
        provider = None
        if card.provider:
            provider = AgentProvider(
                organization=card.provider.get("organization", ""),
                url=card.provider.get("url", ""),
            )

        a2a_broker = broker or InMemoryBroker()
        a2a_storage = storage or InMemoryStorage()
        worker = A2AWorker(broker=a2a_broker, storage=a2a_storage, agent=agent)

        @asynccontextmanager
        async def lifespan(app: Any) -> AsyncIterator[None]:
            # The task manager and the worker start and stop together. A
            # mounted app's lifespan does not run on its own; it is driven
            # from here, at registration or at server startup.
            async with app.task_manager, worker.run():
                yield

        a2a_app = FastA2A(
            storage=a2a_storage,
            broker=a2a_broker,
            name=card.name,
            url=card.url,
            version=card.version,
            description=card.description,
            provider=provider,
            skills=skills,
            lifespan=lifespan,
        )

        registration = A2AAgentRegistration(
            agent=agent,
            card=card,
            app=a2a_app,
            broker=a2a_broker,
            storage=a2a_storage,
        )
        _a2a_agents[agent_id] = registration

        # Create mount for this agent
        mount = Mount(f"/{agent_id}", app=a2a_app)
        _a2a_mounts.append(mount)

        # If app is available, also add route dynamically to running app
        if _app is not None:
            full_mount = Mount(f"{_api_prefix}/a2a/agents/{agent_id}", app=a2a_app)
            _app.routes.append(full_mount)
            logger.info(
                f"Dynamically mounted A2A route: {_api_prefix}/a2a/agents/{agent_id}/"
            )
            try:
                lifespan_context = a2a_app.router.lifespan_context(a2a_app)
                a2a_app._lifespan_task = asyncio.create_task(
                    _start_a2a_lifespan(agent_id, a2a_app, lifespan_context)
                )
            except Exception as e:
                logger.warning(f"Could not start lifespan for {agent_id}: {e}")

        logger.info(f"Registered A2A agent: {agent_id} ({card.name})")

    except Exception as e:
        logger.error(f"Failed to create A2A app for {agent_id}: {e}")
        raise


def unregister_a2a_agent(agent_id: str) -> None:
    """
    Unregister an agent from the A2A server.
    """
    if agent_id in _a2a_agents:
        # Stop lifespan if running
        registration = _a2a_agents[agent_id]
        if registration.app is not None:
            try:
                _request_lifespan_stop(agent_id, registration.app)
            except Exception as e:
                logger.warning(f"Could not stop lifespan for {agent_id}: {e}")

        del _a2a_agents[agent_id]
        # Remove mount from internal list
        global _a2a_mounts
        _a2a_mounts = [m for m in _a2a_mounts if m.path != f"/{agent_id}"]

        # Remove mount from running app
        if _app is not None:
            mount_path = f"{_api_prefix}/a2a/agents/{agent_id}"
            _app.routes = [
                r
                for r in _app.routes
                if not (hasattr(r, "path") and r.path == mount_path)
            ]
            logger.info(f"Dynamically removed A2A route: {mount_path}/")

        try:
            from ..streams.loop import purge_agent_stream_state

            purge_agent_stream_state(agent_id)
        except Exception as e:
            logger.debug("Could not purge stream state for %s: %s", agent_id, e)

        logger.info(f"Unregistered A2A agent: {agent_id}")


def get_a2a_agents() -> dict[str, A2AAgentRegistration]:
    """
    Get all registered A2A agents.
    """
    return _a2a_agents


def get_a2a_mounts() -> list[Mount]:
    """
    Get all A2A mounts for the FastAPI application.
    """
    return _a2a_mounts


async def _start_a2a_lifespan(agent_id: str, app: Any, lifespan: Any) -> None:
    """
    Run a dynamically registered agent's lifespan, in a task of its own, until asked to stop.

    Entered and exited in the same task on purpose: the lifespan runs the
    worker's anyio task group, and anyio refuses to exit a cancel scope from a
    task other than the one that entered it — which is what shutdown did when
    it exited a context this task had entered, and logged an error for.
    """
    stop = asyncio.Event()
    app._lifespan_stop = stop
    try:
        await lifespan.__aenter__()
    except Exception as e:
        logger.error(f"Failed to start lifespan for {agent_id}: {e}")
        return
    app._lifespan_context = lifespan
    logger.info(f"Started lifespan for dynamically registered A2A agent: {agent_id}")
    try:
        await stop.wait()
    finally:
        try:
            await lifespan.__aexit__(None, None, None)
            logger.info(f"Stopped lifespan for A2A agent: {agent_id}")
        except Exception as e:
            logger.warning(f"Could not stop lifespan for {agent_id}: {e}")


def _request_lifespan_stop(agent_id: str, app: Any) -> "asyncio.Task[None] | None":
    """
    Ask a dynamically registered agent's lifespan task to stop; returns it, to await.

    An app whose lifespan was entered at server startup has no task of its own
    and is stopped where it was started, in `stop_a2a_task_managers`.
    """
    stop = getattr(app, "_lifespan_stop", None)
    task = getattr(app, "_lifespan_task", None)
    if stop is None:
        return None
    stop.set()
    return task


async def start_a2a_task_managers() -> None:
    """
    Start all A2A TaskManagers.

    When FastA2A apps are mounted as sub-applications, their lifespan context
    managers don't run automatically. We need to manually trigger them.
    """
    for agent_id, registration in _a2a_agents.items():
        if registration.app:
            try:
                # Trigger the FastA2A app's lifespan startup
                if hasattr(registration.app, "router") and hasattr(
                    registration.app.router, "lifespan_context"
                ):
                    # Store the lifespan context for cleanup later
                    lifespan = registration.app.router.lifespan_context(
                        registration.app
                    )
                    await lifespan.__aenter__()
                    # Store it for shutdown
                    registration.app._lifespan_context = lifespan
                    logger.info(f"Started lifespan for A2A agent: {agent_id}")
            except Exception as e:
                logger.error(f"Failed to start lifespan for {agent_id}: {e}")
                raise


async def stop_a2a_task_managers() -> None:
    """
    Stop all A2A TaskManagers.

    Clean up the FastA2A app lifespan contexts.
    """
    for agent_id, registration in _a2a_agents.items():
        app = registration.app
        if app is None:
            continue
        try:
            task = _request_lifespan_stop(agent_id, app)
            if task is not None:
                # Dynamically registered: its own task exits the context.
                await asyncio.wait_for(task, timeout=10)
            elif hasattr(app, "_lifespan_context"):
                await app._lifespan_context.__aexit__(None, None, None)
                logger.info(f"Stopped lifespan for A2A agent: {agent_id}")
        except Exception as e:
            logger.error(f"Failed to stop lifespan for {agent_id}: {e}")


# REST endpoint to list available A2A agents
@router.get("/agents")
async def list_a2a_agents() -> dict[str, Any]:
    """
    List all available A2A agents.

    Returns agent metadata for discovery. Each agent's full A2A endpoints
    are available at `/api/v1/a2a/agents/{agent_id}/`.
    """
    agents = []
    for agent_id, registration in _a2a_agents.items():
        card = registration.card
        agents.append(
            {
                "id": agent_id,
                "name": card.name,
                "description": card.description,
                "url": card.url,
                "version": card.version,
                "endpoints": {
                    "agent_card": f"/api/v1/a2a/agents/{agent_id}/.well-known/agent-card.json",
                    "rpc": f"/api/v1/a2a/agents/{agent_id}/",
                },
            }
        )
    return {"agents": agents}


@router.post("/terminate", response_model=TerminateResponse)
async def terminate_task(request: TerminateRequest) -> TerminateResponse:
    """
    Terminate a running A2A task or all tasks.

    This endpoint allows clients to stop running agent executions.
    If task_id is provided, only that task is cancelled.
    If task_id is None, all running tasks are cancelled.

    Args:
        request: Terminate request with optional task_id.

    Returns:
        Result of the termination request.
    """
    if request.task_id:
        # Cancel specific task
        if cancel_task(request.task_id):
            return TerminateResponse(
                success=True,
                message=f"Task {request.task_id} has been terminated",
                task_id=request.task_id,
            )
        else:
            return TerminateResponse(
                success=False,
                message=f"Task {request.task_id} not found or already completed",
                task_id=request.task_id,
            )
    else:
        # Cancel all tasks
        count = cancel_all_tasks()
        return TerminateResponse(
            success=True,
            message=f"Terminated {count} running task(s)",
        )


@router.get("/tasks")
async def list_tasks() -> dict[str, Any]:
    """
    List all running A2A tasks.

    Returns:
        Dictionary with list of running task IDs.
    """
    return {
        "tasks": list(_running_tasks.keys()),
        "count": len(_running_tasks),
    }
