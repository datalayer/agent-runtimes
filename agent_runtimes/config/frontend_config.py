# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Frontend configuration service for agent-runtimes.

This module provides configuration services that can be used by both
Jupyter and FastAPI servers.
"""

import logging
from typing import Any

from agent_runtimes.models import create_default_models
from agent_runtimes.mcp.tools import tools_to_builtin_list
from agent_runtimes.types import (
    AIModel,
    FrontendConfig,
    MCPServer,
)

logger = logging.getLogger(__name__)


async def get_frontend_config(
    tools: list[dict[str, Any]] | None = None,
    mcp_servers: list[MCPServer] | None = None,
    models: list[AIModel] | None = None,
) -> FrontendConfig:
    """
    Build frontend configuration.

    Args:
        tools: List of available tools (dictionaries with 'name' and 'description')
        mcp_servers: List of configured MCP servers
        models: Custom model configurations (if None, uses defaults)

    Returns:
        FrontendConfig with all configuration data
    """
    # Convert tools to BuiltinTool format
    builtin_tools = tools_to_builtin_list(tools or [])
    logger.info(f"Converted {len(builtin_tools)} tools to BuiltinTool objects")

    # Get tool IDs for model association
    tool_ids = [tool.id for tool in builtin_tools]

    # Use provided models or create defaults
    if models is None:
        models = create_default_models(tool_ids)
        logger.info(f"Created default model with {len(tool_ids)} associated tools")

    # Create response
    config = FrontendConfig(
        models=models,
        builtin_tools=builtin_tools,
        mcp_servers=mcp_servers or [],
    )

    logger.info(f"Built frontend config with {len(builtin_tools)} builtin_tools")
    return config
