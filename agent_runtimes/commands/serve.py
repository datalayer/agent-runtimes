# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Serve command for the Agent Runtimes CLI.

This module provides the serve command that starts the agent-runtimes server.
It can be used directly by other libraries or through the CLI.

Usage as library:
    from agent_runtimes.commands.serve import serve_server, LogLevel

    # Start server programmatically
    serve_server(host="0.0.0.0", port=8080, debug=True)

    # With agent from the library
    serve_server(agent_id="crawler", agent_name="my-crawler")

    # With automatic port finding
    serve_server(port=8000, find_free_port=True)
"""

import logging
import os
import socket
from enum import Enum
from typing import Optional

logger = logging.getLogger(__name__)


class LogLevel(str, Enum):
    """
    Log level options.
    """

    debug = "debug"
    info = "info"
    warning = "warning"
    error = "error"
    critical = "critical"


class Protocol(str, Enum):
    """
    Transport protocol options.
    """

    ag_ui = "ag-ui"
    vercel_ai = "vercel-ai"
    vercel_ai_jupyter = "vercel-ai-jupyter"
    a2a = "a2a"


def is_port_free(host: str, port: int) -> bool:
    """
    Check if a port is available for binding.

    Args:
        host: Host address to check
        port: Port number to check

    Returns:
        True if port is free, False otherwise
    """
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind((host, port))
            return True
    except OSError:
        return False


def find_free_port(host: str, start_port: int, max_attempts: int = 100) -> int:
    """
    Find a free port starting from the given port.

    Args:
        host: Host address to check
        start_port: Starting port number
        max_attempts: Maximum number of ports to try

    Returns:
        First available port found

    Raises:
        ServeError: If no free port found within max_attempts
    """
    for offset in range(max_attempts):
        port = start_port + offset
        if is_port_free(host, port):
            return port
    raise ServeError(
        f"Could not find a free port between {start_port} and {start_port + max_attempts - 1}"
    )


def parse_skills(value: Optional[str]) -> list[str]:
    """
    Parse comma-separated skills string into a list.
    """
    if not value:
        return []
    return [s.strip() for s in value.split(",") if s.strip()]


def parse_mcp_servers(value: Optional[str]) -> list[str]:
    """
    Parse comma-separated MCP server IDs string into a list.
    """
    if not value:
        return []
    return [s.strip() for s in value.split(",") if s.strip()]


class ServeError(Exception):
    """
    Error raised during serve command execution.
    """

    pass


def serve_server(
    host: str = "127.0.0.1",
    port: int = 8000,
    reload: bool = False,
    debug: bool = False,
    workers: int = 1,
    log_level: LogLevel = LogLevel.info,
    agent_id: Optional[str] = None,
    agent_name: Optional[str] = None,
    no_config_mcp_servers: bool = False,
    no_catalog_mcp_servers: bool = False,
    mcp_servers: Optional[str] = None,
    codemode: bool = False,
    skills: Optional[str] = None,
    protocol: Protocol = Protocol.ag_ui,
    find_free_port_flag: bool = False,
) -> int:
    """
    Start the agent-runtimes server.

    This is the core logic of the serve command, usable by other libraries.

    Args:
        host: Host to bind to
        port: Port to bind to
        reload: Enable auto-reload for development
        debug: Enable debug mode with verbose logging
        workers: Number of worker processes
        log_level: Log level (debug, info, warning, error, critical)
        agent_id: Agent spec ID from the library to start
        agent_name: Custom name for the agent
        no_config_mcp_servers: Skip starting config MCP servers from ~/.datalayer/mcp.json
        no_catalog_mcp_servers: Skip starting catalog MCP servers defined in agent spec
        mcp_servers: Comma-separated list of MCP server IDs from the catalog to start
        codemode: Enable Code Mode (MCP servers become programmatic tools)
        skills: Comma-separated list of skills to enable (requires codemode)
        protocol: Transport protocol to use (ag-ui, vercel-ai, vercel-ai-jupyter, a2a)
        find_free_port_flag: If True, find a free port starting from the given port

    Returns:
        The actual port the server is running on

    Raises:
        ServeError: If validation fails or server cannot start
    """
    # Find a free port if requested
    actual_port = port
    if find_free_port_flag:
        if not is_port_free(host, port):
            actual_port = find_free_port(host, port)
            logger.info(f"Port {port} is in use, using port {actual_port} instead")
        else:
            logger.info(f"Port {port} is available")
    # Validate agent_name requires agent_id
    if agent_name and not agent_id:
        raise ServeError("--agent-name requires --agent-id to be specified")

    # Validate skills requires codemode
    if skills and not codemode:
        raise ServeError("--skills requires --codemode to be specified")

    # Validate agent if specified
    if agent_id:
        from agent_runtimes.config.agents import AGENT_SPECS, get_agent_spec

        agent_spec = get_agent_spec(agent_id)
        if not agent_spec:
            available = list(AGENT_SPECS.keys())
            raise ServeError(f"Agent '{agent_id}' not found. Available: {available}")

        # Ensure env vars are set for uvicorn (which loads app.py in separate context)
        os.environ["AGENT_RUNTIMES_DEFAULT_AGENT"] = agent_id

        # Set custom agent name if provided
        effective_name = agent_name or "default"
        os.environ["AGENT_RUNTIMES_AGENT_NAME"] = effective_name

        logger.info(
            f"Will start with agent: {agent_spec.name} "
            f"(registered as '{effective_name}')"
        )

    # Ensure env vars are set for uvicorn (which loads app.py in separate context)
    if no_config_mcp_servers:
        os.environ["AGENT_RUNTIMES_NO_CONFIG_MCP_SERVERS"] = "true"
        logger.info("Config MCP servers disabled (--no-config-mcp-servers)")

    if no_catalog_mcp_servers:
        os.environ["AGENT_RUNTIMES_NO_CATALOG_MCP_SERVERS"] = "true"
        logger.info("Catalog MCP servers disabled (--no-catalog-mcp-servers)")

    if mcp_servers:
        mcp_servers_list = parse_mcp_servers(mcp_servers)
        os.environ["AGENT_RUNTIMES_MCP_SERVERS"] = ",".join(mcp_servers_list)
        if codemode:
            logger.info(
                f"MCP servers (Code Mode): {mcp_servers_list} - will be converted to programmatic tools"
            )
        else:
            logger.info(
                f"MCP servers: {mcp_servers_list} - will be started as toolsets"
            )

    if codemode:
        os.environ["AGENT_RUNTIMES_CODEMODE"] = "true"
        logger.info(
            "Code Mode enabled: MCP servers will become programmatic tools via CodemodeToolset"
        )

        if skills:
            skills_list = parse_skills(skills)
            os.environ["AGENT_RUNTIMES_SKILLS"] = ",".join(skills_list)
            logger.info(f"Skills enabled: {skills_list}")

    # Set protocol
    os.environ["AGENT_RUNTIMES_PROTOCOL"] = protocol.value
    logger.info(f"Protocol: {protocol.value}")

    # Set log level
    effective_log_level = log_level.value.upper()
    if debug:
        effective_log_level = "DEBUG"
    logging.getLogger().setLevel(effective_log_level)

    try:
        import uvicorn
    except ImportError:
        raise ServeError(
            "uvicorn is not installed. Install it with: pip install uvicorn"
        )

    logger.info(f"Starting agent-runtimes server on {host}:{actual_port}")
    logger.info(f"API docs available at http://{host}:{actual_port}/docs")
    logger.info(
        f"ACP WebSocket endpoint: ws://{host}:{actual_port}/api/v1/acp/ws/{{agent_id}}"
    )

    # Exclude generated/ directory from reload watching (codemode generates bindings there)
    reload_excludes = ["generated/*", "generated/**/*", "*.pyc", "__pycache__"]

    uvicorn.run(
        "agent_runtimes.app:app",
        host=host,
        port=actual_port,
        reload=reload,
        reload_excludes=reload_excludes if reload else None,
        workers=workers if not reload else 1,
        log_level=log_level.value,
    )

    return actual_port
