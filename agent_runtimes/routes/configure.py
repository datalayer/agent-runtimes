# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""FastAPI routes for frontend configuration."""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from agent_runtimes.config import get_frontend_config
from agent_runtimes.mcp import get_available_tools, get_mcp_manager
from agent_runtimes.runtimes.types import FrontendConfig

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

        return config.model_dump(by_alias=True)

    except Exception as e:
        logger.error(f"Error getting configuration: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
