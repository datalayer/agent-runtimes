# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""FastAPI routes for frontend configuration."""

import asyncio
import json
import logging
import os
from pathlib import Path as FilePath
from typing import Any

from fastapi import (
    APIRouter,
    HTTPException,
    Path,
    Query,
    WebSocket,
    WebSocketDisconnect,
)
from pydantic import BaseModel

from agent_runtimes.config import get_frontend_config
from agent_runtimes.context.usage import get_usage_tracker
from agent_runtimes.mcp import (
    get_available_tools,
    get_config_mcp_toolsets_info,
    get_config_mcp_toolsets_status,
    get_mcp_manager,
)
from agent_runtimes.types import FrontendConfig

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/configure", tags=["configure"])


# =========================================================================
# Codemode Configuration Models
# =========================================================================


class SandboxStatus(BaseModel):
    """
    Code sandbox status.

    For two-container setups (Kubernetes), the mcp_proxy_url enables
    the Jupyter kernel to call MCP tools via HTTP to the agent-runtimes container.
    """

    variant: str  # "local-eval" or "local-jupyter"
    jupyter_url: str | None = None
    jupyter_connected: bool = False
    jupyter_error: str | None = None
    sandbox_running: bool = False
    is_executing: bool = False
    generated_path: str | None = None
    skills_path: str | None = None
    python_path: str | None = None
    mcp_proxy_url: str | None = None


class CodemodeStatus(BaseModel):
    """Codemode status response."""

    enabled: bool
    skills: list[dict[str, Any]]
    available_skills: list[dict[str, Any]]
    sandbox: SandboxStatus | None = None


class CodemodeToggleRequest(BaseModel):
    """Request to toggle codemode."""

    enabled: bool
    skills: list[str] | None = None


# =========================================================================
# Codemode State (runtime state, not persistent)
# =========================================================================

_codemode_state: dict[str, Any] = {
    "enabled": os.environ.get("AGENT_RUNTIMES_CODEMODE", "").lower() == "true",
    "skills": [
        s.strip()
        for s in os.environ.get("AGENT_RUNTIMES_SKILLS", "").split(",")
        if s.strip()
    ],
}


@router.get("", response_model=FrontendConfig)
async def get_configuration(
    mcp_url: str | None = Query(
        None,
        description="MCP server URL to fetch tools from",
    ),
    mcp_token: str | None = Query(
        None,
        description="Authentication token for MCP server",
    ),
) -> Any:
    """
    Get frontend configuration.

    Returns configuration information for the frontend:
    - Available models
    - Builtin tools (fetched from MCP server if URL provided)
    - MCP servers
    """
    try:
        # Fetch tools from MCP server if URL provided
        available_tools: list[dict[str, Any]] = []
        if mcp_url:
            logger.info(f"Fetching tools from MCP server: {mcp_url}")
            available_tools = await get_available_tools(
                base_url=mcp_url,
                token=mcp_token,
            )
            logger.info(f"Fetched {len(available_tools)} tools from MCP server")

        # Get MCP servers - try lifecycle manager first, then fallback to mcp_manager
        mcp_servers = []
        try:
            from agent_runtimes.mcp.lifecycle import get_mcp_lifecycle_manager

            lifecycle_manager = get_mcp_lifecycle_manager()
            running_instances = lifecycle_manager.get_all_running_servers()
            logger.info(
                f"Lifecycle manager has {len(running_instances)} running instances"
            )
            if running_instances:
                mcp_servers = [instance.config for instance in running_instances]
                logger.info(f"Got {len(mcp_servers)} servers from lifecycle manager")
        except Exception as e:
            logger.warning(f"Lifecycle manager error: {e}", exc_info=True)

        # Fallback to mcp_manager if lifecycle manager has no servers
        if not mcp_servers:
            mcp_manager = get_mcp_manager()
            mcp_servers = mcp_manager.get_servers()
            logger.debug(f"Got {len(mcp_servers)} servers from mcp_manager (fallback)")

        # Build frontend config
        config = await get_frontend_config(
            tools=available_tools,
            mcp_servers=mcp_servers,
        )

        return config

    except Exception as e:
        logger.error(f"Error getting configuration: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/mcp-toolsets-status")
async def get_toolsets_status() -> dict[str, Any]:
    """
    Get the status of config MCP toolsets for Pydantic AI agents.

    Returns:
        Status information including ready, pending, and failed servers.
    """
    return get_config_mcp_toolsets_status()


@router.get("/mcp-toolsets-info")
async def get_toolsets_info() -> list[dict[str, Any]]:
    """
    Get information about running config MCP toolsets.

    Returns:
        List of running MCP server information (sensitive data redacted).
    """
    return get_config_mcp_toolsets_info()


@router.get("/agents/{agent_id:path}/context-details")
async def get_agent_context_details(
    agent_id: str = Path(
        ...,
        description="Agent ID to get context details for",
    ),
) -> dict[str, Any]:
    """
    Get context usage details for a specific agent.

    Returns context information including:
    - Total tokens available (context window)
    - Used tokens
    - Breakdown by category (messages, tools, system, cache)

    Args:
        agent_id: The unique identifier of the agent.

    Returns:
        Context usage details for the agent.
    """
    tracker = get_usage_tracker()
    return tracker.get_context_details(agent_id)


@router.get("/agents/{agent_id:path}/context-snapshot")
async def get_agent_context_snapshot_endpoint(
    agent_id: str = Path(
        ...,
        description="Agent ID to get context snapshot for",
    ),
) -> dict[str, Any]:
    """
    Get current context snapshot for a specific agent.

    Returns the current context state including:
    - System prompts and their token counts
    - Message distribution (user/assistant)
    - Total context usage vs context window
    - Distribution data for visualization

    Args:
        agent_id: The unique identifier of the agent.

    Returns:
        Context snapshot with distribution data.
    """
    from ..context.session import _agents, get_agent_context_snapshot
    from ..context.usage import get_usage_tracker

    # Debug logging
    logger.debug(f"[context-snapshot] Fetching snapshot for agent_id={agent_id}")
    logger.debug(f"[context-snapshot] Registered agents: {list(_agents.keys())}")
    tracker = get_usage_tracker()
    stats = tracker.get_agent_stats(agent_id)
    if stats:
        logger.debug(
            f"[context-snapshot] Usage stats: input={stats.input_tokens}, output={stats.output_tokens}, user={stats.user_message_tokens}, assistant={stats.assistant_message_tokens}"
        )
    else:
        logger.debug(f"[context-snapshot] No usage stats found for {agent_id}")

    snapshot = get_agent_context_snapshot(agent_id)
    if snapshot is None:
        logger.debug(
            f"[context-snapshot] Agent '{agent_id}' not found in session registry"
        )
        return {
            "error": f"Agent '{agent_id}' not found",
            "agentId": agent_id,
            "systemPrompts": [],
            "systemPromptTokens": 0,
            "messages": [],
            "userMessageTokens": 0,
            "assistantMessageTokens": 0,
            "totalTokens": 0,
            "contextWindow": 128000,
            "distribution": {
                "name": "Context",
                "value": 0,
                "children": [],
            },
        }

    result = snapshot.to_dict()
    logger.debug(
        f"[context-snapshot] Returning snapshot: totalTokens={result.get('totalTokens', 0)}, toolTokens={result.get('toolTokens', 0)}, systemPromptTokens={result.get('systemPromptTokens', 0)}, distribution children={len(result.get('distribution', {}).get('children', []))}"
    )
    return result


@router.get("/agents/{agent_id:path}/context-table")
async def get_agent_context_table_endpoint(
    agent_id: str = Path(
        ...,
        description="Agent ID to get context table for",
    ),
    show_context: bool = True,
) -> dict[str, Any]:
    """
    Render the context snapshot table as plain text.

    Args:
        agent_id: The unique identifier of the agent.
        show_context: Whether to include the CONTEXT section.

    Returns:
        A dict containing the rendered table text.
    """
    from io import StringIO

    from rich.console import Console

    from ..context.session import get_agent_context_snapshot

    snapshot = get_agent_context_snapshot(agent_id)
    if snapshot is None:
        return {
            "error": f"Agent '{agent_id}' not found",
            "agentId": agent_id,
            "table": "",
        }

    table = snapshot.to_table(show_context=show_context)
    buffer = StringIO()
    console = Console(
        record=True,
        file=buffer,
        force_terminal=True,
        color_system="truecolor",
        width=100,
    )
    console.print(table)
    return {"agentId": agent_id, "table": console.export_text(styles=True)}


@router.get("/agents/{agent_id:path}/full-context")
async def get_agent_full_context_endpoint(
    agent_id: str = Path(
        ...,
        description="Agent ID to get full context details for",
    ),
) -> dict[str, Any]:
    """
    Get full detailed context snapshot for a specific agent.

    This provides complete introspection of the agent's context including:
    - Model configuration (name, context window, settings)
    - System prompts (complete text)
    - Tool definitions with full JSON schemas and source code (if available)
    - Complete message history with in_context field indicating if in window
    - Memory blocks (if available)
    - Tool environment variables (masked)
    - Tool rules and constraints

    Args:
        agent_id: The unique identifier of the agent.

    Returns:
        Full context snapshot with all detailed information.
    """
    from ..context.session import get_agent_full_context_snapshot

    snapshot = get_agent_full_context_snapshot(agent_id)
    if snapshot is None:
        return {
            "error": f"Agent '{agent_id}' not found",
            "agentId": agent_id,
            "modelConfiguration": {
                "modelName": None,
                "contextWindow": 128000,
                "settings": {},
            },
            "systemPrompts": [],
            "systemPromptTokens": 0,
            "tools": [],
            "toolTokens": 0,
            "messages": [],
            "memoryBlocks": [],
            "memoryTokens": 0,
            "toolEnvironment": {},
            "toolRules": [],
            "tokenSummary": {
                "systemPrompts": 0,
                "tools": 0,
                "memory": 0,
                "history": 0,
                "current": 0,
                "total": 0,
                "contextWindow": 128000,
                "usagePercent": 0,
            },
        }

    return snapshot.to_dict()


@router.post("/agents/{agent_id:path}/context-details/reset")
async def reset_agent_context(
    agent_id: str = Path(
        ...,
        description="Agent ID to reset context for",
    ),
) -> dict[str, str]:
    """
    Reset context usage statistics for an agent.

    Args:
        agent_id: The unique identifier of the agent.

    Returns:
        Confirmation message.
    """
    tracker = get_usage_tracker()
    tracker.reset_agent(agent_id)
    return {"status": "ok", "message": f"Context reset for agent '{agent_id}'"}


@router.get("/agents/{agent_id:path}/context-export")
async def export_agent_context_csv(
    agent_id: str = Path(
        ...,
        description="Agent ID to export context for",
    ),
    truncate_message_chars: int = 200,
) -> dict[str, Any]:
    """
    Export per-step usage data as CSV text.

    Each row represents one model request/response cycle (step) with
    the tool that was called, token counts, and timestamp.

    Args:
        agent_id: The unique identifier of the agent.
        truncate_message_chars: Unused, kept for backward compatibility.

    Returns:
        Dict containing filename and CSV content.
    """
    import csv
    from datetime import datetime
    from io import StringIO

    from ..context.session import get_agent_context_snapshot

    snapshot = get_agent_context_snapshot(agent_id)
    if snapshot is None:
        return {
            "error": f"Agent '{agent_id}' not found",
            "agentId": agent_id,
            "filename": "",
            "csv": "",
        }

    # Use agent_id as session identifier for exported usage rows.
    session_id = agent_id

    output = StringIO()
    writer = csv.writer(output)

    # Write header matching the desired format
    writer.writerow(
        [
            "Session_ID",
            "Turn_ID",
            "Step_Number",
            "Tool_Name",
            "Input_Tokens",
            "Output_Tokens",
            "Duration_ms",
            "Timestamp",
        ]
    )

    # Write per-step rows from per_request_usage
    turn_id = "turn_01"
    if snapshot.per_request_usage:
        for step in snapshot.per_request_usage:
            tool_name = ", ".join(step.tool_names) if step.tool_names else "Response"
            writer.writerow(
                [
                    session_id,
                    turn_id,
                    step.request_num,
                    tool_name,
                    step.input_tokens,
                    step.output_tokens,
                    f"{step.duration_ms:.0f}",
                    step.timestamp or "",
                ]
            )

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"codeai_context_{timestamp}.csv"

    return {
        "agentId": agent_id,
        "filename": filename,
        "csv": output.getvalue(),
        "stepsCount": len(snapshot.per_request_usage),
    }


@router.get("/agents/{agent_id:path}/spec")
async def get_agent_spec_endpoint(
    agent_id: str = Path(
        ...,
        description="Agent ID to get the creation spec for",
    ),
) -> dict[str, Any]:
    """
    Get the original creation spec for a specific agent.

    Returns the spec as provided at agent creation time, including
    separated system_prompt and system_prompt_codemode_addons fields
    (which are merged at runtime and lost in the running agent).

    This endpoint also includes the sandbox status when codemode is enabled.

    Args:
        agent_id: The unique identifier of the agent.

    Returns:
        The original agent creation spec with sandbox status.

    Raises:
        HTTPException: If agent spec not found.
    """
    from .agents import get_stored_agent_spec

    spec = get_stored_agent_spec(agent_id)
    if spec is None:
        raise HTTPException(
            status_code=404,
            detail=f"Agent spec not found for '{agent_id}'",
        )

    # Enrich with current sandbox status
    sandbox_status = _get_sandbox_status()

    return {
        **spec,
        "sandbox": sandbox_status.model_dump() if sandbox_status else None,
    }


# =========================================================================
# Codemode Configuration Endpoints
# =========================================================================


def _get_available_skills() -> list[dict[str, Any]]:
    """Get all available skills from the skills directory."""
    skills: list[dict[str, Any]] = []
    try:
        # Skills folder can be configured via env var, with fallback to repo root
        skills_folder_path = os.getenv("AGENT_RUNTIMES_SKILLS_FOLDER")
        if skills_folder_path:
            skills_path = FilePath(skills_folder_path)
        else:
            repo_root = FilePath(__file__).resolve().parents[2]
            skills_path = repo_root / "skills"

        if not skills_path.exists():
            logger.debug(f"Skills directory not found: {skills_path}")
            return skills

        # Try to use agent_skills if available
        try:
            from agent_skills import AgentSkill

            for skill_md in skills_path.rglob("SKILL.md"):
                try:
                    skill = AgentSkill.from_skill_md(skill_md)
                    skills.append(
                        {
                            "name": skill.name,
                            "description": skill.description,
                            "tags": skill.tags if hasattr(skill, "tags") else [],
                        }
                    )
                except Exception as exc:
                    logger.warning(f"Failed to load skill from {skill_md}: {exc}")
                    continue
        except ImportError:
            # Fallback: scan skill directories manually
            for skill_dir in skills_path.iterdir():
                if skill_dir.is_dir() and (skill_dir / "SKILL.md").exists():
                    skill_md_path = skill_dir / "SKILL.md"
                    try:
                        content = skill_md_path.read_text()
                        # Parse basic info from SKILL.md
                        name = skill_dir.name
                        description = ""
                        for line in content.split("\n"):
                            if line.startswith("# "):
                                name = line[2:].strip()
                            elif (
                                line.strip()
                                and not line.startswith("#")
                                and not description
                            ):
                                description = line.strip()
                                break
                        skills.append(
                            {
                                "name": name,
                                "description": description,
                                "tags": [],
                            }
                        )
                    except Exception as exc:
                        logger.warning(f"Failed to parse {skill_md_path}: {exc}")
                        continue

    except Exception as e:
        logger.error(f"Error scanning skills directory: {e}")

    return skills


@router.get("/codemode-status", response_model=CodemodeStatus)
async def get_codemode_status() -> CodemodeStatus:
    """
    Get the current codemode status.

    This checks the actual agent adapters for codemode state, falling back
    to the global state if no adapters are registered.

    Returns:
        Current codemode enabled state, active skills, available skills, and sandbox status.
    """
    from agent_runtimes.routes.agui import get_all_agui_adapters

    available_skills = _get_available_skills()
    active_skill_names = _codemode_state["skills"]

    # Check actual adapter state - if any adapter has codemode enabled, report enabled
    adapters = get_all_agui_adapters()
    codemode_enabled = _codemode_state["enabled"]  # Default to global state

    if adapters:
        # Check if any adapter actually has codemode enabled
        for agent_id, agui_transport in adapters.items():
            try:
                agent_adapter = agui_transport.agent
                if hasattr(agent_adapter, "codemode_enabled"):
                    codemode_enabled = agent_adapter.codemode_enabled
                    break  # Use first adapter's state as the canonical state
            except Exception as e:
                logger.debug(
                    f"Could not check codemode status for agent {agent_id}: {e}"
                )

    # Build active skills list with full info
    active_skills = []
    for skill in available_skills:
        if skill["name"] in active_skill_names:
            active_skills.append(skill)

    # Get sandbox status
    sandbox_status = _get_sandbox_status()

    return CodemodeStatus(
        enabled=codemode_enabled,
        skills=active_skills,
        available_skills=available_skills,
        sandbox=sandbox_status,
    )


@router.get("/sandbox-status")
async def get_sandbox_status_endpoint() -> dict[str, Any]:
    """
    Get the current sandbox execution status.

    Returns:
        Sandbox status including whether code is executing.
    """
    status = _get_sandbox_status()
    if status is None:
        return {"available": False}
    return {"available": True, **status.model_dump()}


@router.post("/sandbox/interrupt")
async def interrupt_sandbox(agent_id: str | None = None) -> dict[str, Any]:
    """
    Interrupt the currently running code in the sandbox.

    Returns:
        Result of the interrupt request.
    """
    try:
        from agent_runtimes.services.code_sandbox_manager import (
            get_code_sandbox_manager,
        )

        sandbox = None
        if agent_id:
            codemode_toolset = _get_agent_codemode_toolset(agent_id)
            if codemode_toolset is not None:
                sandbox = getattr(codemode_toolset, "_sandbox", None)
                if sandbox is None:
                    sandbox = getattr(codemode_toolset, "sandbox", None)
        if sandbox is None:
            manager = get_code_sandbox_manager()
            sandbox = manager.get_managed_sandbox()

        if not sandbox.is_executing:
            return {"interrupted": False, "reason": "No code is currently executing"}

        success = sandbox.interrupt()
        await notify_sandbox_status_change(agent_id=agent_id)
        return {"interrupted": success}
    except ImportError:
        return {"interrupted": False, "reason": "code_sandboxes not installed"}
    except Exception as e:
        logger.warning(f"Error interrupting sandbox: {e}")
        return {"interrupted": False, "reason": str(e)}


def _get_sandbox_status() -> SandboxStatus | None:
    """
    Get the current code sandbox status.

    Returns:
        SandboxStatus with current sandbox configuration and connection status.
    """
    try:
        from agent_runtimes.services.code_sandbox_manager import (
            get_code_sandbox_manager,
        )

        manager = get_code_sandbox_manager()
        status = manager.get_status()

        sandbox_status = SandboxStatus(
            variant=status["variant"],
            jupyter_url=status.get("jupyter_url"),
            sandbox_running=status.get("sandbox_running", False),
            is_executing=False,
            jupyter_connected=False,
            jupyter_error=None,
            generated_path=status.get("generated_path"),
            skills_path=status.get("skills_path"),
            python_path=status.get("python_path"),
            mcp_proxy_url=status.get("mcp_proxy_url"),
        )

        # Check if sandbox is currently executing
        try:
            managed = manager.get_managed_sandbox()
            sandbox_status.is_executing = managed.is_executing
        except Exception:
            pass

        # If Jupyter variant, test the connection
        if status["variant"] == "local-jupyter" and status.get("jupyter_url"):
            jupyter_connected, jupyter_error = _test_jupyter_connection(
                status["jupyter_url"], status.get("jupyter_token")
            )
            sandbox_status.jupyter_connected = jupyter_connected
            sandbox_status.jupyter_error = jupyter_error

        return sandbox_status
    except ImportError:
        logger.debug("code_sandboxes not installed, cannot get sandbox status")
        return None
    except Exception as e:
        logger.warning(f"Error getting sandbox status: {e}")
        return None


def _test_jupyter_connection(
    jupyter_url: str, jupyter_token: str | None
) -> tuple[bool, str | None]:
    """
    Test connection to a Jupyter server.

    Args:
        jupyter_url: The Jupyter server URL
        jupyter_token: The authentication token

    Returns:
        Tuple of (connected: bool, error_message: str | None)
    """
    import httpx

    try:
        # Strip trailing slash if present
        base_url = jupyter_url
        if base_url.endswith("/"):
            base_url = base_url[:-1]

        # Test connection by hitting the Jupyter server extension API endpoint
        # For jupyter-server extension at /api/jupyter-server, the API is at /api/jupyter-server/api
        headers = {}
        if jupyter_token:
            headers["Authorization"] = f"token {jupyter_token}"

        status_url = f"{base_url}/api"

        # Use a short timeout for the ping
        with httpx.Client(timeout=5.0) as client:
            response = client.get(status_url, headers=headers, follow_redirects=True)

            if response.status_code == 200:
                return True, None
            elif response.status_code == 401 or response.status_code == 403:
                return False, f"Authentication failed (HTTP {response.status_code})"
            else:
                return False, f"Jupyter server returned HTTP {response.status_code}"
    except httpx.ConnectError:
        return False, f"Connection refused - is Jupyter running at {jupyter_url}?"
    except httpx.TimeoutException:
        return (
            False,
            f"Connection timeout - Jupyter server at {jupyter_url} not responding",
        )
    except Exception as e:
        return False, f"Connection error: {str(e)}"


# =========================================================================
# Sandbox Status WebSocket
# =========================================================================


_sandbox_status_subscribers: dict[str, set[asyncio.Queue[None]]] = {}


def _subscriber_key(agent_id: str | None) -> str:
    return agent_id or "__global__"


def _subscribe_sandbox_status(agent_id: str | None) -> asyncio.Queue[None]:
    key = _subscriber_key(agent_id)
    queue: asyncio.Queue[None] = asyncio.Queue(maxsize=1)
    subscribers = _sandbox_status_subscribers.setdefault(key, set())
    subscribers.add(queue)
    return queue


def _unsubscribe_sandbox_status(agent_id: str | None, queue: asyncio.Queue[None]) -> None:
    key = _subscriber_key(agent_id)
    subscribers = _sandbox_status_subscribers.get(key)
    if not subscribers:
        return
    subscribers.discard(queue)
    if not subscribers:
        _sandbox_status_subscribers.pop(key, None)


async def notify_sandbox_status_change(agent_id: str | None = None) -> None:
    """Notify websocket listeners that sandbox status may have changed."""
    keys = [_subscriber_key(agent_id)]
    # Global listeners should also refresh for any specific agent change.
    if keys[0] != "__global__":
        keys.append("__global__")

    for key in keys:
        subscribers = _sandbox_status_subscribers.get(key)
        if not subscribers:
            continue
        for queue in list(subscribers):
            if queue.full():
                continue
            queue.put_nowait(None)


def _get_agent_codemode_toolset(agent_id: str) -> Any | None:
    """Return the codemode toolset for an agent when available."""
    try:
        from agent_runtimes.context.session import _agents as context_agents

        entry = context_agents.get(agent_id)
        if not entry:
            return None
        adapter = entry[0]
        toolsets = getattr(adapter, "_non_mcp_toolsets", []) or []
        for toolset in toolsets:
            if "CodemodeToolset" not in type(toolset).__name__:
                continue
            return toolset
    except Exception:
        return None
    return None


def _build_sandbox_ws_status(agent_id: str | None = None) -> dict[str, Any]:
    """
    Build a lightweight sandbox status dict for WebSocket streaming.

    This is cheaper than calling ``_get_sandbox_status()`` because it
    skips the Jupyter HTTP ping — for the WebSocket we already know the
    variant and simply report execution state.
    """
    try:
        from agent_runtimes.services.code_sandbox_manager import (
            get_code_sandbox_manager,
        )

        manager = get_code_sandbox_manager()
        status = manager.get_status()

        sandbox_running = bool(status.get("sandbox_running", False))
        is_executing = False
        variant = status["variant"]
        jupyter_url = status.get("jupyter_url")

        # If an agent_id is provided, prefer the agent codemode sandbox state.
        # This tracks the sandbox actually used for code execution.
        if agent_id:
            codemode_toolset = _get_agent_codemode_toolset(agent_id)
            agent_sandbox = None
            if codemode_toolset is not None:
                agent_sandbox = getattr(codemode_toolset, "_sandbox", None)
                if agent_sandbox is None:
                    agent_sandbox = getattr(codemode_toolset, "sandbox", None)

            if agent_sandbox is not None:
                sandbox_running = True
                # Prefer event-driven runtime execution state (set by codemode toolset).
                runtime_exec = getattr(codemode_toolset, "runtime_is_executing", None)
                if runtime_exec is not None:
                    is_executing = bool(runtime_exec)
                else:
                    # Avoid forcing sandbox manager lookup via ManagedSandbox._sandbox().
                    sb_manager = getattr(agent_sandbox, "_manager", None)
                    underlying = getattr(sb_manager, "_sandbox", None) if sb_manager else None
                    if underlying is not None:
                        is_executing = bool(getattr(underlying, "is_executing", False))
                    else:
                        is_executing = bool(getattr(agent_sandbox, "is_executing", False))
                sandbox_cls = type(agent_sandbox).__name__.lower()
                if "jupyter" in sandbox_cls:
                    variant = "jupyter"
                agent_url = getattr(agent_sandbox, "_server_url", None)
                if agent_url:
                    jupyter_url = str(agent_url)
        else:
            # Global fallback: inspect the existing sandbox instance without
            # triggering sandbox creation on every poll tick.
            existing = getattr(manager, "_sandbox", None)
            if existing is not None:
                is_executing = bool(getattr(existing, "is_executing", False))

        return {
            "variant": variant,
            "sandbox_running": sandbox_running,
            "is_executing": is_executing,
            "jupyter_url": jupyter_url,
        }
    except ImportError:
        return {
            "variant": "unavailable",
            "sandbox_running": False,
            "is_executing": False,
        }
    except Exception as e:
        logger.debug(f"Error building sandbox WS status: {e}")
        return {
            "variant": "error",
            "sandbox_running": False,
            "is_executing": False,
            "error": str(e),
        }


@router.websocket("/sandbox/ws")
async def sandbox_status_ws(websocket: WebSocket, agent_id: str | None = None) -> None:
    """
    WebSocket endpoint that streams sandbox status updates.

    Sends a JSON message every time the status changes (or at most
    every 500 ms).  The client can also send ``{"action": "interrupt"}``
    to request a sandbox interrupt.

    Message format (server → client)::

        {
            "variant": "local-eval" | "local-jupyter" | "jupyter" | "unavailable",
            "sandbox_running": true/false,
            "is_executing": true/false,
            "jupyter_url": "..." | null
        }
    """
    await websocket.accept()
    logger.debug("Sandbox status WebSocket connected")
    status_queue = _subscribe_sandbox_status(agent_id)

    last_status: dict[str, Any] | None = None

    async def send_status() -> None:
        nonlocal last_status
        status = _build_sandbox_ws_status(agent_id=agent_id)
        # Only send when status changed.
        if status != last_status:
            last_status = status
            await websocket.send_json(status)

    try:
        # Send initial status immediately.
        await send_status()

        while True:
            recv_task = asyncio.create_task(websocket.receive_text())
            status_task = asyncio.create_task(status_queue.get())

            try:
                done, pending = await asyncio.wait(
                    {recv_task, status_task},
                    return_when=asyncio.FIRST_COMPLETED,
                )
                for task in pending:
                    task.cancel()

                if recv_task in done:
                    raw = recv_task.result()
                    try:
                        msg = json.loads(raw)
                    except (json.JSONDecodeError, ValueError):
                        msg = {}

                    if msg.get("action") == "interrupt":
                        logger.info("Sandbox interrupt requested via WebSocket")
                        try:
                            sandbox = None
                            if agent_id:
                                codemode_toolset = _get_agent_codemode_toolset(agent_id)
                                if codemode_toolset is not None:
                                    sandbox = getattr(codemode_toolset, "_sandbox", None)
                                    if sandbox is None:
                                        sandbox = getattr(codemode_toolset, "sandbox", None)
                            if sandbox is None:
                                from agent_runtimes.services.code_sandbox_manager import (
                                    get_code_sandbox_manager,
                                )

                                mgr = get_code_sandbox_manager()
                                sandbox = mgr.get_managed_sandbox()
                            success = sandbox.interrupt() if sandbox.is_executing else False
                            await websocket.send_json(
                                {"action": "interrupt", "success": success}
                            )
                            await notify_sandbox_status_change(agent_id=agent_id)
                        except Exception as exc:
                            await websocket.send_json(
                                {"action": "interrupt", "success": False, "error": str(exc)}
                            )

                if status_task in done:
                    await send_status()
            finally:
                if not recv_task.done():
                    recv_task.cancel()
                if not status_task.done():
                    status_task.cancel()

    except WebSocketDisconnect:
        logger.debug("Sandbox status WebSocket disconnected")
    except Exception as exc:
        logger.debug(f"Sandbox status WebSocket error: {exc}")
    finally:
        _unsubscribe_sandbox_status(agent_id, status_queue)


@router.post("/codemode/toggle")
async def toggle_codemode(request: CodemodeToggleRequest) -> dict[str, Any]:
    """
    Toggle codemode on/off and optionally update skills.

    This updates the runtime state AND updates the agent adapters' toolsets
    so codemode is enabled/disabled immediately without requiring a restart.

    Args:
        request: Toggle request with enabled state and optional skills list.

    Returns:
        Updated codemode status.
    """
    from agent_runtimes.routes.agui import get_all_agui_adapters

    _codemode_state["enabled"] = request.enabled

    if request.skills is not None:
        _codemode_state["skills"] = request.skills

    # Update environment variables for consistency
    os.environ["AGENT_RUNTIMES_CODEMODE"] = "true" if request.enabled else "false"
    if request.skills is not None:
        os.environ["AGENT_RUNTIMES_SKILLS"] = ",".join(request.skills)

    # Update all registered AG-UI adapters
    adapters_updated = 0
    adapters_failed = 0
    for agent_id, agui_transport in get_all_agui_adapters().items():
        try:
            # Get the underlying agent adapter (PydanticAIAdapter)
            agent_adapter = agui_transport.agent
            if hasattr(agent_adapter, "set_codemode_enabled"):
                success = agent_adapter.set_codemode_enabled(request.enabled)
                if success:
                    adapters_updated += 1
                    logger.info(
                        f"Codemode {'enabled' if request.enabled else 'disabled'} for agent: {agent_id}"
                    )
                else:
                    adapters_failed += 1
                    logger.warning(f"Failed to toggle codemode for agent: {agent_id}")
            else:
                logger.debug(f"Agent {agent_id} does not support codemode toggling")
        except Exception as e:
            adapters_failed += 1
            logger.error(
                f"Error toggling codemode for agent {agent_id}: {e}", exc_info=True
            )

    logger.info(
        f"Codemode toggled: enabled={request.enabled}, skills={_codemode_state['skills']}, adapters_updated={adapters_updated}, adapters_failed={adapters_failed}"
    )

    return {
        "status": "ok",
        "enabled": _codemode_state["enabled"],
        "skills": _codemode_state["skills"],
        "adapters_updated": adapters_updated,
        "adapters_failed": adapters_failed,
        "message": f"Codemode {'enabled' if request.enabled else 'disabled'} for {adapters_updated} agent(s).",
    }
