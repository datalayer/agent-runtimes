# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
MCP (Model Context Protocol) manager for agent-runtimes.

This module provides MCP server management that can be used by both
Jupyter and FastAPI servers.
"""

import logging
from typing import Any

from agent_runtimes.types import MCPServer

logger = logging.getLogger(__name__)


class MCPManager:
    """
    Manager for MCP server configurations.

    Handles CRUD operations for MCP servers and persistence.
    """

    def __init__(self) -> None:
        """Initialize the MCP manager."""
        self._servers: dict[str, MCPServer] = {}
        logger.info("MCPManager initialized")

    def get_servers(self) -> list[MCPServer]:
        """
        Get all configured MCP servers.

        Returns:
            List of MCPServer configurations
        """
        return list(self._servers.values())

    def get_server(self, server_id: str) -> MCPServer | None:
        """
        Get a specific MCP server by ID.

        Args:
            server_id: The server identifier

        Returns:
            MCPServer if found, None otherwise
        """
        return self._servers.get(server_id)

    def add_server(self, server: MCPServer) -> MCPServer:
        """
        Add a new MCP server.

        Args:
            server: The MCPServer configuration to add

        Returns:
            The added MCPServer
        """
        self._servers[server.id] = server
        logger.info(f"Added MCP server: {server.id} ({server.name})")
        return server

    def update_server(self, server_id: str, server: MCPServer) -> MCPServer | None:
        """
        Update an existing MCP server.

        Args:
            server_id: The ID of the server to update
            server: The new MCPServer configuration

        Returns:
            The updated MCPServer if found, None otherwise
        """
        if server_id not in self._servers:
            logger.warning(f"MCP server not found for update: {server_id}")
            return None

        # If ID changed, remove old entry
        if server.id != server_id:
            del self._servers[server_id]

        self._servers[server.id] = server
        logger.info(f"Updated MCP server: {server.id} ({server.name})")
        return server

    def remove_server(self, server_id: str) -> bool:
        """
        Remove an MCP server.

        Args:
            server_id: The ID of the server to remove

        Returns:
            True if removed, False if not found
        """
        if server_id in self._servers:
            del self._servers[server_id]
            logger.info(f"Removed MCP server: {server_id}")
            return True

        logger.warning(f"MCP server not found for removal: {server_id}")
        return False

    def load_servers(self, servers: list[MCPServer]) -> None:
        """
        Load multiple MCP servers (e.g., from config file).

        Args:
            servers: List of MCPServer configurations to load
        """
        for server in servers:
            self._servers[server.id] = server
        logger.info(f"Loaded {len(servers)} MCP servers")

    def to_dict_list(self) -> list[dict[str, Any]]:
        """
        Convert servers to list of dictionaries.

        Returns:
            List of server dictionaries
        """
        return [s.model_dump() for s in self._servers.values()]


# Global MCP manager instance (can be replaced with dependency injection)
_mcp_manager: MCPManager | None = None


def get_mcp_manager() -> MCPManager:
    """
    Get the global MCP manager instance.

    Returns:
        The MCPManager instance
    """
    global _mcp_manager
    if _mcp_manager is None:
        _mcp_manager = MCPManager()
    return _mcp_manager


def set_mcp_manager(manager: MCPManager) -> None:
    """
    Set the global MCP manager instance.

    Args:
        manager: The MCPManager to use
    """
    global _mcp_manager
    _mcp_manager = manager
