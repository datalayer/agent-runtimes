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


# Codeai Agents
# ============================================================================

DATA_ACQUISITION_AGENT_SPEC = AgentSpec(
    id="codeai/data-acquisition",
    name="Data Acquisition Agent",
    description="Acquires and manages data from various sources including Kaggle datasets and local filesystem operations.",
    tags=["data", "acquisition", "kaggle", "filesystem"],
    enabled=True,
    model="bedrock:us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    mcp_servers=[
        MCP_SERVER_CATALOG["kaggle"],
        MCP_SERVER_CATALOG["filesystem"],
        MCP_SERVER_CATALOG["tavily"],
    ],
    skills=["github"],
    environment_name="ai-agents-env",
    icon="database",
    emoji="📊",
    color="#3B82F6",
    suggestions=[
        "Find popular machine learning datasets on Kaggle",
        "Download and explore a dataset for sentiment analysis",
        "List available files in my workspace",
        "Search Kaggle for time series forecasting competitions",
    ],
    welcome_message="Hello! I'm the Data Acquisition Agent. I can help you find and download datasets from Kaggle, manage files in your workspace, and explore data sources for your projects. ",
    welcome_notebook=None,
    welcome_document=None,
    sandbox_variant="jupyter",
    system_prompt="""You are a data acquisition specialist with access to Kaggle datasets and filesystem tools. You can search for datasets, download data, read and write files, and help users prepare data for analysis. Guide users through finding relevant datasets and organizing their workspace efficiently.
""",
    system_prompt_codemode_addons="""## IMPORTANT: Be Honest About Your Capabilities NEVER claim to have tools or capabilities you haven't verified.
## Core Codemode Tools Use these 4 tools to accomplish any task: 1. **list_servers** - List available MCP servers
   Use this to see what MCP servers you can access.

2. **search_tools** - Progressive tool discovery by natural language query
   Use this to find relevant tools before executing tasks.

3. **get_tool_details** - Get full tool schema and documentation
   Use this to understand tool parameters before calling them.

4. **execute_code** - Run Python code that composes multiple tools
   Use this for complex multi-step operations. Code runs in a PERSISTENT sandbox.
   Variables, functions, and state PERSIST between execute_code calls.
   Import tools using: `from generated.servers.<server_name> import <function_name>`
   NEVER use `import *` - always use explicit named imports.

## Recommended Workflow 1. **Discover**: Use list_servers and search_tools to find relevant tools 2. **Understand**: Use get_tool_details to check parameters 3. **Execute**: Use execute_code to perform multi-step tasks, calling tools as needed
## Token Efficiency When possible, chain multiple tool calls in a single execute_code block. This reduces output tokens by processing intermediate results in code rather than returning them. If you want to examine results, print subsets, preview (maximum 20 first characters) and/or counts instead of full data, this is really important.
""",
)

SIMPLE_AGENT_SPEC = AgentSpec(
    id="codeai/simple",
    name="A Simple Agent",
    description="A simple conversational agent. No tools, no MCP servers, no skills — just a helpful AI assistant you can chat with.",
    tags=["simple", "chat", "assistant"],
    enabled=True,
    model="bedrock:us.anthropic.claude-sonnet-4-5-20250929-v1:0",
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
    sandbox_variant="jupyter",
    system_prompt="""You are a helpful, friendly AI assistant. You do not have access to any external tools, MCP servers, or skills. Answer questions using your training knowledge, be concise, and let the user know if a question is outside your knowledge.
""",
    system_prompt_codemode_addons=None,
)


# ============================================================================
# Agent Specs Registry
# ============================================================================

AGENT_SPECS: Dict[str, AgentSpec] = {
    # Codeai
    "codeai/data-acquisition": DATA_ACQUISITION_AGENT_SPEC,
    "codeai/simple": SIMPLE_AGENT_SPEC,
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


def list_agent_specs(prefix: str | None = None) -> list[AgentSpec]:
    """
    List all available agent specifications.

    Args:
        prefix: If provided, only return specs whose ID starts with this prefix.

    Returns:
        List of all AgentSpec configurations.
    """
    specs = list(AGENT_SPECS.values())
    if prefix is not None:
        specs = [s for s in specs if s.id.startswith(prefix)]
    return specs
