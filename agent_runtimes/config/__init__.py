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
    CRAWLER_AGENT_SPEC,
    DATA_ACQUISITION_AGENT_SPEC,
    FINANCIAL_VIZ_AGENT_SPEC,
    GITHUB_AGENT_SPEC,
    INFORMATION_ROUTING_AGENT_SPEC,
    get_agent_spec,
    list_agent_specs,
)
from .frontend_config import get_frontend_config

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
    "DATA_ACQUISITION_AGENT_SPEC",
    "CRAWLER_AGENT_SPEC",
    "GITHUB_AGENT_SPEC",
    "FINANCIAL_VIZ_AGENT_SPEC",
    "INFORMATION_ROUTING_AGENT_SPEC",
]
