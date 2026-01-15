# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""FastAPI routes for frontend configuration."""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Path

from agent_runtimes.mcp import get_available_tools, get_frontend_config, get_mcp_manager, get_mcp_toolsets_status, get_mcp_toolsets_info
from agent_runtimes.types import FrontendConfig
from agent_runtimes.context.usage import get_usage_tracker

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/configure", tags=["configure"])


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

        # Get MCP servers from manager
        mcp_manager = get_mcp_manager()
        mcp_servers = mcp_manager.get_servers()

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
    Get the status of MCP toolsets for Pydantic AI agents.
    
    Returns:
        Status information including ready, pending, and failed servers.
    """
    return get_mcp_toolsets_status()


@router.get("/mcp-toolsets-info")
async def get_toolsets_info() -> list[dict[str, Any]]:
    """
    Get information about running MCP toolsets.
    
    Returns:
        List of running MCP server information (sensitive data redacted).
    """
    return get_mcp_toolsets_info()


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
    from ..context.snapshot import get_agent_context_snapshot
    
    snapshot = get_agent_context_snapshot(agent_id)
    if snapshot is None:
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
