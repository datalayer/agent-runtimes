# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Configuration module for agent-runtimes.

Provides frontend configuration services that can be used by both
Jupyter and FastAPI servers.
"""

from .frontend_config import get_frontend_config
from agent_runtimes.mcp.catalog_mcp_servers import (
    MCP_SERVER_CATALOG,
    get_catalog_server,
    list_catalog_servers,
    TAVILY_MCP_SERVER,
    FILESYSTEM_MCP_SERVER,
    GITHUB_MCP_SERVER,
    GOOGLE_WORKSPACE_MCP_SERVER,
    SLACK_MCP_SERVER,
    KAGGLE_MCP_SERVER,
    ALPHAVANTAGE_MCP_SERVER,
    CHART_MCP_SERVER,
    LINKEDIN_MCP_SERVER,
    GMAIL_MCP_SERVER,
    GDRIVE_MCP_SERVER,
)
from .agents import (
    AGENT_LIBRARY,
    get_agent,
    list_agents,
    DATA_ACQUISITION_AGENT,
    CRAWLER_AGENT,
    GITHUB_AGENT,
    FINANCIAL_VIZ_AGENT,
    INFORMATION_ROUTING_AGENT,
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
    "LINKEDIN_MCP_SERVER",
    "GMAIL_MCP_SERVER",
    "GDRIVE_MCP_SERVER",
    # Agents
    "AGENT_LIBRARY",
    "get_agent",
    "list_agents",
    "DATA_ACQUISITION_AGENT",
    "CRAWLER_AGENT",
    "GITHUB_AGENT",
    "FINANCIAL_VIZ_AGENT",
    "INFORMATION_ROUTING_AGENT",
]
