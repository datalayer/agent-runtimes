# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
MCP module for agent-runtimes.

Provides MCP (Model Context Protocol) server management and tools integration
that can be used by both Jupyter and FastAPI servers.
"""

from .client import (
    MCPClient,
    MCPToolManager,
)
from .manager import (
    MCPManager,
    get_mcp_manager,
    set_mcp_manager,
)
from .servers import (
    check_env_vars_available,
    check_mcp_server_available,
    check_package_available,
    create_mcp_servers_with_availability,
    discover_mcp_server_tools,
    get_mcp_servers,
    get_mcp_servers_sync,
    get_predefined_mcp_servers,
    initialize_mcp_servers,
)
from .tools import (
    create_mcp_server,
    extract_tool_names,
    generate_name_from_id,
    get_available_tools,
    get_tools_from_mcp,
    tools_to_builtin_list,
)

# Re-export from config for backward compatibility
from agent_runtimes.config import get_frontend_config

__all__ = [
    "MCPClient",
    "MCPManager",
    "MCPToolManager",
    # servers.py exports
    "check_env_vars_available",
    "check_mcp_server_available",
    "check_package_available",
    "create_mcp_server",
    "create_mcp_servers_with_availability",
    "discover_mcp_server_tools",
    "extract_tool_names",
    "generate_name_from_id",
    "get_available_tools",
    "get_frontend_config",
    "get_mcp_manager",
    "get_mcp_servers",
    "get_mcp_servers_sync",
    "get_predefined_mcp_servers",
    "get_tools_from_mcp",
    "initialize_mcp_servers",
    "set_mcp_manager",
    "tools_to_builtin_list",
]
