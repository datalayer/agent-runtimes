# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
MCP Server definitions and tool discovery.

This module reads MCP server configurations from a mcp.json file
located at $HOME/.datalayer/mcp.json and discovers tools from them.
"""

import asyncio
import json
import logging
import os
import re
from pathlib import Path
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from agent_runtimes.types import MCPServer, MCPServerTool
from agent_runtimes.mcp.toolsets import (
    MCP_SERVER_STARTUP_TIMEOUT,
    get_mcp_toolsets,
    wait_for_mcp_toolsets,
)

logger = logging.getLogger(__name__)


def get_mcp_config_path() -> Path:
    """
    Get the path to the MCP configuration file.

    Returns:
        Path to mcp.json file
    """
    return Path.home() / ".datalayer" / "mcp.json"


def expand_env_vars(value: str) -> str:
    """
    Expand environment variables in a string.

    Supports ${VAR_NAME} syntax.

    Args:
        value: String potentially containing env var references

    Returns:
        String with env vars expanded
    """
    # Match ${VAR_NAME} pattern
    pattern = r'\$\{([^}]+)\}'

    def replace(match: re.Match) -> str:
        var_name = match.group(1)
        return os.environ.get(var_name, "")

    return re.sub(pattern, replace, value)


def expand_config_env_vars(config: dict[str, Any]) -> dict[str, Any]:
    """
    Recursively expand environment variables in a config dictionary.

    Args:
        config: Configuration dictionary

    Returns:
        Config with env vars expanded
    """
    result = {}
    for key, value in config.items():
        if isinstance(value, str):
            result[key] = expand_env_vars(value)
        elif isinstance(value, list):
            result[key] = [
                expand_env_vars(v) if isinstance(v, str) else v
                for v in value
            ]
        elif isinstance(value, dict):
            result[key] = expand_config_env_vars(value)
        else:
            result[key] = value
    return result


def load_mcp_config() -> dict[str, Any]:
    """
    Load MCP configuration from the mcp.json file.

    Returns:
        Dictionary containing mcpServers configuration
    """
    config_path = get_mcp_config_path()

    if not config_path.exists():
        logger.info(f"MCP config file not found at {config_path}")
        return {"mcpServers": {}}

    try:
        with open(config_path, "r") as f:
            config = json.load(f)
            logger.info(f"Loaded MCP config from {config_path}")
            return config
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in MCP config file: {e}")
        return {"mcpServers": {}}
    except Exception as e:
        logger.error(f"Error reading MCP config file: {e}")
        return {"mcpServers": {}}


def get_mcp_servers_from_config() -> list[dict[str, Any]]:
    """
    Get MCP server configurations from the config file.

    Returns:
        List of server configuration dictionaries
    """
    config = load_mcp_config()
    servers = []

    mcp_servers = config.get("mcpServers", {})
    for server_id, server_config in mcp_servers.items():
        # Expand env vars in the config
        expanded_config = expand_config_env_vars(server_config)

        servers.append({
            "id": server_id,
            "name": server_id.replace("-", " ").replace("_", " ").title(),
            "command": expanded_config.get("command"),
            "args": expanded_config.get("args", []),
            "env": expanded_config.get("env", {}),
            "transport": "stdio",  # Default to stdio
        })

    return servers


async def discover_mcp_server_tools(
    server_config: dict[str, Any],
    timeout: float = 30.0,
) -> list[MCPServerTool]:
    """
    Discover tools from an MCP server by starting it and listing tools.

    Args:
        server_config: MCP server configuration dictionary
        timeout: Timeout in seconds for tool discovery

    Returns:
        List of MCPServerTool objects
    """
    tools: list[MCPServerTool] = []
    server_id = server_config.get("id", "unknown")

    command = server_config.get("command")
    args = server_config.get("args", [])
    env = server_config.get("env", {})

    if not command:
        logger.warning(f"No command specified for {server_id}")
        return tools

    try:
        # Merge provided env with current environment
        full_env = {**os.environ, **env}

        # Create stdio server parameters
        server_params = StdioServerParameters(
            command=command,
            args=args,
            env=full_env,
        )

        logger.info(f"Starting MCP server {server_id} for tool discovery...")
        logger.debug(f"Command: {command} {' '.join(args)}")

        async with asyncio.timeout(timeout):
            async with stdio_client(server_params) as (read, write):
                async with ClientSession(read, write) as session:
                    # Initialize the session
                    await session.initialize()

                    # List available tools
                    result = await session.list_tools()

                    for tool in result.tools:
                        mcp_tool = MCPServerTool(
                            name=tool.name,
                            description=tool.description or "",
                            enabled=True,
                            input_schema=(
                                tool.inputSchema if hasattr(tool, "inputSchema") else None
                            ),
                        )
                        tools.append(mcp_tool)

                    logger.info(f"Discovered {len(tools)} tools from {server_id}")

    except asyncio.TimeoutError:
        logger.warning(f"Timeout discovering tools from {server_id} after {timeout}s")
    except FileNotFoundError as e:
        logger.warning(f"Command not found for {server_id}: {e}")
    except Exception as e:
        logger.error(f"Error discovering tools from {server_id}: {e}")

    return tools


async def create_mcp_servers_with_tools(
    discover_tools: bool = True,
    tool_discovery_timeout: float = 30.0,
) -> list[MCPServer]:
    """
    Create MCP server configurations with tool discovery.

    Args:
        discover_tools: Whether to discover tools from servers
        tool_discovery_timeout: Timeout for tool discovery per server

    Returns:
        List of MCPServer objects with tools populated
    """
    servers: list[MCPServer] = []
    configs = get_mcp_servers_from_config()
    ready = await wait_for_mcp_toolsets()
    if not ready:
        logger.warning(
            "MCP toolsets not ready after initialization; tool discovery may be incomplete"
        )

    for config in configs:
        server = MCPServer(
            id=config["id"],
            name=config["name"],
            command=config.get("command"),
            args=config.get("args", []),
            transport=config.get("transport", "stdio"),
            is_available=True,  # Assume available, tool discovery will confirm
            enabled=True,
            tools=[],
        )

        # Discover tools if requested
        if discover_tools:
            tools: list[MCPServerTool] = []

            # Try to reuse running MCP toolset if available
            running_toolsets = get_mcp_toolsets()
            running_server = next(
                (toolset for toolset in running_toolsets if getattr(toolset, "id", None) == config["id"]),
                None,
            )

            if running_server is not None:
                try:
                    logger.info(
                        f"Reusing running MCP server '{config['id']}' to list tools"
                    )
                    running_tools = await running_server.list_tools()
                    for tool in running_tools:
                        input_schema = getattr(tool, "input_schema", None)
                        if input_schema is None and hasattr(tool, "inputSchema"):
                            input_schema = getattr(tool, "inputSchema")
                        tools.append(
                            MCPServerTool(
                                name=tool.name,
                                description=getattr(tool, "description", "") or "",
                                enabled=True,
                                input_schema=input_schema,
                            )
                        )
                except Exception as e:
                    logger.warning(
                        f"Failed to reuse running MCP server '{config['id']}' for tool discovery: {e}"
                    )

            # Fallback to spawning a fresh subprocess if needed
            if not tools:
                try:
                    tools = await discover_mcp_server_tools(
                        config,
                        timeout=min(tool_discovery_timeout, MCP_SERVER_STARTUP_TIMEOUT),
                    )
                except Exception as e:
                    logger.error(f"Failed to discover tools for {config['id']}: {e}")
                    tools = []

            server.tools = tools
            server.is_available = len(tools) > 0

        servers.append(server)

        # Log status
        if server.is_available:
            logger.info(f"MCP server {config['name']} loaded with {len(server.tools)} tools")
        else:
            logger.warning(f"MCP server {config['name']} has no tools or is unavailable")

    # Log summary
    available_count = sum(1 for s in servers if s.is_available)
    total_tools = sum(len(s.tools) for s in servers)
    logger.info(
        f"Loaded {available_count}/{len(servers)} available MCP servers "
        f"with {total_tools} total tools"
    )

    return servers


# Global MCP servers cache
_mcp_servers: list[MCPServer] | None = None
_initialization_lock = asyncio.Lock()


async def get_mcp_servers(
    force_refresh: bool = False,
    discover_tools: bool = True,
) -> list[MCPServer]:
    """
    Get the cached MCP servers, initializing if needed.

    Args:
        force_refresh: Force re-initialization
        discover_tools: Whether to discover tools from servers

    Returns:
        List of MCPServer objects
    """
    global _mcp_servers

    async with _initialization_lock:
        if _mcp_servers is None or force_refresh:
            _mcp_servers = await create_mcp_servers_with_tools(
                discover_tools=discover_tools
            )

    return _mcp_servers


def get_mcp_servers_sync() -> list[MCPServer]:
    """
    Synchronous version to get cached MCP servers.

    Note: Returns empty list if not yet initialized.
    Use get_mcp_servers() in async context for proper initialization.

    Returns:
        List of MCPServer objects or empty list if not initialized
    """
    global _mcp_servers
    return _mcp_servers or []


async def initialize_mcp_servers(discover_tools: bool = True) -> list[MCPServer]:
    """
    Initialize MCP servers during application startup.

    This should be called during FastAPI/Jupyter server startup.

    Args:
        discover_tools: Whether to discover tools from servers

    Returns:
        List of initialized MCPServer objects
    """
    return await get_mcp_servers(force_refresh=True, discover_tools=discover_tools)
