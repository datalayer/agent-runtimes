# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Tools integration for Jupyter handlers.

This module re-exports the shared MCP tools functionality for backward compatibility.
"""

# Re-export from shared module for backward compatibility
from agent_runtimes.mcp import (
    generate_name_from_id,
    create_mcp_server,
    extract_tool_names,
    get_available_tools,
    get_tools_from_mcp,
)

# Backward compatibility alias
get_available_tools_from_mcp = get_tools_from_mcp
tools_to_builtin_list = extract_tool_names

__all__ = [
    "create_mcp_server",
    "extract_tool_names",
    "generate_name_from_id",
    "get_available_tools",
    "get_available_tools_from_mcp",
    "get_tools_from_mcp",
    "tools_to_builtin_list",
]
