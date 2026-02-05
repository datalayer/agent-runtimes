# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Agent Library.

Predefined agent specifications that can be instantiated as AgentSpaces.
"""

from typing import Dict

from agent_runtimes.mcp.catalog_mcp_servers import (
    ALPHAVANTAGE_MCP_SERVER,
    CHART_MCP_SERVER,
    FILESYSTEM_MCP_SERVER,
    GDRIVE_MCP_SERVER,
    GITHUB_MCP_SERVER,
    GMAIL_MCP_SERVER,
    KAGGLE_MCP_SERVER,
    SLACK_MCP_SERVER,
    TAVILY_MCP_SERVER,
)
from agent_runtimes.types import AgentSpec

# ============================================================================
# Agent Specs
# ============================================================================

DATA_ACQUISITION_AGENT_SPEC = AgentSpec(
    id="data-acquisition",
    name="Data Acquisition Agent",
    description="Acquires and manages data from various sources including Kaggle datasets and local filesystem operations.",
    tags=["data", "acquisition", "kaggle", "filesystem"],
    enabled=True,
    mcp_servers=[KAGGLE_MCP_SERVER, GITHUB_MCP_SERVER, FILESYSTEM_MCP_SERVER],
    skills=[],
    environment_name="ai-agents",
    icon="database",
    color="#3B82F6",  # Blue
)

CRAWLER_AGENT_SPEC = AgentSpec(
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

GITHUB_AGENT_SPEC = AgentSpec(
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

FINANCIAL_VIZ_AGENT_SPEC = AgentSpec(
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

INFORMATION_ROUTING_AGENT_SPEC = AgentSpec(
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
# Agent Specs
# ============================================================================

AGENT_SPECS: Dict[str, AgentSpec] = {
    "data-acquisition": DATA_ACQUISITION_AGENT_SPEC,
    "crawler": CRAWLER_AGENT_SPEC,
    "github-agent": GITHUB_AGENT_SPEC,
    "financial-viz": FINANCIAL_VIZ_AGENT_SPEC,
    "information-routing": INFORMATION_ROUTING_AGENT_SPEC,
}


def get_agent_spec(agent_id: str) -> AgentSpec | None:
    """
    Get an agent specification by ID.

    Args:
        agent_id: The unique identifier of the agent.

    Returns:
        The AgentSpec configuration, or None if not found.
    """
    return AGENT_SPECS.get(agent_id)


def list_agent_specs() -> list[AgentSpec]:
    """
    List all available agent specifications.

    Returns:
        List of all AgentSpec configurations.
    """
    return list(AGENT_SPECS.values())
