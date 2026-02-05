# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
MCP Toolsets management for Pydantic AI agents.

This module provides server-level MCP toolset management that loads
MCP servers once at server startup and makes them available to all agents.

MCP servers are managed using the MCPLifecycleManager which handles:
- Starting/stopping MCP servers dynamically
- Tracking running state and tool discovery
- Merging mcp.json config with catalog commands

Uses Pydantic AI's built-in MCP client support (MCPServerStdio, MCPServerStreamableHTTP)
which automatically detects the transport type from the config:
- `command` field → MCPServerStdio (stdio transport)
- `url` field ending with `/sse` → MCPServerSSE (deprecated SSE transport)
- `url` field (not `/sse`) → MCPServerStreamableHTTP (recommended HTTP transport)
"""

import logging
import os
from pathlib import Path
from typing import Any

from agent_runtimes.mcp.lifecycle import get_mcp_lifecycle_manager

logger = logging.getLogger(__name__)

# Re-export constants for backward compatibility
MCP_SERVER_STARTUP_TIMEOUT = 300  # 5 minutes
MCP_SERVER_HANDSHAKE_TIMEOUT = 180
MCP_SERVER_MAX_ATTEMPTS = 3


def get_mcp_config_path() -> Path:
    """
    Get the path to the MCP configuration file.

    Returns:
        Path to mcp.json file
    """
    return Path.home() / ".datalayer" / "mcp.json"


def ensure_config_mcp_toolsets_event() -> None:
    """Ensure the initialization event exists for external waiters."""
    # Lifecycle manager handles this internally
    pass


async def initialize_config_mcp_toolsets() -> None:
    """
    Initialize MCP toolsets at server startup.

    This loads MCP servers from the config file and starts them.
    For each server in mcp.json:
    - If it matches a catalog server, use the catalog command
    - Otherwise use the command from mcp.json

    Respects the AGENT_RUNTIMES_NO_CONFIG_MCP_SERVERS environment variable:
    if set to "true", skips initialization entirely.
    """
    # Check if config MCP servers should be skipped (--no-config-mcp-servers CLI flag)
    no_config_mcp_servers = (
        os.environ.get("AGENT_RUNTIMES_NO_CONFIG_MCP_SERVERS", "").lower() == "true"
    )
    if no_config_mcp_servers:
        logger.info(
            "Config MCP toolsets initialization skipped via AGENT_RUNTIMES_NO_CONFIG_MCP_SERVERS"
        )
        return

    logger.info(
        "initialize_config_mcp_toolsets() called - delegating to lifecycle manager"
    )
    manager = get_mcp_lifecycle_manager()
    try:
        await manager.initialize_from_config()
        logger.info("initialize_config_mcp_toolsets() completed")
    except Exception as e:
        logger.error(f"initialize_config_mcp_toolsets() failed: {e}", exc_info=True)


async def shutdown_config_mcp_toolsets() -> None:
    """
    Shutdown config MCP toolsets at server shutdown.

    This stops all running MCP server connections/subprocesses.
    """
    manager = get_mcp_lifecycle_manager()
    await manager.shutdown()
    logger.info("Config MCP toolsets shutdown complete")


def get_config_mcp_toolsets() -> list[Any]:
    """
    Get the list of successfully started config MCP toolsets.

    These can be passed directly to Pydantic AI Agent(toolsets=...).

    Returns:
        List of MCP server toolsets
    """
    manager = get_mcp_lifecycle_manager()
    return manager.get_pydantic_toolsets()


def get_config_mcp_toolsets_status() -> dict[str, Any]:
    """
    Get the status of config MCP toolsets initialization.

    Returns:
        Dict with status information including:
        - initialized: Whether initialization has completed
        - ready_count: Number of servers ready
        - failed_count: Number of servers that failed to start
        - ready_servers: List of server IDs that are ready
        - failed_servers: Dict of server ID -> error message for failed servers
    """
    manager = get_mcp_lifecycle_manager()
    running = manager.get_all_running_servers()
    failed = manager.get_failed_servers()

    return {
        "initialized": manager.is_initialized(),
        "ready_count": len(running),
        "failed_count": len(failed),
        "ready_servers": [s.server_id for s in running],
        "failed_servers": failed,
    }


async def wait_for_config_mcp_toolsets(timeout: float | None = None) -> bool:
    """Wait until config MCP toolsets initialization completes."""
    manager = get_mcp_lifecycle_manager()
    return await manager.wait_for_initialization(timeout=timeout)


def get_config_mcp_toolsets_info() -> list[dict[str, Any]]:
    """
    Get information about the loaded config MCP toolsets.

    Returns:
        List of dicts with toolset info (type, id, command/url)
        Note: Sensitive information like cookies/tokens in args are redacted.
    """
    manager = get_mcp_lifecycle_manager()
    info = []

    for instance in manager.get_all_running_servers():
        server = instance.pydantic_server
        server_info: dict[str, Any] = {
            "type": type(server).__name__,
            "id": instance.server_id,
        }
        if hasattr(server, "command"):
            server_info["command"] = server.command
        if hasattr(server, "args"):
            # Redact potentially sensitive args (anything that looks like a token/cookie)
            args = []
            for arg in server.args:
                if isinstance(arg, str) and len(arg) > 50:
                    # Long strings are likely tokens/cookies - redact them
                    args.append(f"{arg[:10]}...{arg[-4:]}")
                else:
                    args.append(arg)
            server_info["args"] = args
        if hasattr(server, "url"):
            server_info["url"] = server.url
        info.append(server_info)

    return info


def is_config_mcp_toolsets_initialized() -> bool:
    """Return True when config MCP toolsets initialization has completed."""
    manager = get_mcp_lifecycle_manager()
    return manager.is_initialized()
