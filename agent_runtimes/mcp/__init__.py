# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
MCP module for agent-runtimes.

Provides MCP (Model Context Protocol) server management and tools integration
that can be used by both Jupyter and FastAPI servers.
"""

from .manager import (
    MCPManager,
    get_mcp_manager,
    set_mcp_manager,
)
from .tools import (
    create_mcp_server,
    extract_tool_names,
    get_available_tools,
    get_tools_from_mcp,
)

__all__ = [
    "MCPManager",
    "create_mcp_server",
    "extract_tool_names",
    "get_available_tools",
    "get_mcp_manager",
    "get_tools_from_mcp",
    "set_mcp_manager",
]
