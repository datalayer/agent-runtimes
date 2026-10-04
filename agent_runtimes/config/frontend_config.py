# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Frontend configuration service for agent-runtimes.

This module provides configuration services that can be used by both
Jupyter and FastAPI servers.
"""

import logging
from typing import Any

from agent_runtimes.mcp.tools import tools_to_builtin_list
from agent_runtimes.models.offered import (
    DECISIONS_NOTE,
    decision_rows,
    model_rows,
    models_source,
)
from agent_runtimes.specs.models import DEFAULT_MODEL, list_chat_models
from agent_runtimes.types import (
    AIModelRuntime,
    FrontendConfig,
    MCPServer,
)

logger = logging.getLogger(__name__)


async def get_frontend_config(
    tools: list[dict[str, Any]] | None = None,
    mcp_servers: list[MCPServer] | None = None,
    models: list[AIModelRuntime] | None = None,
    disable_tool_approvals: bool = False,
    model_ids: list[str] | None = None,
    inference_provider: str | None = None,
) -> FrontendConfig:
    """
    Build frontend configuration.

    Args:
        tools: List of available tools (dictionaries with 'name' and 'description')
        mcp_servers: List of configured MCP servers
        models: Custom model configurations (if None, built from ``model_ids``)
        model_ids: The models to offer — an agent's own (its ``model`` and
            ``model_additionals``); the catalogue's chat models when None
        inference_provider: Where those models' inference goes (``local`` or
            ``datalayer``); the runtime's when None

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
        ids = (
            model_ids
            if model_ids is not None
            else [model.id for model in list_chat_models()]
        )
        models = model_rows(ids, tool_ids, inference_provider)
    source, note = models_source(inference_provider)
    # The typed-decision models, apart: listed, never a model to switch to.
    decisions = [
        AIModelRuntime(
            id=row["id"],
            name=row["name"],
            is_available=row["available"],
            unavailable_reason=row["reason"],
        )
        for row in decision_rows(inference_provider)
    ]

    # Create response
    config = FrontendConfig(
        models=models,
        default_model=DEFAULT_MODEL.value if DEFAULT_MODEL else None,
        builtin_tools=builtin_tools,
        mcp_servers=mcp_servers or [],
        disable_tool_approvals=disable_tool_approvals,
        models_source=source,
        models_note=note,
        decision_models=decisions,
        decisions_note=DECISIONS_NOTE,
    )

    logger.info(f"Built frontend config with {len(builtin_tools)} builtin_tools")
    return config
