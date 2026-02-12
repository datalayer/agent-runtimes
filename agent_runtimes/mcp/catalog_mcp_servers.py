# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
MCP Server Catalog.

Predefined MCP server configurations that can be used by agents.
Credentials are configured via environment variables.

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

import os
import tempfile
from typing import Dict

from agent_runtimes.types import MCPServer

# ============================================================================
# MCP Server Definitions
# ============================================================================

ALPHAVANTAGE_MCP_SERVER = MCPServer(
    id="alphavantage",
    name="Alpha Vantage",
    description="Financial market data and stock information",
    icon="graph",
    emoji="💹",
    command="uvx",
    args=[
        "av-mcp==0.2.1",
        "${ALPHAVANTAGE_API_KEY}",
    ],
    transport="stdio",
    enabled=True,
    tools=[],
    env={
        "MAX_RESPONSE_TOKENS": "100000",
    },
    required_env_vars=["ALPHAVANTAGE_API_KEY"],
)

CHART_MCP_SERVER = MCPServer(
    id="chart",
    name="Chart Generator",
    description="Generate charts and visualizations",
    icon="graph",
    emoji="📊",
    command="npx",
    args=[
        "-y",
        "@antv/mcp-server-chart",
    ],
    transport="stdio",
    enabled=True,
    tools=[],
    required_env_vars=[],
)

FILESYSTEM_MCP_SERVER = MCPServer(
    id="filesystem",
    name="Filesystem",
    description="Local filesystem read/write operations",
    icon="file-directory",
    emoji="📁",
    command="npx",
    args=[
        "-y",
        "@modelcontextprotocol/server-filesystem",
        tempfile.gettempdir(),
    ],
    transport="stdio",
    enabled=True,
    tools=[],
    required_env_vars=[],
)

GITHUB_MCP_SERVER = MCPServer(
    id="github",
    name="GitHub",
    description="GitHub repository operations (issues, PRs, code search)",
    icon="mark-github",
    emoji="🐙 - git - collaboration",
    command="docker",
    args=[
        "run",
        "-i",
        "--rm",
        "-e",
        "GITHUB_PERSONAL_ACCESS_TOKEN",
        "ghcr.io/github/github-mcp-server",
    ],
    transport="stdio",
    enabled=True,
    tools=[],
    env={
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}",
    },
    required_env_vars=["GITHUB_TOKEN"],
)

GOOGLE_WORKSPACE_MCP_SERVER = MCPServer(
    id="google-workspace",
    name="Google Workspace",
    description="Google Drive, Gmail, Calendar, and Docs integration",
    icon="mail",
    emoji="📧",
    command="uvx",
    args=[
        "workspace-mcp",
    ],
    transport="stdio",
    enabled=True,
    tools=[],
    env={
        "GOOGLE_OAUTH_CLIENT_ID": "${GOOGLE_OAUTH_CLIENT_ID}",
        "GOOGLE_OAUTH_CLIENT_SECRET": "${GOOGLE_OAUTH_CLIENT_SECRET}",
        "WORKSPACE_MCP_PORT": "9000",
    },
    required_env_vars=["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"],
)

KAGGLE_MCP_SERVER = MCPServer(
    id="kaggle",
    name="Kaggle",
    description="Kaggle datasets, models, competitions, and notebooks access",
    icon="database",
    emoji="📊",
    command="npx",
    args=[
        "-y",
        "mcp-remote",
        "https://www.kaggle.com/mcp",
        "--header",
        "Authorization: Bearer ${KAGGLE_TOKEN}",
    ],
    transport="stdio",
    enabled=True,
    tools=[],
    required_env_vars=["KAGGLE_TOKEN"],
)

SLACK_MCP_SERVER = MCPServer(
    id="slack",
    name="Slack",
    description="Slack messaging and channel operations",
    icon="comment-discussion",
    emoji="💬",
    command="npx",
    args=[
        "-y",
        "@datalayer/slack-mcp-server",
    ],
    transport="stdio",
    enabled=True,
    tools=[],
    env={
        "SLACK_BOT_TOKEN": "${SLACK_BOT_TOKEN}",
        "SLACK_TEAM_ID": "${SLACK_TEAM_ID}",
        "SLACK_CHANNEL_IDS": "${SLACK_CHANNEL_IDS}",
    },
    required_env_vars=["SLACK_BOT_TOKEN", "SLACK_TEAM_ID", "SLACK_CHANNEL_IDS"],
)

TAVILY_MCP_SERVER = MCPServer(
    id="tavily",
    name="Tavily Search",
    description="Web search and research capabilities via Tavily API",
    icon="search",
    emoji="🔍",
    command="npx",
    args=[
        "-y",
        "tavily-mcp",
    ],
    transport="stdio",
    enabled=True,
    tools=[],
    env={
        "TAVILY_API_KEY": "${TAVILY_API_KEY}",
    },
    required_env_vars=["TAVILY_API_KEY"],
)

# ============================================================================
# MCP Server Catalog
# ============================================================================

MCP_SERVER_CATALOG: Dict[str, MCPServer] = {
    "alphavantage": ALPHAVANTAGE_MCP_SERVER,
    "chart": CHART_MCP_SERVER,
    "filesystem": FILESYSTEM_MCP_SERVER,
    "github": GITHUB_MCP_SERVER,
    "google-workspace": GOOGLE_WORKSPACE_MCP_SERVER,
    "kaggle": KAGGLE_MCP_SERVER,
    "slack": SLACK_MCP_SERVER,
    "tavily": TAVILY_MCP_SERVER,
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
