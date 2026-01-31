# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
MCP Server Library.

Predefined MCP server configurations that can be used by agents.
Credentials are configured via environment variables.
"""

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
    args=["-y", "@tavily/mcp-server"],
    transport="stdio",
    enabled=True,
    tools=[],
    # Requires: TAVILY_API_KEY
)

FILESYSTEM_MCP_SERVER = MCPServer(
    id="filesystem",
    name="Filesystem",
    description="Local filesystem read/write operations",
    command="npx",
    args=["-y", "@anthropic/mcp-server-filesystem", "/tmp"],
    transport="stdio",
    enabled=True,
    tools=[],
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
    # Requires: GITHUB_TOKEN
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
    # Requires: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
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
    # Requires: SLACK_BOT_TOKEN
)

KAGGLE_MCP_SERVER = MCPServer(
    id="kaggle",
    name="Kaggle",
    description="Kaggle datasets and competitions access",
    command="uvx",
    args=["kaggle-mcp-server"],
    transport="stdio",
    enabled=True,
    tools=[],
    # Requires: KAGGLE_USERNAME, KAGGLE_KEY
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
    # Requires: ALPHAVANTAGE_API_KEY
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
)

LINKEDIN_MCP_SERVER = MCPServer(
    id="linkedin",
    name="LinkedIn",
    description="LinkedIn profile and job search operations",
    command="uvx",
    args=["linkedin-mcp-server"],
    transport="stdio",
    enabled=True,
    tools=[],
    # Requires: LINKEDIN_ACCESS_TOKEN
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
    # Requires: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
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
    # Requires: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
)


# ============================================================================
# MCP Server Library
# ============================================================================

MCP_SERVER_LIBRARY: Dict[str, MCPServer] = {
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
}


def get_mcp_server(server_id: str) -> MCPServer | None:
    """
    Get an MCP server by ID.

    Args:
        server_id: The unique identifier of the MCP server.

    Returns:
        The MCPServer configuration, or None if not found.
    """
    return MCP_SERVER_LIBRARY.get(server_id)


def list_mcp_servers() -> list[MCPServer]:
    """
    List all available MCP servers.

    Returns:
        List of all MCPServer configurations.
    """
    return list(MCP_SERVER_LIBRARY.values())
