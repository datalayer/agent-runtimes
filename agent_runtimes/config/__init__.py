# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Configuration module for agent-runtimes.

Provides frontend configuration services that can be used by both
Jupyter and FastAPI servers.
"""

from agent_runtimes.mcp.catalog_mcp_servers import (
    ALPHAVANTAGE_MCP_SERVER,
    CHART_MCP_SERVER,
    FILESYSTEM_MCP_SERVER,
    GITHUB_MCP_SERVER,
    GOOGLE_WORKSPACE_MCP_SERVER,
    KAGGLE_MCP_SERVER,
    MCP_SERVER_CATALOG,
    SLACK_MCP_SERVER,
    TAVILY_MCP_SERVER,
    get_catalog_server,
    list_catalog_servers,
)

from .agents import (
    AGENT_SPECS,
    get_agent_spec,
    list_agent_specs,
)
from .frontend_config import get_frontend_config
from .models import (
    AI_MODEL_CATALOGUE,
    ANTHROPIC_CLAUDE_3_5_HAIKU_20241022,
    ANTHROPIC_CLAUDE_OPUS_4_20250514,
    ANTHROPIC_CLAUDE_SONNET_4_5_20250514,
    ANTHROPIC_CLAUDE_SONNET_4_20250514,
    AZURE_OPENAI_GPT_4_1,
    AZURE_OPENAI_GPT_4_1_MINI,
    AZURE_OPENAI_GPT_4_1_NANO,
    AZURE_OPENAI_GPT_4O,
    AZURE_OPENAI_GPT_4O_MINI,
    BEDROCK_US_ANTHROPIC_CLAUDE_3_5_HAIKU_20241022_V1_0,
    BEDROCK_US_ANTHROPIC_CLAUDE_OPUS_4_6_V1_0,
    BEDROCK_US_ANTHROPIC_CLAUDE_OPUS_4_20250514_V1_0,
    BEDROCK_US_ANTHROPIC_CLAUDE_SONNET_4_5_20250929_V1_0,
    BEDROCK_US_ANTHROPIC_CLAUDE_SONNET_4_20250514_V1_0,
    DEFAULT_MODEL,
    OPENAI_GPT_4_1,
    OPENAI_GPT_4_1_MINI,
    OPENAI_GPT_4_1_NANO,
    OPENAI_GPT_4O,
    OPENAI_GPT_4O_MINI,
    OPENAI_O3_MINI,
    AIModel,
    AIModels,
    check_env_vars_available,
    get_default_model,
    get_model,
    list_models,
)

__all__ = [
    # Frontend config
    "get_frontend_config",
    # MCP Catalog Servers
    "MCP_SERVER_CATALOG",
    "get_catalog_server",
    "list_catalog_servers",
    "TAVILY_MCP_SERVER",
    "FILESYSTEM_MCP_SERVER",
    "GITHUB_MCP_SERVER",
    "GOOGLE_WORKSPACE_MCP_SERVER",
    "SLACK_MCP_SERVER",
    "KAGGLE_MCP_SERVER",
    "ALPHAVANTAGE_MCP_SERVER",
    "CHART_MCP_SERVER",
    # Agents
    "AGENT_SPECS",
    "get_agent_spec",
    "list_agent_specs",
    # AI Models
    "AIModel",
    "AIModels",
    "AI_MODEL_CATALOGUE",
    "DEFAULT_MODEL",
    "check_env_vars_available",
    "get_default_model",
    "get_model",
    "list_models",
]
