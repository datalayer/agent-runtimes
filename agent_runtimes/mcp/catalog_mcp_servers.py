# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
MCP Server Catalog.

Predefined MCP server configurations that can be used by agents.
Credentials are configured via environment variables.
"""

import os
import tempfile
from typing import Dict

from agent_runtimes.types import MCPServer

# ============================================================================
# MCP Server Definitions
# ============================================================================

TAVILY_MCP_SERVER = MCPServer(
    id="tavily",
    name="Tavily Search",
    description="Web search and research capabilities via Tavily API",
    command="npx",
    args=["-y", "tavily-mcp"],
    transport="stdio",
    enabled=True,
    tools=[],
    required_env_vars=["TAVILY_API_KEY"],
)

FILESYSTEM_MCP_SERVER = MCPServer(
    id="filesystem",
    name="Filesystem",
    description="Local filesystem read/write operations",
    command="npx",
    args=["-y", "@anthropic/mcp-server-filesystem", tempfile.gettempdir()],
    transport="stdio",
    enabled=True,
    tools=[],
    required_env_vars=[],  # No env vars required
)

GITHUB_MCP_SERVER = MCPServer(
    id="github",
    name="GitHub",
    description="GitHub repository operations (issues, PRs, code search)",
    command="npx",
    args=["-y", "@anthropic/mcp-server-github"],
    transport="stdio",
    enabled=True,
    tools=[],
    required_env_vars=["GITHUB_TOKEN"],
)

GOOGLE_WORKSPACE_MCP_SERVER = MCPServer(
    id="google-workspace",
    name="Google Workspace",
    description="Google Drive, Gmail, Calendar, and Docs integration",
    command="npx",
    args=["-y", "@anthropic/mcp-server-google-workspace"],
    transport="stdio",
    enabled=True,
    tools=[],
    required_env_vars=["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"],
)

SLACK_MCP_SERVER = MCPServer(
    id="slack",
    name="Slack",
    description="Slack messaging and channel operations",
    command="npx",
    args=["-y", "@anthropic/mcp-server-slack"],
    transport="stdio",
    enabled=True,
    tools=[],
    required_env_vars=["SLACK_BOT_TOKEN", "SLACK_TEAM_ID"],
)

KAGGLE_MCP_SERVER = MCPServer(
    id="kaggle",
    name="Kaggle",
    description="Kaggle datasets, models, competitions, and notebooks access",
    command="npx",
    args=["-y", "mcp-remote", "https://www.kaggle.com/mcp"],
    transport="stdio",
    enabled=True,
    tools=[],
    required_env_vars=[],  # Uses browser OAuth or token auth
)

ALPHAVANTAGE_MCP_SERVER = MCPServer(
    id="alphavantage",
    name="Alpha Vantage",
    description="Financial market data and stock information",
    command="npx",
    args=["-y", "@anthropic/mcp-server-alphavantage"],
    transport="stdio",
    enabled=True,
    tools=[],
    required_env_vars=["ALPHAVANTAGE_API_KEY"],
)

CHART_MCP_SERVER = MCPServer(
    id="chart",
    name="Chart Generator",
    description="Generate charts and visualizations",
    command="npx",
    args=["-y", "@anthropic/mcp-server-chart"],
    transport="stdio",
    enabled=True,
    tools=[],
    required_env_vars=[],  # No env vars required
)

LINKEDIN_MCP_SERVER = MCPServer(
    id="linkedin",
    name="LinkedIn",
    description="LinkedIn profile and job search operations",
    command="uvx",
    args=[
        "--from",
        "git+https://github.com/stickerdaniel/linkedin-mcp-server",
        "linkedin-mcp-server",
    ],
    transport="stdio",
    enabled=True,
    tools=[],
    required_env_vars=[],  # Uses session file or LI_AT cookie (checked separately)
)

GMAIL_MCP_SERVER = MCPServer(
    id="gmail",
    name="Gmail",
    description="Gmail email operations",
    command="npx",
    args=["-y", "@anthropic/mcp-server-gmail"],
    transport="stdio",
    enabled=True,
    tools=[],
    required_env_vars=["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"],
)

GDRIVE_MCP_SERVER = MCPServer(
    id="gdrive",
    name="Google Drive",
    description="Google Drive file operations",
    command="npx",
    args=["-y", "@anthropic/mcp-server-gdrive"],
    transport="stdio",
    enabled=True,
    tools=[],
    required_env_vars=["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"],
)

BRAVE_SEARCH_MCP_SERVER = MCPServer(
    id="brave-search",
    name="Brave Search",
    description="Web search using Brave Search API",
    command="npx",
    args=["-y", "@modelcontextprotocol/server-brave-search"],
    transport="stdio",
    enabled=True,
    tools=[],
    required_env_vars=["BRAVE_API_KEY"],
)


# ============================================================================
# MCP Server Catalog
# ============================================================================

MCP_SERVER_CATALOG: Dict[str, MCPServer] = {
    "tavily": TAVILY_MCP_SERVER,
    "filesystem": FILESYSTEM_MCP_SERVER,
    "github": GITHUB_MCP_SERVER,
    "google-workspace": GOOGLE_WORKSPACE_MCP_SERVER,
    "slack": SLACK_MCP_SERVER,
    "kaggle": KAGGLE_MCP_SERVER,
    "alphavantage": ALPHAVANTAGE_MCP_SERVER,
    "chart": CHART_MCP_SERVER,
    "linkedin": LINKEDIN_MCP_SERVER,
    "gmail": GMAIL_MCP_SERVER,
    "gdrive": GDRIVE_MCP_SERVER,
    "brave-search": BRAVE_SEARCH_MCP_SERVER,
}


def check_env_vars_available(env_vars: list[str]) -> bool:
    """
    Check if all required environment variables are set.

    Args:
        env_vars: List of environment variable names to check.

    Returns:
        True if all env vars are set (non-empty), False otherwise.
    """
    if not env_vars:
        return True  # No env vars required
    return all(os.environ.get(var) for var in env_vars)


def get_catalog_server(server_id: str) -> MCPServer | None:
    """
    Get a catalog MCP server by ID.

    Args:
        server_id: The unique identifier of the MCP server.

    Returns:
        The MCPServer configuration, or None if not found.
    """
    return MCP_SERVER_CATALOG.get(server_id)


def list_catalog_servers() -> list[MCPServer]:
    """
    List all catalog MCP servers with availability status.

    For each server, checks if the required environment variables are set
    and updates the `is_available` field accordingly.

    Returns:
        List of all catalog MCPServer configurations with updated availability.
    """
    servers = []
    for server in MCP_SERVER_CATALOG.values():
        # Create a copy with updated availability
        server_copy = server.model_copy()
        server_copy.is_available = check_env_vars_available(server.required_env_vars)
        servers.append(server_copy)
    return servers
