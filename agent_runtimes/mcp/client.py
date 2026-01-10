# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
MCP (Model Context Protocol) client and tool manager.

This module provides an HTTP client for communicating with MCP servers
and a tool manager for managing multiple MCP servers and their tools.
"""

import logging
from typing import Any

import httpx

from agent_runtimes.types import MCPServer

logger = logging.getLogger(__name__)


class MCPClient:
    """Client for communicating with MCP servers via HTTP."""

    def __init__(self, server_url: str) -> None:
        """
        Initialize MCP client.

        Args:
            server_url: URL of the MCP server
        """
        self.server_url = server_url.rstrip("/")
        # Create a long-lived HTTP client with appropriate settings
        self.client = httpx.AsyncClient(
            timeout=httpx.Timeout(
                connect=10.0,
                read=300.0,  # Long timeout for LLM responses
                write=10.0,
                pool=5.0,
            ),
            http2=False,  # Disable HTTP/2 for better compatibility
            follow_redirects=True,
            limits=httpx.Limits(
                max_keepalive_connections=5,
                max_connections=10,
                keepalive_expiry=60.0,
            ),
        )

    async def list_tools(self) -> list[dict[str, Any]]:
        """
        List available tools from MCP server.

        Returns:
            List of tool definitions
        """
        try:
            response = await self.client.get(f"{self.server_url}/tools")
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Error listing tools from {self.server_url}: {e}")
            return []

    async def call_tool(self, tool_name: str, arguments: dict[str, Any]) -> Any:
        """
        Call a tool on the MCP server.

        Args:
            tool_name: Name of the tool to call
            arguments: Tool arguments

        Returns:
            Tool execution result
        """
        try:
            response = await self.client.post(
                f"{self.server_url}/tools/{tool_name}",
                json={"arguments": arguments},
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Error calling tool {tool_name}: {e}")
            return {"error": str(e)}

    async def close(self) -> None:
        """Close the HTTP client."""
        await self.client.aclose()


class MCPToolManager:
    """
    Manage MCP tools and servers.

    This manager maintains connections to multiple MCP servers and provides
    unified access to their tools.
    """

    def __init__(self) -> None:
        """Initialize MCP tool manager."""
        self.servers: dict[str, MCPServer] = {}
        self.clients: dict[str, MCPClient] = {}
        logger.info("MCPToolManager initialized")

    def add_server(self, server: MCPServer) -> None:
        """
        Add an MCP server.

        Args:
            server: MCP server configuration
        """
        self.servers[server.id] = server
        if server.enabled:
            self.clients[server.id] = MCPClient(server.url)
        logger.info(f"Added MCP server: {server.id} ({server.name})")

    def remove_server(self, server_id: str) -> None:
        """
        Remove an MCP server.

        Args:
            server_id: ID of the server to remove
        """
        if server_id in self.servers:
            del self.servers[server_id]
        if server_id in self.clients:
            del self.clients[server_id]
        logger.info(f"Removed MCP server: {server_id}")

    def update_server(self, server_id: str, server: MCPServer) -> None:
        """
        Update an MCP server configuration.

        Args:
            server_id: ID of the server to update
            server: New server configuration
        """
        self.servers[server_id] = server
        if server.enabled and server_id not in self.clients:
            self.clients[server_id] = MCPClient(server.url)
        elif not server.enabled and server_id in self.clients:
            del self.clients[server_id]
        logger.info(f"Updated MCP server: {server_id}")

    def get_servers(self) -> list[MCPServer]:
        """
        Get all MCP servers.

        Returns:
            List of MCP server configurations
        """
        return list(self.servers.values())

    def get_server(self, server_id: str) -> MCPServer | None:
        """
        Get a specific MCP server by ID.

        Args:
            server_id: The server identifier

        Returns:
            MCPServer if found, None otherwise
        """
        return self.servers.get(server_id)

    async def get_available_tools(self) -> list[dict[str, Any]]:
        """
        Get all available tools from enabled MCP servers.

        Returns:
            List of tool definitions with server information
        """
        all_tools: list[dict[str, Any]] = []
        for server_id, client in self.clients.items():
            server = self.servers[server_id]
            if server.enabled:
                tools = await client.list_tools()
                for tool in tools:
                    tool["mcp_server_id"] = server_id
                    tool["mcp_server_name"] = server.name
                    all_tools.append(tool)
        return all_tools

    def register_with_agent(self, agent: Any) -> None:
        """
        Register MCP tools with a Pydantic AI agent.

        Args:
            agent: The Pydantic AI agent
        """
        # TODO: Implement dynamic tool registration
        # This will be implemented when we add MCP tool calling support
        pass

    async def close_all(self) -> None:
        """Close all MCP clients."""
        for client in self.clients.values():
            await client.close()
        logger.info("Closed all MCP clients")
