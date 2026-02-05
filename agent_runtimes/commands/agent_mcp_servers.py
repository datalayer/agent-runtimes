# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Agent MCP servers commands for the Agent Runtimes CLI.

This module provides commands to start and stop MCP servers for running agents.

Usage as library:
    from agent_runtimes.commands.agent_mcp_servers import (
        start_agent_mcp_servers,
        stop_agent_mcp_servers,
        parse_env_vars,
    )

    # Start MCP servers for a specific agent
    result = start_agent_mcp_servers(
        agent_id="my-agent",
        env_vars={"TAVILY_API_KEY": "xxx"},
        host="127.0.0.1",
        port=8000,
    )

    # Start MCP servers for all agents (agent_id=None)
    result = start_agent_mcp_servers(
        agent_id=None,
        env_vars={"TAVILY_API_KEY": "xxx"},
        host="127.0.0.1",
        port=8000,
    )

    # Stop MCP servers
    result = stop_agent_mcp_servers(
        agent_id="my-agent",  # or None for all agents
        host="127.0.0.1",
        port=8000,
    )
"""

from typing import Any

import httpx
from rich import box
from rich.console import Console
from rich.panel import Panel
from rich.table import Table


class AgentMcpServersError(Exception):
    """Error during agent MCP server operations."""

    pass


def parse_env_vars(env_vars_str: str | None) -> dict[str, str]:
    """
    Parse environment variables from a semicolon-separated string.

    Args:
        env_vars_str: String in format "VAR1:VALUE1;VAR2:VALUE2"

    Returns:
        Dictionary of environment variable name-value pairs.

    Examples:
        >>> parse_env_vars("TAVILY_API_KEY:xxx;OTHER_KEY:yyy")
        {'TAVILY_API_KEY': 'xxx', 'OTHER_KEY': 'yyy'}
        >>> parse_env_vars(None)
        {}
    """
    if not env_vars_str:
        return {}

    env_vars: dict[str, str] = {}
    for pair in env_vars_str.split(";"):
        pair = pair.strip()
        if not pair:
            continue
        if ":" not in pair:
            raise ValueError(f"Invalid env var format: '{pair}'. Expected 'NAME:VALUE'")
        name, value = pair.split(":", 1)
        env_vars[name.strip()] = value.strip()

    return env_vars


def start_agent_mcp_servers(
    agent_id: str | None = None,
    env_vars: dict[str, str] | None = None,
    host: str = "127.0.0.1",
    port: int = 8000,
    timeout: float = 60.0,
) -> dict[str, Any]:
    """
    Start MCP servers for a running agent or all agents.

    Args:
        agent_id: The agent identifier. If None, operates on all agents.
        env_vars: Environment variables to set before starting servers.
        host: Server host.
        port: Server port.
        timeout: Request timeout in seconds.

    Returns:
        Response from the server with status of each server.

    Raises:
        AgentMcpServersError: If the request fails.
    """
    base_url = f"http://{host}:{port}"
    if agent_id:
        url = f"{base_url}/api/v1/agents/{agent_id}/mcp-servers/start"
    else:
        url = f"{base_url}/api/v1/agents/mcp-servers/start"

    # Build request body
    body = {
        "env_vars": [
            {"name": name, "value": value} for name, value in (env_vars or {}).items()
        ]
    }

    try:
        with httpx.Client(timeout=timeout) as client:
            response = client.post(url, json=body)
            response.raise_for_status()
            return response.json()
    except httpx.ConnectError as e:
        raise AgentMcpServersError(
            f"Cannot connect to agent-runtimes server at {base_url}. "
            f"Is the server running? Error: {e}"
        )
    except httpx.HTTPStatusError as e:
        error_detail = e.response.text
        try:
            error_json = e.response.json()
            error_detail = error_json.get("detail", error_detail)
        except Exception:
            pass
        raise AgentMcpServersError(
            f"Server returned error {e.response.status_code}: {error_detail}"
        )
    except Exception as e:
        raise AgentMcpServersError(f"Request failed: {e}")


def stop_agent_mcp_servers(
    agent_id: str | None = None,
    host: str = "127.0.0.1",
    port: int = 8000,
    timeout: float = 60.0,
) -> dict[str, Any]:
    """
    Stop MCP servers for a running agent or all agents.

    Args:
        agent_id: The agent identifier. If None, operates on all agents.
        host: Server host.
        port: Server port.
        timeout: Request timeout in seconds.

    Returns:
        Response from the server with status of each server.

    Raises:
        AgentMcpServersError: If the request fails.
    """
    base_url = f"http://{host}:{port}"
    if agent_id:
        url = f"{base_url}/api/v1/agents/{agent_id}/mcp-servers/stop"
    else:
        url = f"{base_url}/api/v1/agents/mcp-servers/stop"

    try:
        with httpx.Client(timeout=timeout) as client:
            response = client.post(url)
            response.raise_for_status()
            return response.json()
    except httpx.ConnectError as e:
        raise AgentMcpServersError(
            f"Cannot connect to agent-runtimes server at {base_url}. "
            f"Is the server running? Error: {e}"
        )
    except httpx.HTTPStatusError as e:
        error_detail = e.response.text
        try:
            error_json = e.response.json()
            error_detail = error_json.get("detail", error_detail)
        except Exception:
            pass
        raise AgentMcpServersError(
            f"Server returned error {e.response.status_code}: {error_detail}"
        )
    except Exception as e:
        raise AgentMcpServersError(f"Request failed: {e}")


def print_mcp_servers_result(result: dict[str, Any], operation: str = "start") -> None:
    """
    Print MCP server operation result in a formatted way.

    Args:
        result: Response from start/stop operation.
        operation: Either "start" or "stop".
    """
    console = Console()

    agent_id = result.get("agent_id")
    agents_processed = result.get("agents_processed", [])
    message = result.get("message", "")
    codemode_rebuilt = result.get("codemode_rebuilt", False)

    # Create summary panel
    if agent_id:
        title = f"MCP Servers {operation.title()} - Agent: {agent_id}"
    else:
        title = (
            f"MCP Servers {operation.title()} - All Agents ({len(agents_processed)})"
        )

    # Build status table
    table = Table(box=box.ROUNDED, show_header=True, header_style="bold")
    table.add_column("Server ID", style="cyan")
    table.add_column("Status", style="white")

    if operation == "start":
        for server_id in result.get("started_servers", []):
            table.add_row(server_id, "[green]✓ Started[/green]")
        for server_id in result.get("already_running", []):
            table.add_row(server_id, "[yellow]⚡ Already running[/yellow]")
    else:
        for server_id in result.get("stopped_servers", []):
            table.add_row(server_id, "[green]✓ Stopped[/green]")
        for server_id in result.get("already_stopped", []):
            table.add_row(server_id, "[yellow]⚡ Already stopped[/yellow]")

    for failed in result.get("failed_servers", []):
        server_id = failed.get("server_id", "unknown")
        error = failed.get("error", "Unknown error")
        table.add_row(server_id, f"[red]✗ Failed: {error}[/red]")

    # Print results
    console.print()
    console.print(Panel(table, title=title, border_style="blue"))

    if agents_processed and not agent_id:
        console.print(f"[dim]Agents processed: {', '.join(agents_processed)}[/dim]")

    if codemode_rebuilt:
        console.print("[green]✓ Codemode toolset rebuilt[/green]")

    console.print(f"\n[dim]{message}[/dim]")
