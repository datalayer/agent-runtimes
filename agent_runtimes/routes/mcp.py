# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""FastAPI routes for MCP server management."""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException

from agent_runtimes.mcp import get_mcp_manager
from agent_runtimes.types import MCPServer
from agent_runtimes.config.mcp_servers import MCP_SERVER_LIBRARY, list_mcp_servers as list_library_servers

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/mcp/servers", tags=["mcp"])


@router.get("/library", response_model=list[MCPServer])
async def get_library_servers() -> list[dict[str, Any]]:
    """Get all available MCP servers from the library (predefined servers)."""
    try:
        servers = list_library_servers()
        return [s.model_dump(by_alias=True) for s in servers]

    except Exception as e:
        logger.error(f"Error getting MCP library servers: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/library/{server_name}/enable", response_model=MCPServer, status_code=201)
async def enable_library_server(server_name: str) -> dict[str, Any]:
    """
    Enable an MCP server from the library for the current session.

    This adds a predefined MCP server to the active session.
    The server will not persist across restarts.

    Args:
        server_name: The name/ID of the MCP server from the library
                    (e.g., 'tavily', 'github', 'filesystem')
    """
    try:
        # Look up server in library
        library_server = MCP_SERVER_LIBRARY.get(server_name)
        if not library_server:
            available = list(MCP_SERVER_LIBRARY.keys())
            raise HTTPException(
                status_code=404,
                detail=f"Server '{server_name}' not found in library. Available: {available}"
            )

        mcp_manager = get_mcp_manager()

        # Check if already enabled
        existing = mcp_manager.get_server(server_name)
        if existing:
            return existing.model_dump(by_alias=True)

        # Add to session
        added_server = mcp_manager.add_server(library_server)
        logger.info(f"Enabled library MCP server for session: {server_name}")
        return added_server.model_dump(by_alias=True)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error enabling library MCP server: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/library/{server_name}/disable", status_code=204)
async def disable_library_server(server_name: str) -> None:
    """
    Disable an MCP server from the current session.

    This removes the server from the active session but does not
    remove it from the library.

    Args:
        server_name: The name/ID of the MCP server to disable
    """
    try:
        mcp_manager = get_mcp_manager()

        removed = mcp_manager.remove_server(server_name)
        if not removed:
            raise HTTPException(
                status_code=404,
                detail=f"Server '{server_name}' is not currently enabled"
            )

        logger.info(f"Disabled library MCP server for session: {server_name}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error disabling library MCP server: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("", response_model=list[MCPServer])
async def get_servers() -> list[dict[str, Any]]:
    """Get all configured MCP servers."""
    try:
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
