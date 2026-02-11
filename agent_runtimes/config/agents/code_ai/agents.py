# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Agent Library.

Predefined agent specifications that can be instantiated as AgentSpaces.
THIS FILE IS AUTO-GENERATED. DO NOT EDIT MANUALLY.
Generated from YAML specifications in specs/agents/
"""

from typing import Dict

from agent_runtimes.mcp.catalog_mcp_servers import MCP_SERVER_CATALOG
from agent_runtimes.types import AgentSpec

# ============================================================================
# Agent Specs
# ============================================================================


# Code Ai Agents
# ============================================================================

SIMPLE_AGENT_SPEC = AgentSpec(
    id="code-ai/simple",
    name="A Simple Agent",
    description="A simple conversational agent. No tools, no MCP servers, no skills — just a helpful AI assistant you can chat with.",
    tags=["simple", "chat", "assistant"],
    enabled=True,
    mcp_servers=[],
    skills=[],
    environment_name="ai-agents-env",
    icon="share-2",
    emoji="🤖",
    color="#6366F1",
    suggestions=[
        "Tell me a joke",
        "Explain quantum computing in simple terms",
        "Help me brainstorm ideas for a weekend project",
        "Summarize the key points of a topic I describe",
    ],
    welcome_message="Hi! I'm a simple assistant. I don't have any special tools, but I'm happy to chat, answer questions, and help you think through ideas. ",
    welcome_notebook=None,
    welcome_document=None,
    system_prompt="""You are a helpful, friendly AI assistant. You do not have access to any external tools, MCP servers, or skills. Answer questions using your training knowledge, be concise, and let the user know if a question is outside your knowledge.
""",
    system_prompt_codemode_addons=None,
)


# ============================================================================
# Agent Specs Registry
# ============================================================================

AGENT_SPECS: Dict[str, AgentSpec] = {
    # Code Ai
    "code-ai/simple": SIMPLE_AGENT_SPEC,
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
