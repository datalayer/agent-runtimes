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
    create_mcp_servers_with_tools,
    discover_mcp_server_tools,
    expand_config_env_vars,
    expand_env_vars,
    get_mcp_config_path,
    get_mcp_servers,
    get_mcp_servers_from_config,
    get_mcp_servers_sync,
    initialize_mcp_servers,
    load_mcp_config,
)
from .tools import (
    create_mcp_server,
    extract_tool_names,
    generate_name_from_id,
    get_available_tools,
    get_tools_from_mcp,
    tools_to_builtin_list,
)
from .toolsets import (
    ensure_mcp_toolsets_event,
    get_mcp_toolsets,
    get_mcp_toolsets_info,
    get_mcp_toolsets_status,
    is_mcp_toolsets_initialized,
    initialize_mcp_toolsets,
    shutdown_mcp_toolsets,
    wait_for_mcp_toolsets,
)

# Re-export from config for backward compatibility
from agent_runtimes.config import get_frontend_config

__all__ = [
    "MCPClient",
    "MCPManager",
    "MCPToolManager",
    # servers.py exports
    "create_mcp_servers_with_tools",
    "create_mcp_server",
    "discover_mcp_server_tools",
    "expand_config_env_vars",
    "expand_env_vars",
    "extract_tool_names",
    "generate_name_from_id",
    "get_available_tools",
    "get_frontend_config",
    "get_mcp_config_path",
    "get_mcp_manager",
    "get_mcp_servers",
    "get_mcp_servers_from_config",
    "get_mcp_servers_sync",
    "get_mcp_toolsets",
    "get_mcp_toolsets_info",
    "get_mcp_toolsets_status",
    "is_mcp_toolsets_initialized",
    "get_tools_from_mcp",
    "ensure_mcp_toolsets_event",
    "initialize_mcp_servers",
    "initialize_mcp_toolsets",
    "load_mcp_config",
    "set_mcp_manager",
    "shutdown_mcp_toolsets",
    "wait_for_mcp_toolsets",
    "tools_to_builtin_list",
]
