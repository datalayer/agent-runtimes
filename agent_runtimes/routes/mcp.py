# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""FastAPI routes for MCP server management."""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException

from agent_runtimes.mcp import get_mcp_manager
from agent_runtimes.types import MCPServer

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/mcp/servers", tags=["mcp"])


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
