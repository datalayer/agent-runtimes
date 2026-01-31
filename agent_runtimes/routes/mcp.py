# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""FastAPI routes for MCP server management."""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException

from agent_runtimes.mcp import get_mcp_manager
from agent_runtimes.mcp.lifecycle import get_mcp_lifecycle_manager
from agent_runtimes.types import MCPServer
from agent_runtimes.config.mcp_servers import MCP_SERVER_CATALOG, list_mcp_servers as list_catalog_servers

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/mcp/servers", tags=["mcp"])


@router.get("/catalog", response_model=list[MCPServer])
async def get_catalog_servers() -> list[dict[str, Any]]:
    """Get all available MCP servers from the catalog (predefined servers)."""
    try:
        servers = list_catalog_servers()
        return [s.model_dump(by_alias=True) for s in servers]

    except Exception as e:
        logger.error(f"Error getting MCP catalog servers: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/catalog/{server_name}/enable", response_model=MCPServer, status_code=201)
async def enable_catalog_server(server_name: str) -> dict[str, Any]:
    """
    Enable an MCP server from the catalog for the current session.

    This starts the MCP server process and adds it to the active session.
    The server will not persist across restarts.

    Args:
        server_name: The name/ID of the MCP server from the catalog
                    (e.g., 'tavily', 'github', 'filesystem')
    """
    try:
        # Look up server in catalog
        catalog_server = MCP_SERVER_CATALOG.get(server_name)
        if not catalog_server:
            available = list(MCP_SERVER_CATALOG.keys())
            raise HTTPException(
                status_code=404,
                detail=f"Server '{server_name}' not found in catalog. Available: {available}"
            )

        lifecycle_manager = get_mcp_lifecycle_manager()
        
        # Check if already running
        if lifecycle_manager.is_server_running(server_name):
            instance = lifecycle_manager.get_running_server(server_name)
            if instance:
                return instance.config.model_dump(by_alias=True)

        # Start the MCP server process
        instance = await lifecycle_manager.start_server(server_name, catalog_server)
        if not instance:
            failed = lifecycle_manager.get_failed_servers()
            error = failed.get(server_name, "Unknown error")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to start MCP server '{server_name}': {error}"
            )

        # Also add to manager for backward compatibility
        mcp_manager = get_mcp_manager()
        mcp_manager.add_server(instance.config)

        logger.info(f"Enabled and started catalog MCP server: {server_name}")
        return instance.config.model_dump(by_alias=True)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error enabling catalog MCP server: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/catalog/{server_name}/disable", status_code=204)
async def disable_catalog_server(server_name: str) -> None:
    """
    Disable an MCP server from the current session.

    This stops the MCP server process and removes it from the active session.

    Args:
        server_name: The name/ID of the MCP server to disable
    """
    try:
        lifecycle_manager = get_mcp_lifecycle_manager()
        mcp_manager = get_mcp_manager()

        # Check if server is running
        if not lifecycle_manager.is_server_running(server_name):
            # Also check manager for backward compatibility
            if not mcp_manager.get_server(server_name):
                raise HTTPException(
                    status_code=404,
                    detail=f"Server '{server_name}' is not currently enabled"
                )

        # Stop the MCP server process
        stopped = await lifecycle_manager.stop_server(server_name)
        if not stopped:
            logger.warning(f"Server '{server_name}' was not running in lifecycle manager")

        # Also remove from manager for backward compatibility
        mcp_manager.remove_server(server_name)

        logger.info(f"Disabled and stopped catalog MCP server: {server_name}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error disabling catalog MCP server: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("", response_model=list[MCPServer])
async def get_servers() -> list[dict[str, Any]]:
    """Get all active/running MCP servers."""
    try:
        # Try lifecycle manager first (has actual running state)
        lifecycle_manager = get_mcp_lifecycle_manager()
        running_instances = lifecycle_manager.get_all_running_servers()
        
        if running_instances:
            servers = [instance.config.model_dump() for instance in running_instances]
            return servers
        
        # Fallback to mcp_manager (old path, for backward compatibility)
        mcp_manager = get_mcp_manager()
        servers = mcp_manager.get_servers()
        return [s.model_dump() for s in servers]

    except Exception as e:
        logger.error(f"Error getting MCP servers: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{server_id}", response_model=MCPServer)
async def get_server(server_id: str) -> dict[str, Any]:
    """Get a specific MCP server by ID."""
    try:
        mcp_manager = get_mcp_manager()
        server = mcp_manager.get_server(server_id)

        if not server:
            raise HTTPException(status_code=404, detail=f"Server not found: {server_id}")

        return server.model_dump()

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting MCP server: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", response_model=MCPServer, status_code=201)
async def create_server(server: MCPServer) -> dict[str, Any]:
    """Add a new MCP server."""
    try:
        mcp_manager = get_mcp_manager()

        # Check if server already exists
        existing = mcp_manager.get_server(server.id)
        if existing:
            raise HTTPException(
                status_code=409, detail=f"Server already exists: {server.id}"
            )

        added_server = mcp_manager.add_server(server)
        return added_server.model_dump()

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding MCP server: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{server_id}", response_model=MCPServer)
async def update_server(server_id: str, server: MCPServer) -> dict[str, Any]:
    """Update an existing MCP server."""
    try:
        mcp_manager = get_mcp_manager()

        updated_server = mcp_manager.update_server(server_id, server)
        if not updated_server:
            raise HTTPException(status_code=404, detail=f"Server not found: {server_id}")

        return updated_server.model_dump()

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating MCP server: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{server_id}", status_code=204)
async def delete_server(server_id: str) -> None:
    """Delete an MCP server."""
    try:
        mcp_manager = get_mcp_manager()

        removed = mcp_manager.remove_server(server_id)
        if not removed:
            raise HTTPException(status_code=404, detail=f"Server not found: {server_id}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting MCP server: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
