# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Frontend configuration service for agent-runtimes.

This module provides configuration services that can be used by both
Jupyter and FastAPI servers.
"""

import logging
from typing import Any

from agent_runtimes.runtimes.types import (
    AIModel,
    BuiltinTool,
    FrontendConfig,
    MCPServer,
)

logger = logging.getLogger(__name__)


def generate_name_from_id(tool_id: str) -> str:
    """
    Generate a display name from a tool ID.

    Replaces underscores with spaces and capitalizes the first letter.

    Args:
        tool_id: Tool identifier (e.g., "notebook_run-all-cells")

    Returns:
        Formatted name (e.g., "Notebook run-all-cells")
    """
    if not tool_id:
        return ""

    # Replace underscores with spaces
    name = tool_id.replace("_", " ")

    # Capitalize first letter
    if name:
        name = name[0].upper() + name[1:]

    return name


def tools_to_builtin_list(tools: list[dict[str, Any]]) -> list[BuiltinTool]:
    """
    Convert tool dictionaries to BuiltinTool objects.

    Args:
        tools: List of tool dictionaries with 'name' and optional 'description'

    Returns:
        List of BuiltinTool objects
    """
    builtin_tools = []
    for tool in tools:
        tool_id = tool.get("name", "")
        tool_name = tool.get("description", "")

        # If name is empty, generate from ID
        if not tool_name or not tool_name.strip():
            tool_name = generate_name_from_id(tool_id)

        builtin_tools.append(BuiltinTool(id=tool_id, name=tool_name))

    return builtin_tools


def create_default_models(tool_ids: list[str]) -> list[AIModel]:
    """
    Create default AI model configurations.

    Args:
        tool_ids: List of tool IDs to associate with models

    Returns:
        List of AIModel configurations
    """
    return [
        # Anthropic models
        AIModel(
            id="anthropic:claude-sonnet-4-5",
            name="Claude Sonnet 4.5",
            builtin_tools=tool_ids,
        ),
        AIModel(
            id="anthropic:claude-opus-4",
            name="Claude Opus 4",
            builtin_tools=tool_ids,
        ),
        AIModel(
            id="anthropic:claude-sonnet-4-20250514",
            name="Claude Sonnet 4 (May 2025)",
            builtin_tools=tool_ids,
        ),
        AIModel(
            id="anthropic:claude-3-5-haiku-20241022",
            name="Claude 3.5 Haiku",
            builtin_tools=tool_ids,
        ),
        # OpenAI models
        AIModel(
            id="openai:gpt-4o",
            name="GPT-4o",
            builtin_tools=tool_ids,
        ),
        AIModel(
            id="openai:gpt-4o-mini",
            name="GPT-4o Mini",
            builtin_tools=tool_ids,
        ),
        AIModel(
            id="openai:gpt-4-turbo",
            name="GPT-4 Turbo",
            builtin_tools=tool_ids,
        ),
        AIModel(
            id="openai:o1",
            name="o1",
            builtin_tools=tool_ids,
        ),
        AIModel(
            id="openai:o1-mini",
            name="o1 Mini",
            builtin_tools=tool_ids,
        ),
        AIModel(
            id="openai:o3-mini",
            name="o3 Mini",
            builtin_tools=tool_ids,
        ),
        # AWS Bedrock models
        AIModel(
            id="bedrock:anthropic.claude-sonnet-4-5-20250514-v1:0",
            name="Claude Sonnet 4.5 (Bedrock)",
            builtin_tools=tool_ids,
        ),
        AIModel(
            id="bedrock:anthropic.claude-3-5-haiku-20241022-v1:0",
            name="Claude 3.5 Haiku (Bedrock)",
            builtin_tools=tool_ids,
        ),
        AIModel(
            id="bedrock:amazon.nova-pro-v1:0",
            name="Amazon Nova Pro",
            builtin_tools=tool_ids,
        ),
        AIModel(
            id="bedrock:amazon.nova-lite-v1:0",
            name="Amazon Nova Lite",
            builtin_tools=tool_ids,
        ),
        AIModel(
            id="bedrock:meta.llama3-3-70b-instruct-v1:0",
            name="Llama 3.3 70B (Bedrock)",
            builtin_tools=tool_ids,
        ),
        # Azure OpenAI models
        AIModel(
            id="azure:gpt-4o",
            name="GPT-4o (Azure)",
            builtin_tools=tool_ids,
        ),
        AIModel(
            id="azure:gpt-4o-mini",
            name="GPT-4o Mini (Azure)",
            builtin_tools=tool_ids,
        ),
        AIModel(
            id="azure:gpt-4-turbo",
            name="GPT-4 Turbo (Azure)",
            builtin_tools=tool_ids,
        ),
        AIModel(
            id="azure:o1",
            name="o1 (Azure)",
            builtin_tools=tool_ids,
        ),
        AIModel(
            id="azure:o1-mini",
            name="o1 Mini (Azure)",
            builtin_tools=tool_ids,
        ),
    ]


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
