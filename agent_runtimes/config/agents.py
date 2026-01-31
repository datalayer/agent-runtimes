# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Agent Library.

Predefined agent specifications that can be instantiated as AgentSpaces.
"""

from typing import Dict

from agent_runtimes.types import AgentSpec
from agent_runtimes.config.mcp_servers import (
    TAVILY_MCP_SERVER,
    FILESYSTEM_MCP_SERVER,
    GITHUB_MCP_SERVER,
    SLACK_MCP_SERVER,
    KAGGLE_MCP_SERVER,
    ALPHAVANTAGE_MCP_SERVER,
    CHART_MCP_SERVER,
    GMAIL_MCP_SERVER,
    GDRIVE_MCP_SERVER,
)


# ============================================================================
# Agent Definitions
# ============================================================================

DATA_ACQUISITION_AGENT = AgentSpec(
    id="data-acquisition",
    name="Data Acquisition Agent",
    description="Acquires and manages data from various sources including Kaggle datasets and local filesystem operations.",
    tags=["data", "acquisition", "kaggle", "filesystem"],
    enabled=True,
    mcp_servers=[KAGGLE_MCP_SERVER, FILESYSTEM_MCP_SERVER],
    skills=[],
    environment_name="ai-agents",
    icon="database",
    color="#3B82F6",  # Blue
)

CRAWLER_AGENT = AgentSpec(
    id="crawler",
    name="Crawler Agent",
    description="Web crawling and research agent that searches the web and GitHub repositories for information.",
    tags=["web", "search", "research", "crawler", "github"],
    enabled=True,
    mcp_servers=[TAVILY_MCP_SERVER, GITHUB_MCP_SERVER],
    skills=[],
    environment_name="ai-agents",
    icon="globe",
    color="#10B981",  # Green
)

GITHUB_AGENT = AgentSpec(
    id="github-agent",
    name="GitHub Agent",
    description="Manages GitHub repositories, issues, and pull requests with email notification capabilities.",
    tags=["github", "git", "code", "email"],
    enabled=True,
    mcp_servers=[GITHUB_MCP_SERVER, GMAIL_MCP_SERVER],
    skills=[],
    environment_name="ai-agents",
    icon="git-branch",
    color="#6366F1",  # Indigo
)

FINANCIAL_VIZ_AGENT = AgentSpec(
    id="financial-viz",
    name="Financial Visualization Agent",
    description="Analyzes financial market data and creates visualizations and charts.",
    tags=["finance", "stocks", "visualization", "charts"],
    enabled=True,
    mcp_servers=[ALPHAVANTAGE_MCP_SERVER, CHART_MCP_SERVER],
    skills=[],
    environment_name="ai-agents",
    icon="trending-up",
    color="#F59E0B",  # Amber
)

INFORMATION_ROUTING_AGENT = AgentSpec(
    id="information-routing",
    name="Information Routing Agent",
    description="Routes information between Google Drive and Slack, managing document workflows and team communication.",
    tags=["workflow", "communication", "gdrive", "slack"],
    enabled=True,
    mcp_servers=[GDRIVE_MCP_SERVER, SLACK_MCP_SERVER],
    skills=[],
    environment_name="ai-agents",
    icon="share-2",
    color="#EC4899",  # Pink
)


# ============================================================================
# Agent Library
# ============================================================================

AGENT_LIBRARY: Dict[str, AgentSpec] = {
    "data-acquisition": DATA_ACQUISITION_AGENT,
    "crawler": CRAWLER_AGENT,
    "github-agent": GITHUB_AGENT,
    "financial-viz": FINANCIAL_VIZ_AGENT,
    "information-routing": INFORMATION_ROUTING_AGENT,
}


def get_agent(agent_id: str) -> AgentSpec | None:
    """
    Get an agent specification by ID.

    Args:
        agent_id: The unique identifier of the agent.

    Returns:
        The AgentSpec configuration, or None if not found.
    """
    return AGENT_LIBRARY.get(agent_id)


def list_agents() -> list[AgentSpec]:
    """
    List all available agent specifications.

    Returns:
        List of all AgentSpec configurations.
    """
    return list(AGENT_LIBRARY.values())
