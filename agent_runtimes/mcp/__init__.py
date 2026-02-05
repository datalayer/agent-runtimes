# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
MCP module for agent-runtimes.

Provides MCP (Model Context Protocol) server management and tools integration
that can be used by both Jupyter and FastAPI servers.
"""

from .catalog_mcp_servers import (
    ALPHAVANTAGE_MCP_SERVER,
    BRAVE_SEARCH_MCP_SERVER,
    CHART_MCP_SERVER,
    FILESYSTEM_MCP_SERVER,
    GDRIVE_MCP_SERVER,
    GITHUB_MCP_SERVER,
    GMAIL_MCP_SERVER,
    GOOGLE_WORKSPACE_MCP_SERVER,
    KAGGLE_MCP_SERVER,
    LINKEDIN_MCP_SERVER,
    MCP_SERVER_CATALOG,
    SLACK_MCP_SERVER,
    TAVILY_MCP_SERVER,
    check_env_vars_available,
    get_catalog_server,
    list_catalog_servers,
)
from .client import (
    MCPClient,
    MCPToolManager,
)
from .config_mcp_servers import (
    create_mcp_servers_with_tools,
    discover_mcp_server_tools,
    expand_config_env_vars,
    expand_env_vars,
    get_config_mcp_servers,
    get_config_mcp_servers_sync,
    get_mcp_config_path,
    get_mcp_servers_from_config,
    initialize_config_mcp_servers,
    load_mcp_config,
)
from .lifecycle import (
    MCPLifecycleManager,
    MCPServerInstance,
    get_mcp_lifecycle_manager,
    set_mcp_lifecycle_manager,
)
from .manager import (
    MCPManager,
    get_mcp_manager,
    set_mcp_manager,
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
    ensure_config_mcp_toolsets_event,
    get_config_mcp_toolsets,
    get_config_mcp_toolsets_info,
    get_config_mcp_toolsets_status,
    initialize_config_mcp_toolsets,
    is_config_mcp_toolsets_initialized,
    shutdown_config_mcp_toolsets,
    wait_for_config_mcp_toolsets,
)

# Note: get_frontend_config is available from agent_runtimes.config
# Not re-exported here to avoid circular imports

__all__ = [
    "MCPClient",
    "MCPLifecycleManager",
    "MCPManager",
    "MCPServerInstance",
    "MCPToolManager",
    # config_mcp_servers.py exports
    "create_mcp_servers_with_tools",
    "create_mcp_server",
    "discover_mcp_server_tools",
    "expand_config_env_vars",
    "expand_env_vars",
    "extract_tool_names",
    "generate_name_from_id",
    "get_available_tools",
    "get_mcp_config_path",
    "get_mcp_lifecycle_manager",
    "get_mcp_manager",
    "get_config_mcp_servers",
    "get_mcp_servers_from_config",
    "get_config_mcp_servers_sync",
    "get_config_mcp_toolsets",
    "get_config_mcp_toolsets_info",
    "get_config_mcp_toolsets_status",
    "is_config_mcp_toolsets_initialized",
    "get_tools_from_mcp",
    "ensure_config_mcp_toolsets_event",
    "initialize_config_mcp_servers",
    "initialize_config_mcp_toolsets",
    "load_mcp_config",
    "set_mcp_lifecycle_manager",
    "set_mcp_manager",
    "shutdown_config_mcp_toolsets",
    "wait_for_config_mcp_toolsets",
    "tools_to_builtin_list",
    # catalog_mcp_servers.py exports
    "MCP_SERVER_CATALOG",
    "check_env_vars_available",
    "get_catalog_server",
    "list_catalog_servers",
    "TAVILY_MCP_SERVER",
    "FILESYSTEM_MCP_SERVER",
    "GITHUB_MCP_SERVER",
    "GOOGLE_WORKSPACE_MCP_SERVER",
    "SLACK_MCP_SERVER",
    "KAGGLE_MCP_SERVER",
    "ALPHAVANTAGE_MCP_SERVER",
    "CHART_MCP_SERVER",
    "LINKEDIN_MCP_SERVER",
    "GMAIL_MCP_SERVER",
    "GDRIVE_MCP_SERVER",
    "BRAVE_SEARCH_MCP_SERVER",
]
