#!/usr/bin/env python
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Agent Runtimes CLI.

This module provides the command-line interface for managing the agent-runtimes
server and querying running agents.

Usage:
    # Start the server
    agent-runtimes serve

    # Start with custom host/port
    agent-runtimes serve --host 0.0.0.0 --port 8080

    # List running agents on a server
    agent-runtimes list-agents

    # List agents on a specific server
    agent-runtimes list-agents --host 0.0.0.0 --port 8080

    # List available agent specs from the library
    agent-runtimes list-specs
"""

import json
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
    help="Agent Runtimes CLI - manage servers and query agents",
    add_completion=False,
    no_args_is_help=True,
)


class LogLevel(str, Enum):
    """Log level options."""

    debug = "debug"
    info = "info"
    warning = "warning"
    error = "error"
    critical = "critical"


class OutputFormat(str, Enum):
    """Output format options."""

    table = "table"
    json = "json"


def parse_skills(value: Optional[str]) -> list[str]:
    """Parse comma-separated skills string into a list."""
    if not value:
        return []
    return [s.strip() for s in value.split(",") if s.strip()]


def parse_mcp_servers(value: Optional[str]) -> list[str]:
    """Parse comma-separated MCP server IDs string into a list."""
    if not value:
        return []
    return [s.strip() for s in value.split(",") if s.strip()]


# ============================================================================
# serve command
# ============================================================================


@app.command()
def serve(
    host: Annotated[
        str,
        typer.Option("--host", "-h", envvar="AGENT_RUNTIMES_HOST", help="Host to bind to"),
    ] = "127.0.0.1",
    port: Annotated[
        int,
        typer.Option("--port", "-p", envvar="AGENT_RUNTIMES_PORT", help="Port to bind to"),
    ] = 8000,
    reload: Annotated[
        bool,
        typer.Option("--reload", "-r", envvar="AGENT_RUNTIMES_RELOAD", help="Enable auto-reload for development"),
    ] = False,
    debug: Annotated[
        bool,
        typer.Option("--debug", "-d", envvar="AGENT_RUNTIMES_DEBUG", help="Enable debug mode with verbose logging"),
    ] = False,
    workers: Annotated[
        int,
        typer.Option("--workers", "-w", envvar="AGENT_RUNTIMES_WORKERS", help="Number of worker processes"),
    ] = 1,
    log_level: Annotated[
        LogLevel,
        typer.Option("--log-level", "-l", envvar="AGENT_RUNTIMES_LOG_LEVEL", help="Log level"),
    ] = LogLevel.info,
    agent_id: Annotated[
        Optional[str],
        typer.Option(
            "--agent-id",
            "-a",
            envvar="AGENT_RUNTIMES_DEFAULT_AGENT",
            help="Agent spec ID from the library to start (e.g., 'data-acquisition', 'crawler')",
        ),
    ] = None,
    agent_name: Annotated[
        Optional[str],
        typer.Option(
            "--agent-name",
            "-n",
            envvar="AGENT_RUNTIMES_AGENT_NAME",
            help="Custom name for the agent (defaults to 'default' if --agent-id is specified)",
        ),
    ] = None,
    no_config_mcp_servers: Annotated[
        bool,
        typer.Option(
            "--no-config-mcp-servers",
            envvar="AGENT_RUNTIMES_NO_CONFIG_MCP_SERVERS",
            help="Skip starting config MCP servers from ~/.datalayer/mcp.json",
        ),
    ] = False,
    mcp_servers: Annotated[
        Optional[str],
        typer.Option(
            "--mcp-servers",
            "-m",
            envvar="AGENT_RUNTIMES_MCP_SERVERS",
            help="Comma-separated list of MCP server IDs from the catalog to start",
        ),
    ] = None,
    codemode: Annotated[
        bool,
        typer.Option(
            "--codemode",
            "-c",
            envvar="AGENT_RUNTIMES_CODEMODE",
            help="Enable Code Mode: MCP servers become programmatic tools via CodemodeToolset",
        ),
    ] = False,
    skills: Annotated[
        Optional[str],
        typer.Option(
            "--skills",
            "-s",
            envvar="AGENT_RUNTIMES_SKILLS",
            help="Comma-separated list of skills to enable (requires --codemode)",
        ),
    ] = None,
) -> None:
    """Start the agent-runtimes server.

    Examples:

        # Start with defaults (localhost:8000)
        agent-runtimes serve

        # Start on all interfaces
        agent-runtimes serve --host 0.0.0.0

        # Start on custom port
        agent-runtimes serve --port 8080

        # Start with auto-reload for development
        agent-runtimes serve --reload

        # Start with debug logging
        agent-runtimes serve --debug

        # Start with a specific agent from the library
        agent-runtimes serve --agent-id data-acquisition

        # Start with a custom agent name
        agent-runtimes serve --agent-id crawler --agent-name my-crawler

        # Start without config MCP servers (from ~/.datalayer/mcp.json)
        agent-runtimes serve --no-config-mcp-servers

        # Start with specific MCP servers from the catalog
        agent-runtimes serve --mcp-servers tavily,github

        # Start with Code Mode (MCP servers become programmatic tools)
        agent-runtimes serve --codemode --mcp-servers tavily,github

        # Start with Code Mode and skills
        agent-runtimes serve --codemode --mcp-servers tavily --skills web_search,github_lookup

        # Using environment variables instead of CLI options
        AGENT_RUNTIMES_PORT=8080 agent-runtimes serve
        AGENT_RUNTIMES_DEFAULT_AGENT=data-acquisition agent-runtimes serve
    """
    # Validate agent_name requires agent_id
    if agent_name and not agent_id:
        logger.error("--agent-name requires --agent-id to be specified")
        raise typer.Exit(1)

    # Validate skills requires codemode
    if skills and not codemode:
        logger.error("--skills requires --codemode to be specified")
        raise typer.Exit(1)

    # Validate agent if specified
    if agent_id:
        from agent_runtimes.config.agents import AGENT_SPECS, get_agent_spec

        agent_spec = get_agent_spec(agent_id)
        if not agent_spec:
            available = list(AGENT_SPECS.keys())
            logger.error(f"Agent '{agent_id}' not found. Available: {available}")
            raise typer.Exit(1)

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

    if mcp_servers:
        mcp_servers_list = parse_mcp_servers(mcp_servers)
        os.environ["AGENT_RUNTIMES_MCP_SERVERS"] = ",".join(mcp_servers_list)
        if codemode:
            logger.info(f"MCP servers (Code Mode): {mcp_servers_list} - will be converted to programmatic tools")
        else:
            logger.info(f"MCP servers: {mcp_servers_list} - will be started as toolsets")

    if codemode:
        os.environ["AGENT_RUNTIMES_CODEMODE"] = "true"
        logger.info("Code Mode enabled: MCP servers will become programmatic tools via CodemodeToolset")
        
        if skills:
            skills_list = parse_skills(skills)
            os.environ["AGENT_RUNTIMES_SKILLS"] = ",".join(skills_list)
            logger.info(f"Skills enabled: {skills_list}")

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


# ============================================================================
# list-agents command
# ============================================================================


@app.command("list-agents")
def list_agents(
    host: Annotated[
        str,
        typer.Option("--host", "-h", envvar="AGENT_RUNTIMES_HOST", help="Server host to query"),
    ] = "127.0.0.1",
    port: Annotated[
        int,
        typer.Option("--port", "-p", envvar="AGENT_RUNTIMES_PORT", help="Server port to query"),
    ] = 8000,
    output: Annotated[
        OutputFormat,
        typer.Option("--output", "-o", help="Output format"),
    ] = OutputFormat.table,
) -> None:
    """List running agents on a server.

    Queries the agent-runtimes server API to get information about
    currently running agents.

    Examples:

        # List agents on default server (localhost:8000)
        agent-runtimes list-agents

        # List agents on a specific server
        agent-runtimes list-agents --host 0.0.0.0 --port 8080

        # Output as JSON
        agent-runtimes list-agents --output json

        # Using environment variables
        AGENT_RUNTIMES_HOST=0.0.0.0 AGENT_RUNTIMES_PORT=8080 agent-runtimes list-agents
    """
    try:
        import httpx
    except ImportError:
        typer.echo("Error: httpx is not installed. Install it with: pip install httpx", err=True)
        raise typer.Exit(1)

    url = f"http://{host}:{port}/api/v1/agents"
    
    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.get(url)
            response.raise_for_status()
            data = response.json()
    except httpx.ConnectError:
        typer.echo(f"Error: Could not connect to server at {host}:{port}", err=True)
        typer.echo("Make sure the agent-runtimes server is running.", err=True)
        raise typer.Exit(1)
    except httpx.HTTPStatusError as e:
        typer.echo(f"Error: Server returned {e.response.status_code}", err=True)
        raise typer.Exit(1)
    except Exception as e:
        typer.echo(f"Error: {e}", err=True)
        raise typer.Exit(1)

    agents = data.get("agents", [])

    if output == OutputFormat.json:
        typer.echo(json.dumps(data, indent=2))
    else:
        # Table format
        if not agents:
            typer.echo(f"\nNo running agents on {host}:{port}")
            return

        typer.echo(f"\nRunning Agents on {host}:{port}")
        typer.echo("-" * 80)
        typer.echo(f"{'ID':<25} {'Name':<25} {'Status':<10}")
        typer.echo("-" * 80)
        
        for agent in agents:
            agent_id = agent.get("id", "unknown")
            name = agent.get("name", "unknown")
            status = agent.get("status", "unknown")
            typer.echo(f"{agent_id:<25} {name:<25} {status:<10}")
        
        typer.echo("-" * 80)
        typer.echo(f"Total: {len(agents)} agent(s)")


# ============================================================================
# list-specs command
# ============================================================================


@app.command("list-specs")
def list_specs(
    output: Annotated[
        OutputFormat,
        typer.Option("--output", "-o", help="Output format"),
    ] = OutputFormat.table,
) -> None:
    """List available agent specs from the library.

    Shows predefined agent templates that can be used when starting the server
    with --agent-id.

    Examples:

        # List available agent specs
        agent-runtimes list-specs

        # Output as JSON
        agent-runtimes list-specs --output json
    """
    from agent_runtimes.config.agents import AGENT_SPECS

    if output == OutputFormat.json:
        specs = []
        for agent_id, agent in AGENT_SPECS.items():
            specs.append({
                "id": agent_id,
                "name": agent.name,
                "description": agent.description,
                "mcp_servers": [s.id for s in agent.mcp_servers],
            })
        typer.echo(json.dumps(specs, indent=2))
    else:
        # Table format
        typer.echo("\nAvailable Agent Specs:")
        typer.echo("-" * 80)
        
        for agent_id, agent in AGENT_SPECS.items():
            mcp_ids = [s.id for s in agent.mcp_servers]
            typer.echo(f"  {agent_id:<25} - {agent.name}")
            # Truncate description to fit
            desc = agent.description[:55] + "..." if len(agent.description) > 55 else agent.description
            typer.echo(f"    {desc}")
            typer.echo(f"    MCP Servers: {', '.join(mcp_ids) if mcp_ids else 'none'}")
            typer.echo()
        
        typer.echo(f"Total: {len(AGENT_SPECS)} agent spec(s)")


if __name__ == "__main__":
    app()
