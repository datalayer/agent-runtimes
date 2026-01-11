# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
MCP Server definitions and availability checking.

This module defines predefined MCP servers and utilities for checking
their availability based on package installation and environment variables.
"""

import asyncio
import logging
import os
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from agent_runtimes.types import MCPServer, MCPServerTool

logger = logging.getLogger(__name__)


def check_env_vars_available(required_vars: list[str]) -> bool:
    """
    Check if all required environment variables are set.

    Args:
        required_vars: List of environment variable names

    Returns:
        True if all variables are set, False otherwise
    """
    return all(os.getenv(var) for var in required_vars)


def check_package_available(package_name: str) -> bool:
    """
    Check if a Python package is available by trying to import it.

    Args:
        package_name: Name of the Python package

    Returns:
        True if package can be imported, False otherwise
    """
    try:
        # Handle packages with dashes in name (convert to underscores for import)
        import_name = package_name.replace("-", "_")
        __import__(import_name)
        return True
    except ImportError:
        return False


def get_predefined_mcp_servers() -> list[dict[str, Any]]:
    """
    Get the list of predefined MCP server configurations.

    Returns:
        List of MCP server configuration dictionaries
    """
    return [
        {
            "id": "earthdata-mcp-server",
            "name": "NASA Earthdata MCP Server",
            "package_name": "earthdata_mcp_server",
            "command": "uvx",
            "args": ["earthdata-mcp-server"],
            "required_env_vars": ["EARTHDATA_USERNAME", "EARTHDATA_PASSWORD"],
            "transport": "stdio",
        },
        {
            "id": "markitdown-mcp",
            "name": "MarkItDown MCP Server",
            "package_name": "markitdown_mcp",
            "command": "uvx",
            "args": ["markitdown-mcp"],
            "required_env_vars": [],
            "transport": "stdio",
        },
        {
            "id": "logfire-mcp",
            "name": "Logfire MCP Server",
            "package_name": "logfire_mcp",
            "command": "uvx",
            "args": ["logfire-mcp"],
            "required_env_vars": ["LOGFIRE_TOKEN"],
            "transport": "stdio",
        },
        {
            "id": "linkedin-mcp-server",
            "name": "LinkedIn MCP Server",
            "package_name": "linkedin_mcp_server",
            "command": "uvx",
            "args": ["linkedin-mcp-server"],
            "required_env_vars": [
                "LINKEDIN_ACCESS_TOKEN",
            ],
            "transport": "stdio",
        },
        {
            "id": "jupyter-mcp-server",
            "name": "Jupyter MCP Server",
            "package_name": "jupyter_mcp_server",
            "command": "uvx",
            "args": ["jupyter-mcp-server"],
            "required_env_vars": [],  # Optional: JUPYTER_BASE_URL, JUPYTER_TOKEN
            "transport": "stdio",
        },
        {
            "id": "tavily-mcp",
            "name": "Tavily MCP Server",
            "package_name": "tavily_mcp",
            "command": "uvx",
            "args": ["tavily-mcp"],
            "required_env_vars": ["TAVILY_API_KEY"],
            "transport": "stdio",
        },
    ]


def check_mcp_server_available(server_config: dict[str, Any]) -> bool:
    """
    Check if an MCP server is available based on package import and env vars.

    Args:
        server_config: MCP server configuration dictionary

    Returns:
        True if server is available (package can be imported and env vars set)
    """
    # Check if the package can be imported
    package_name = server_config.get("package_name", "")
    if package_name and not check_package_available(package_name):
        logger.debug(f"Package '{package_name}' not available for {server_config['id']}")
        return False

    # Check required environment variables
    required_vars = server_config.get("required_env_vars", [])
    if required_vars and not check_env_vars_available(required_vars):
        missing = [v for v in required_vars if not os.getenv(v)]
        logger.debug(
            f"Missing env vars for {server_config['id']}: {', '.join(missing)}"
        )
        return False

    return True


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

    command = server_config.get("command")
    args = server_config.get("args", [])

    if not command:
        logger.warning(f"No command specified for {server_config['id']}")
        return tools

    try:
        # Create stdio server parameters
        server_params = StdioServerParameters(
            command=command,
            args=args,
            env={**os.environ},  # Pass current environment
        )

        logger.info(f"Starting MCP server {server_config['id']} for tool discovery...")

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

                    logger.info(
                        f"Discovered {len(tools)} tools from {server_config['id']}"
                    )

    except asyncio.TimeoutError:
        logger.warning(
            f"Timeout discovering tools from {server_config['id']} after {timeout}s"
        )
    except Exception as e:
        logger.error(f"Error discovering tools from {server_config['id']}: {e}")

    return tools


async def create_mcp_servers_with_availability(
    discover_tools: bool = True,
    tool_discovery_timeout: float = 30.0,
) -> list[MCPServer]:
    """
    Create MCP server configurations with availability checking.

    Args:
        discover_tools: Whether to discover tools from available servers
        tool_discovery_timeout: Timeout for tool discovery per server

    Returns:
        List of MCPServer objects with availability and tools populated
    """
    servers: list[MCPServer] = []
    predefined = get_predefined_mcp_servers()

    for config in predefined:
        is_available = check_mcp_server_available(config)

        server = MCPServer(
            id=config["id"],
            name=config["name"],
            package_name=config.get("package_name"),
            command=config.get("command"),
            args=config.get("args", []),
            required_env_vars=config.get("required_env_vars", []),
            is_available=is_available,
            enabled=is_available,  # Only enable if available
            transport=config.get("transport", "stdio"),
            tools=[],
        )

        # Discover tools if available and requested
        if is_available and discover_tools:
            try:
                tools = await discover_mcp_server_tools(
                    config, timeout=tool_discovery_timeout
                )
                server.tools = tools
            except Exception as e:
                logger.error(f"Failed to discover tools for {config['id']}: {e}")

        servers.append(server)

        # Log availability status
        if is_available:
            logger.info(f"MCP server {config['name']} is available with {len(server.tools)} tools")
        else:
            logger.debug(
                f"MCP server {config['name']} is unavailable "
                f"(required env vars: {', '.join(config.get('required_env_vars', []))})"
            )

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
        discover_tools: Whether to discover tools from available servers

    Returns:
        List of MCPServer objects
    """
    global _mcp_servers

    async with _initialization_lock:
        if _mcp_servers is None or force_refresh:
            _mcp_servers = await create_mcp_servers_with_availability(
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
        discover_tools: Whether to discover tools from available servers

    Returns:
        List of initialized MCPServer objects
    """
    return await get_mcp_servers(force_refresh=True, discover_tools=discover_tools)
