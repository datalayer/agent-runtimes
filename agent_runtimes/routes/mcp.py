# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""FastAPI routes for MCP server management."""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException

from agent_runtimes.mcp import get_mcp_manager
from agent_runtimes.mcp.catalog_mcp_servers import (
    MCP_SERVER_CATALOG,
    check_env_vars_available,
    list_catalog_servers,
)
from agent_runtimes.mcp.lifecycle import get_mcp_lifecycle_manager
from agent_runtimes.types import MCPServer

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/mcp/servers", tags=["mcp"])


@router.get("/catalog", response_model=list[MCPServer])
async def get_catalog_servers() -> list[dict[str, Any]]:
    """
    Get all MCP servers from the catalog (predefined servers).

    These are servers that can be enabled on-demand via the /catalog/{server_name}/enable endpoint.
    They are NOT started automatically - users must explicitly enable them.

    Note: Catalog servers are stored separately from config servers (mcp.json),
    so the same server ID can exist in both without conflict.
    """
    try:
        lifecycle_manager = get_mcp_lifecycle_manager()
        servers = []
        for server in MCP_SERVER_CATALOG.values():
            # Use a deep copy and normalize required env vars to avoid loss on serialization
            server_copy = server.model_copy(deep=True)
            server_copy.required_env_vars = list(server.required_env_vars or [])
            server_copy.is_available = check_env_vars_available(
                server_copy.required_env_vars
            )
            # Check only in catalog server storage (is_config=False)
            server_copy.is_running = lifecycle_manager.is_catalog_server_running(
                server_copy.id
            )
            servers.append(server_copy)
        return [s.model_dump(by_alias=True) for s in servers]

    except Exception as e:
        logger.error(f"Error getting MCP catalog servers: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/config", response_model=list[MCPServer])
async def get_config_servers() -> list[dict[str, Any]]:
    """
    Get all MCP Config servers from ~/.datalayer/mcp.json.

    MCP Config servers are user-defined servers that are started automatically
    when the agent runtime starts. Users can select which config servers to
    include as toolsets for their agents.

    This is separate from the MCP Catalog which contains predefined servers
    that must be explicitly enabled.

    Returns only running config servers (not catalog servers).
    """
    try:
        lifecycle_manager = get_mcp_lifecycle_manager()
        running_instances = lifecycle_manager.get_all_running_servers()

        # Filter to only config servers (is_config=True means from mcp.json)
        config_servers = []
        for instance in running_instances:
            if instance.config.is_config:
                server_dict = instance.config.model_dump(by_alias=True)
                server_dict["isRunning"] = True
                server_dict["isAvailable"] = True
                config_servers.append(server_dict)

        logger.info(f"Returning {len(config_servers)} MCP config servers")
        return config_servers

    except Exception as e:
        logger.error(f"Error getting MCP config servers: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/available", response_model=list[MCPServer])
async def get_available_servers() -> list[dict[str, Any]]:
    """
    Get all available MCP servers - combines catalog servers with running config servers.

    Config and catalog servers are managed separately, so the same ID can exist in both.

    Returns:
    - All catalog servers (with isRunning status based on catalog server storage only)
    - All running config servers (from mcp.json, always with isRunning=True)
    """
    try:
        # Get all catalog servers from the catalog definition
        catalog_servers = list_catalog_servers()
        logger.debug(f"Catalog servers: {[s.id for s in catalog_servers]}")

        # Get running servers from lifecycle manager (separate storage)
        lifecycle_manager = get_mcp_lifecycle_manager()
        running_catalog_ids = set(lifecycle_manager.get_catalog_server_ids())
        running_config_instances = lifecycle_manager.get_config_servers()

        logger.info(f"Running catalog server IDs: {running_catalog_ids}")
        logger.info(
            f"Running config server IDs: {[i.server_id for i in running_config_instances]}"
        )

        result = []

        # Add ALL catalog servers with their running status (based on catalog storage only)
        for server in catalog_servers:
            server_dict = server.model_dump(by_alias=True)
            # Only check catalog storage for running status - config servers are separate
            is_running = server.id in running_catalog_ids
            server_dict["isRunning"] = is_running
            server_dict["isConfig"] = False  # Catalog servers are never config servers
            logger.debug(f"Catalog server {server.id}: isRunning={is_running}")

            # If server is running in catalog, get tools from the running instance
            if is_running:
                instance = lifecycle_manager.get_running_server(
                    server.id, is_config=False
                )
                if instance:
                    server_dict["tools"] = [
                        t.model_dump(by_alias=True) for t in instance.config.tools
                    ]

            result.append(server_dict)

        # Add ALL running config servers (from mcp.json) - these are separate from catalog
        for instance in running_config_instances:
            server_dict = instance.config.model_dump(by_alias=True)
            server_dict["isRunning"] = True
            server_dict["isConfig"] = True  # These are mcp.json config servers
            server_dict["isAvailable"] = True  # Running means available
            logger.info(f"Adding config server: {instance.server_id}")
            result.append(server_dict)

        return result

    except Exception as e:
        logger.error(f"Error getting available MCP servers: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/catalog/{server_name}/enable", response_model=MCPServer, status_code=201)
async def enable_catalog_server(server_name: str) -> dict[str, Any]:
    """
    Enable an MCP server from the catalog for the current session.

    This starts the MCP server process and adds it to the active session.
    The server will not persist across restarts.

    Config and catalog servers are separate - enabling a catalog server works
    even if a config server with the same ID exists.

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
                detail=f"Server '{server_name}' not found in catalog. Available: {available}",
            )

        lifecycle_manager = get_mcp_lifecycle_manager()

        # Check if already running in catalog storage specifically
        # (a server with same ID in config storage is separate and doesn't affect this)
        if lifecycle_manager.is_catalog_server_running(server_name):
            instance = lifecycle_manager.get_running_server(
                server_name, is_config=False
            )
            if instance:
                logger.info(f"Catalog server '{server_name}' already running")
                return instance.config.model_dump(by_alias=True)

        # Ensure the config has is_config=False for catalog servers
        catalog_config = catalog_server.model_copy(deep=True)
        catalog_config.is_config = False  # Explicitly mark as catalog server

        # Start the MCP server process
        instance = await lifecycle_manager.start_server(server_name, catalog_config)
        if not instance:
            failed = lifecycle_manager.get_failed_servers()
            error = failed.get(server_name, "Unknown error")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to start MCP server '{server_name}': {error}",
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
    Disable an MCP server from the current session (catalog servers only).

    This stops the MCP server process and removes it from the active session.

    Args:
        server_name: The name/ID of the MCP server to disable
    """
    try:
        lifecycle_manager = get_mcp_lifecycle_manager()
        mcp_manager = get_mcp_manager()

        # Check if server is running in catalog storage (is_config=False)
        if not lifecycle_manager.is_catalog_server_running(server_name):
            # Also check manager for backward compatibility
            if not mcp_manager.get_server(server_name):
                raise HTTPException(
                    status_code=404,
                    detail=f"Server '{server_name}' is not currently enabled in catalog",
                )

        # Stop the MCP server process (catalog servers only)
        stopped = await lifecycle_manager.stop_server(server_name, is_config=False)
        if not stopped:
            logger.warning(
                f"Server '{server_name}' was not running in lifecycle manager"
            )

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
            raise HTTPException(
                status_code=404, detail=f"Server not found: {server_id}"
            )

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
            raise HTTPException(
                status_code=404, detail=f"Server not found: {server_id}"
            )

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
            raise HTTPException(
                status_code=404, detail=f"Server not found: {server_id}"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting MCP server: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
