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

For programmatic usage, import from agent_runtimes.commands:
    from agent_runtimes.commands import serve_server, list_agents_from_server
"""

import logging
from typing import Annotated, Optional

import typer

from agent_runtimes.commands.serve import (
    LogLevel,
    Protocol,
    ServeError,
    parse_mcp_servers,
    parse_skills,
    serve_server,
)
from agent_runtimes.commands.list_agents import (
    ListAgentsError,
    OutputFormat,
    list_agents_from_server,
)
from agent_runtimes.commands.list_specs import list_agent_specs
from agent_runtimes.commands.mcp_servers_catalog import list_mcp_servers_catalog
from agent_runtimes.commands.mcp_servers_config import list_mcp_servers_config

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
    protocol: Annotated[
        Protocol,
        typer.Option(
            "--protocol",
            "-t",
            envvar="AGENT_RUNTIMES_PROTOCOL",
            help="Transport protocol to use (ag-ui, vercel-ai, vercel-ai-jupyter, a2a)",
        ),
    ] = Protocol.ag_ui,
    find_free_port: Annotated[
        bool,
        typer.Option(
            "--find-free-port",
            "-f",
            envvar="AGENT_RUNTIMES_FIND_FREE_PORT",
            help="If the port is in use, find the next available port",
        ),
    ] = False,
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

        # Start with a specific protocol
        agent-runtimes serve --agent-id crawler --protocol vercel-ai

        # Start with Vercel AI Jupyter protocol for notebook integration
        agent-runtimes serve --agent-id data-acquisition --protocol vercel-ai-jupyter

        # Start with automatic port finding (if 8000 is taken, tries 8001, 8002, etc.)
        agent-runtimes serve --find-free-port

        # Using environment variables instead of CLI options
        AGENT_RUNTIMES_PORT=8080 agent-runtimes serve
        AGENT_RUNTIMES_DEFAULT_AGENT=data-acquisition agent-runtimes serve
    """
    try:
        serve_server(
            host=host,
            port=port,
            reload=reload,
            debug=debug,
            workers=workers,
            log_level=log_level,
            agent_id=agent_id,
            agent_name=agent_name,
            no_config_mcp_servers=no_config_mcp_servers,
            mcp_servers=mcp_servers,
            codemode=codemode,
            skills=skills,
            protocol=protocol,
            find_free_port_flag=find_free_port,
        )
    except ServeError as e:
        logger.error(str(e))
        raise typer.Exit(1)


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
        list_agents_from_server(host=host, port=port, output=output)
    except ListAgentsError as e:
        typer.echo(f"Error: {e}", err=True)
        raise typer.Exit(1)


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
    list_agent_specs(output=output)


# ============================================================================
# mcp-servers-catalog command
# ============================================================================


@app.command("mcp-servers-catalog")
def mcp_servers_catalog(
    output: Annotated[
        OutputFormat,
        typer.Option("--output", "-o", help="Output format"),
    ] = OutputFormat.table,
) -> None:
    """List MCP servers from the catalog.

    Shows predefined MCP server configurations with their availability status.
    Availability depends on whether required environment variables are set.

    Examples:

        # List catalog MCP servers
        agent-runtimes mcp-servers-catalog

        # Output as JSON
        agent-runtimes mcp-servers-catalog --output json
    """
    list_mcp_servers_catalog(output=output)


# ============================================================================
# mcp-servers-config command
# ============================================================================


@app.command("mcp-servers-config")
def mcp_servers_config(
    output: Annotated[
        OutputFormat,
        typer.Option("--output", "-o", help="Output format"),
    ] = OutputFormat.table,
) -> None:
    """List MCP servers from the user's config file.

    Shows MCP servers configured in ~/.datalayer/mcp.json.

    Examples:

        # List config MCP servers
        agent-runtimes mcp-servers-config

        # Output as JSON
        agent-runtimes mcp-servers-config --output json
    """
    list_mcp_servers_config(output=output)


if __name__ == "__main__":
    app()
