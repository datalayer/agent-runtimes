#!/usr/bin/env python
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Agent Runtimes Server Entry Point.

This module provides the main entry point for running the agent-runtimes
FastAPI server with uvicorn.

Usage:
    # Run using the installed CLI command
    agent-runtimes

    # Or run as a Python module
    python -m agent_runtimes

    # Or with uvicorn for development
    uvicorn agent_runtimes.app:app --reload --port 8000

    # With custom host/port
    agent-runtimes --host 0.0.0.0 --port 8080

    # With a specific agent from the library
    agent-runtimes --agent-id data-acquisition

    # With a custom agent name
    agent-runtimes --agent-id data-acquisition --agent-name my-custom-agent

    # Start without MCP servers
    agent-runtimes --agent-id data-acquisition --no-mcp-servers
"""

import logging
import os
import sys
from enum import Enum
from typing import Annotated, Optional

import typer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

app = typer.Typer(
    name="agent-runtimes",
    help="Run the agent-runtimes server",
    add_completion=False,
    no_args_is_help=False,
)


class LogLevel(str, Enum):
    """Log level options."""

    debug = "debug"
    info = "info"
    warning = "warning"
    error = "error"
    critical = "critical"


def list_agents_callback(value: bool) -> None:
    """List available agents and exit."""
    if value:
        from agent_runtimes.config.agents import AGENT_SPECS

        typer.echo("\nAvailable Agent Specs:")
        typer.echo("-" * 60)
        for agent_id, agent in AGENT_SPECS.items():
            mcp_ids = [s.id for s in agent.mcp_servers]
            typer.echo(f"  {agent_id:<25} - {agent.name}")
            typer.echo(f"    {agent.description[:55]}...")
            typer.echo(f"    MCP Servers: {', '.join(mcp_ids)}")
            typer.echo()
        raise typer.Exit(0)


@app.command()
def main(
    host: Annotated[
        str,
        typer.Option("--host", "-h", help="Host to bind to"),
    ] = "127.0.0.1",
    port: Annotated[
        int,
        typer.Option("--port", "-p", help="Port to bind to"),
    ] = 8000,
    reload: Annotated[
        bool,
        typer.Option("--reload", "-r", help="Enable auto-reload for development"),
    ] = False,
    debug: Annotated[
        bool,
        typer.Option("--debug", "-d", help="Enable debug mode with verbose logging"),
    ] = False,
    workers: Annotated[
        int,
        typer.Option("--workers", "-w", help="Number of worker processes"),
    ] = 1,
    log_level: Annotated[
        LogLevel,
        typer.Option("--log-level", "-l", help="Log level"),
    ] = LogLevel.info,
    agent_id: Annotated[
        Optional[str],
        typer.Option(
            "--agent-id",
            "-a",
            help="Agent spec ID from the library to start (e.g., 'data-acquisition', 'crawler')",
        ),
    ] = None,
    agent_name: Annotated[
        Optional[str],
        typer.Option(
            "--agent-name",
            "-n",
            help="Custom name for the agent (defaults to 'default' if --agent-id is specified)",
        ),
    ] = None,
    no_mcp_servers: Annotated[
        bool,
        typer.Option(
            "--no-mcp-servers",
            help="Skip starting all MCP servers (config and agent spec)",
        ),
    ] = False,
    list_agents: Annotated[
        Optional[bool],
        typer.Option(
            "--list-agents",
            callback=list_agents_callback,
            is_eager=True,
            help="List available agent specs from the library and exit",
        ),
    ] = None,
) -> None:
    """Run the agent-runtimes server.

    Examples:

        # Start with defaults (localhost:8000)
        agent-runtimes

        # Start on all interfaces
        agent-runtimes --host 0.0.0.0

        # Start on custom port
        agent-runtimes --port 8080

        # Start with auto-reload for development
        agent-runtimes --reload

        # Start with debug logging
        agent-runtimes --debug

        # Start with a specific agent from the library
        agent-runtimes --agent-id data-acquisition

        # Start with a custom agent name
        agent-runtimes --agent-id crawler --agent-name my-crawler

        # Start without MCP servers
        agent-runtimes --agent-id data-acquisition --no-mcp-servers

        # List available agents
        agent-runtimes --list-agents
    """
    # Validate agent_name requires agent_id
    if agent_name and not agent_id:
        logger.error("--agent-name requires --agent-id to be specified")
        raise typer.Exit(1)

    # Validate agent if specified
    if agent_id:
        from agent_runtimes.config.agents import AGENT_SPECS, get_agent_spec

        agent_spec = get_agent_spec(agent_id)
        if not agent_spec:
            available = list(AGENT_SPECS.keys())
            logger.error(f"Agent '{agent_id}' not found. Available: {available}")
            raise typer.Exit(1)

        # Set environment variables for the app to pick up
        os.environ["AGENT_RUNTIMES_DEFAULT_AGENT"] = agent_id

        # Set custom agent name if provided
        effective_name = agent_name or "default"
        os.environ["AGENT_RUNTIMES_AGENT_NAME"] = effective_name

        # Set MCP servers flag
        if no_mcp_servers:
            os.environ["AGENT_RUNTIMES_NO_MCP_SERVERS"] = "true"
        else:
            # Clear the env var if not set (in case it was set previously)
            os.environ.pop("AGENT_RUNTIMES_NO_MCP_SERVERS", None)

        mcp_status = "disabled" if no_mcp_servers else "enabled"
        logger.info(
            f"Will start with agent: {agent_spec.name} "
            f"(registered as '{effective_name}', MCP servers: {mcp_status})"
        )

    # Set log level
    effective_log_level = log_level.value.upper()
    if debug:
        effective_log_level = "DEBUG"
    logging.getLogger().setLevel(effective_log_level)

    try:
        import uvicorn
    except ImportError:
        logger.error("uvicorn is not installed. Install it with: pip install uvicorn")
        raise typer.Exit(1)

    logger.info(f"Starting agent-runtimes server on {host}:{port}")
    logger.info(f"API docs available at http://{host}:{port}/docs")
    logger.info(f"ACP WebSocket endpoint: ws://{host}:{port}/api/v1/acp/ws/{{agent_id}}")

    # Exclude generated/ directory from reload watching (codemode generates bindings there)
    reload_excludes = ["generated/*", "generated/**/*", "*.pyc", "__pycache__"]

    uvicorn.run(
        "agent_runtimes.app:app",
        host=host,
        port=port,
        reload=reload,
        reload_excludes=reload_excludes if reload else None,
        workers=workers if not reload else 1,
        log_level=log_level.value,
    )


if __name__ == "__main__":
    app()
