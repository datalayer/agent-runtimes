# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""FastAPI routes for frontend configuration."""

import logging
import os
from pathlib import Path as FilePath
from typing import Any

from fastapi import APIRouter, HTTPException, Path, Query
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


class CodemodeStatus(BaseModel):
    """Codemode status response."""

    enabled: bool
    skills: list[dict[str, Any]]
    available_skills: list[dict[str, Any]]


class CodemodeToggleRequest(BaseModel):
    """Request to toggle codemode."""

    enabled: bool
    skills: list[str] | None = None


# =========================================================================
# Codemode State (runtime state, not persistent)
# =========================================================================

_codemode_state = {
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


@router.get("/agents/{agent_id}/context-details")
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


@router.get("/agents/{agent_id}/context-snapshot")
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


@router.get("/agents/{agent_id}/full-context")
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


@router.post("/agents/{agent_id}/context-details/reset")
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


# =========================================================================
# Codemode Configuration Endpoints
# =========================================================================


def _get_available_skills() -> list[dict[str, Any]]:
    """Get all available skills from the skills directory."""
    skills: list[dict[str, Any]] = []
    try:
        # Skills are stored in the skills directory at the repo root
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
        Current codemode enabled state, active skills, and available skills.
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
    active_skills: list[dict[str, Any]] = []
    for skill in available_skills:
        if skill["name"] in active_skill_names:  # type: ignore[operator]
            active_skills.append(skill)

    return CodemodeStatus(
        enabled=codemode_enabled,
        skills=active_skills,
        available_skills=available_skills,
    )


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
