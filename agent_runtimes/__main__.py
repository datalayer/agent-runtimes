#!/usr/bin/env python
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
.

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

import asyncio
import logging
import os
from typing import Annotated, Optional

import typer
from datalayer_core.authn import AuthenticationManager

from agent_runtimes._version import __version__
from agent_runtimes.commands.agent_mcp_servers import (
    AgentMcpServersError,
    parse_env_vars,
    print_mcp_servers_result,
    start_agent_mcp_servers,
    stop_agent_mcp_servers,
)
from agent_runtimes.commands.agent_nodes import app as agent_nodes_app
from agent_runtimes.commands.agents import app as agents_app
from agent_runtimes.commands.benchmarks import app as benchmarks_app
from agent_runtimes.commands.checkpoints import app as checkpoints_app
from agent_runtimes.commands.console import app as console_app
from agent_runtimes.commands.envs import app as envs_app
from agent_runtimes.commands.evals import app as evals_app
from agent_runtimes.commands.events import app as events_app
from agent_runtimes.commands.events import events_list, events_ls
from agent_runtimes.commands.exec import main as exec_main
from agent_runtimes.commands.list_agents import (
    ListAgentsError,
    OutputFormat,
    list_agents_from_server,
)
from agent_runtimes.commands.list_specs import (
    OutputFormat as SpecsOutputFormat,
)
from agent_runtimes.commands.list_specs import (
    list_agentspecs,
)
from agent_runtimes.commands.mcp_servers_catalog import (
    OutputFormat as CatalogOutputFormat,
)
from agent_runtimes.commands.mcp_servers_catalog import (
    list_mcp_servers_catalog,
)
from agent_runtimes.commands.mcp_servers_config import (
    OutputFormat as ConfigOutputFormat,
)
from agent_runtimes.commands.mcp_servers_config import (
    list_mcp_servers_config,
)
from agent_runtimes.commands.pools import app as pools_app
from agent_runtimes.commands.ray import app as ray_app
from agent_runtimes.commands.memory import app as memory_app
from agent_runtimes.commands.sandbox_snapshots import app as snapshots_app
from agent_runtimes.commands.schedules import app as schedules_app
from agent_runtimes.commands.serve import (
    LogLevel,
    Protocol,
    ServeError,
    serve_server,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

app = typer.Typer(
    name="agent-runtimes",
    help="Agent Runtimes CLI - manage and query ai agents",
    add_completion=True,
    no_args_is_help=False,
    context_settings={
        "allow_extra_args": True,
        "ignore_unknown_options": True,
    },
)


def version_callback(value: bool) -> None:
    """Display version information and exit."""
    if value:
        typer.echo(f"agent_runtimes: {__version__}")
        raise typer.Exit()


def _lookup_billing_entity_uid_by_handle(
    *, iam_url: str, access_token: str, account_handle: str
) -> Optional[str]:
    """Resolve an account handle to UID using IAM APIs."""
    import requests

    handle = str(account_handle or "").strip().lower()
    if not handle:
        return None

    headers = {"Authorization": f"Bearer {access_token}"}

    whoami_response = requests.get(
        f"{iam_url.rstrip('/')}/api/iam/v1/whoami",
        headers=headers,
        timeout=10,
    )
    if whoami_response.status_code == 200:
        payload = whoami_response.json()
        profile = payload.get("profile") or {}
        profile_handle = str(profile.get("handle") or "").strip().lower()
        if profile_handle == handle:
            return str(profile.get("uid") or "").strip() or None

    memberships_response = requests.get(
        f"{iam_url.rstrip('/')}/api/iam/v1/memberships",
        headers=headers,
        timeout=10,
    )
    if memberships_response.status_code != 200:
        return None
    memberships_payload = memberships_response.json()
    memberships = memberships_payload.get("memberships") or []
    for membership in memberships:
        membership_handle = str(membership.get("handle") or "").strip().lower()
        if membership_handle == handle:
            return str(membership.get("uid") or "").strip() or None
    return None


@app.callback(
    invoke_without_command=True,
    context_settings={
        "allow_extra_args": True,
        "ignore_unknown_options": True,
    },
)
def main_callback(
    ctx: typer.Context,
    version: bool = typer.Option(
        False,
        "--version",
        callback=version_callback,
        is_eager=True,
        help="Show version and exit",
    ),
    iam_url: str | None = typer.Option(
        None,
        "--iam-url",
        help="Override DATALAYER_IAM_URL for this CLI invocation.",
    ),
    runtimes_url: str | None = typer.Option(
        None,
        "--runtimes-url",
        help="Override DATALAYER_RUNTIMES_URL for this CLI invocation.",
    ),
    spacer_url: str | None = typer.Option(
        None,
        "--spacer-url",
        "--space-url",
        help="Override DATALAYER_SPACER_URL for this CLI invocation.",
    ),
    library_url: str | None = typer.Option(
        None,
        "--library-url",
        help="Override DATALAYER_LIBRARY_URL for this CLI invocation.",
    ),
    manager_url: str | None = typer.Option(
        None,
        "--manager-url",
        help="Override DATALAYER_MANAGER_URL for this CLI invocation.",
    ),
    ai_agents_url: str | None = typer.Option(
        None,
        "--ai-agents-url",
        help="Override DATALAYER_AI_AGENTS_URL for this CLI invocation.",
    ),
    ai_inference_url: str | None = typer.Option(
        None,
        "--ai-inference-url",
        help="Override DATALAYER_AI_INFERENCE_URL for this CLI invocation.",
    ),
    growth_url: str | None = typer.Option(
        None,
        "--growth-url",
        help="Override DATALAYER_GROWTH_URL for this CLI invocation.",
    ),
    otel_url: str | None = typer.Option(
        None,
        "--otel-url",
        help="Override DATALAYER_OTEL_URL for this CLI invocation.",
    ),
    success_url: str | None = typer.Option(
        None,
        "--success-url",
        help="Override DATALAYER_SUCCESS_URL for this CLI invocation.",
    ),
    status_url: str | None = typer.Option(
        None,
        "--status-url",
        help="Override DATALAYER_STATUS_URL for this CLI invocation.",
    ),
    support_url: str | None = typer.Option(
        None,
        "--support-url",
        help="Override DATALAYER_SUPPORT_URL for this CLI invocation.",
    ),
    jupyter_mcp_server_url: str | None = typer.Option(
        None,
        "--jupyter-mcp-server-url",
        help="Override DATALAYER_JUPYTER_MCP_SERVER_URL for this CLI invocation.",
    ),
    scheduler_url: str | None = typer.Option(
        None,
        "--scheduler-url",
        help="Override DATALAYER_SCHEDULER_URL for this CLI invocation.",
    ),
    api_key: str | None = typer.Option(
        None,
        "--api-key",
        help=(
            "Auth token for backend calls. Falls back to DATALAYER_API_KEY when "
            "omitted; otherwise built-in auth resolution is used."
        ),
    ),
    billing_entity_uid: str | None = typer.Option(
        None,
        "--billing-entity-uid",
        help=(
            "Billing Entity UID context. Falls back to DATALAYER_ACCOUNT_UID "
            "when omitted."
        ),
    ),
    billing_entity_handle: str | None = typer.Option(
        None,
        "--billing-entity-handle",
        help=(
            "Billing Entity handle context. Falls back to DATALAYER_ACCOUNT_HANDLE "
            "when omitted and is resolved to UID via IAM lookup."
        ),
    ),
    eggs: bool = typer.Option(
        False,
        "--eggs",
        help="Enable Easter egg commands in default chat mode.",
    ),
    agentspec_id: str | None = typer.Option(
        None,
        "--agentspec-id",
        "-a",
        help="Agent spec ID to use when defaulting to chat mode.",
    ),
    port: int | None = typer.Option(
        None,
        "--port",
        "-p",
        help="Port for chat runtime server when defaulting to chat mode.",
    ),
    banner: bool = typer.Option(
        False,
        "--banner",
        "-b",
        help="Show chat banner when defaulting to chat mode.",
    ),
    banner_all: bool = typer.Option(
        False,
        "--banner-all",
        "-B",
        help="Show full chat banner animations when defaulting to chat mode.",
    ),
    debug: bool = typer.Option(
        False,
        "--debug",
        "-d",
        help="Enable chat debug mode when defaulting to chat mode.",
    ),
    codemode_disabled: bool = typer.Option(
        False,
        "--codemode-disabled",
        "--no-codemode",
        help="Disable codemode when defaulting to chat mode.",
    ),
    suggestions: str | None = typer.Option(
        None,
        "--suggestions",
        "-s",
        help="Extra suggestions (comma-separated) when defaulting to chat mode.",
    ),
) -> None:
    """Main callback to handle global options."""
    overrides = {
        "DATALAYER_IAM_URL": iam_url,
        "DATALAYER_RUNTIMES_URL": runtimes_url,
        "DATALAYER_SPACER_URL": spacer_url,
        "DATALAYER_LIBRARY_URL": library_url,
        "DATALAYER_MANAGER_URL": manager_url,
        "DATALAYER_AI_AGENTS_URL": ai_agents_url,
        "DATALAYER_AI_INFERENCE_URL": ai_inference_url,
        "DATALAYER_GROWTH_URL": growth_url,
        "DATALAYER_OTEL_URL": otel_url,
        "DATALAYER_SUCCESS_URL": success_url,
        "DATALAYER_STATUS_URL": status_url,
        "DATALAYER_SUPPORT_URL": support_url,
        "DATALAYER_JUPYTER_MCP_SERVER_URL": jupyter_mcp_server_url,
        "DATALAYER_SCHEDULER_URL": scheduler_url,
    }
    for env_name, value in overrides.items():
        if value is not None:
            os.environ[env_name] = value.rstrip("/")

    if api_key is not None:
        normalized_api_key = str(api_key).strip()
        if normalized_api_key:
            os.environ["DATALAYER_API_KEY"] = normalized_api_key

    resolved_uid = (
        str(billing_entity_uid or "").strip()
        or str(os.environ.get("DATALAYER_ACCOUNT_UID") or "").strip()
    )
    resolved_handle = (
        str(billing_entity_handle or "").strip()
        or str(os.environ.get("DATALAYER_ACCOUNT_HANDLE") or "").strip()
    )

    if not resolved_uid and resolved_handle:
        effective_iam_url = str(os.environ.get("DATALAYER_IAM_URL") or "").strip()
        if not effective_iam_url:
            effective_iam_url = "http://localhost:9700"

        resolved_token = str(os.environ.get("DATALAYER_API_KEY") or "").strip()
        if not resolved_token:
            auth = AuthenticationManager(iam_url=effective_iam_url)
            resolved_token = str(auth.get_stored_token() or "").strip()

        if not resolved_token:
            raise typer.BadParameter(
                "Cannot resolve --billing-entity-handle without authentication. "
                "Pass --api-key, set DATALAYER_API_KEY, or login first."
            )

        resolved_from_handle = _lookup_billing_entity_uid_by_handle(
            iam_url=effective_iam_url,
            access_token=resolved_token,
            account_handle=resolved_handle,
        )
        if not resolved_from_handle:
            raise typer.BadParameter(
                f"Could not resolve billing entity handle '{resolved_handle}' to a UID."
            )
        resolved_uid = resolved_from_handle

    if resolved_uid:
        os.environ["DATALAYER_ACCOUNT_UID"] = resolved_uid
        os.environ["DATALAYER_BILLING_ENTITY_UID"] = resolved_uid
    if resolved_handle:
        os.environ["DATALAYER_ACCOUNT_HANDLE"] = resolved_handle

    # When no subcommand is given, default to the interactive `chat` command
    # so that running `loop` behaves like running `loop chat`.
    if ctx.invoked_subcommand is None:
        from agent_runtimes.chat.cli import app as chat_app

        chat_args: list[str] = []
        if eggs:
            chat_args.append("--eggs")
        if agentspec_id:
            chat_args.extend(["--agentspec-id", agentspec_id])
        if port is not None:
            chat_args.extend(["--port", str(port)])
        if banner:
            chat_args.append("--banner")
        if banner_all:
            chat_args.append("--banner-all")
        if debug:
            chat_args.append("--debug")
        if codemode_disabled:
            chat_args.append("--no-codemode")
        if suggestions:
            chat_args.extend(["--suggestions", suggestions])
        # Forward any additional CLI args to chat so `loop --<chat-option>`
        # behaves like `loop chat --<chat-option>`.
        chat_args.extend(ctx.args)
        chat_app(args=chat_args)


# Register the interactive assistant CLI under `agent-runtimes chat`.
# Keep this import lazy and guarded so server/node startup does not depend on
# chat-specific model provider configuration (for example Bedrock env vars).
try:
    from agent_runtimes.chat.cli import app as interactive_cli_app

    app.add_typer(
        interactive_cli_app,
        name="chat",
        help="Interactive assistant CLI for agent runtimes",
    )
except Exception as exc:  # noqa: BLE001
    logger.warning("Chat CLI disabled at startup: %s", exc)

# Register events command group and root aliases.
app.add_typer(events_app)
app.add_typer(agents_app)
app.add_typer(agent_nodes_app)
app.add_typer(benchmarks_app)
app.add_typer(checkpoints_app)
app.add_typer(console_app)
app.add_typer(memory_app)
app.add_typer(envs_app)
app.add_typer(evals_app)
app.add_typer(pools_app)
app.add_typer(snapshots_app)
app.add_typer(ray_app)
app.add_typer(schedules_app)
app.command("events-list")(events_list)
app.command("event-ls")(events_ls)
app.command("events-ls")(events_ls)
app.command("exec")(exec_main)


@app.command()
def about() -> None:
    """Show the about animation."""
    from rich.console import Console

    from agent_runtimes.chat.animations.about import about_animation

    try:
        asyncio.run(about_animation(Console()))
    except KeyboardInterrupt:
        # Allow clean interruption while the animation is running.
        pass


# ============================================================================
# serve command
# ============================================================================


@app.command()
def serve(
    host: Annotated[
        str,
        typer.Option(
            "--host", "-h", envvar="AGENT_RUNTIMES_HOST", help="Host to bind to"
        ),
    ] = "127.0.0.1",
    port: Annotated[
        int,
        typer.Option(
            "--port", "-p", envvar="AGENT_RUNTIMES_PORT", help="Port to bind to"
        ),
    ] = 8000,
    reload: Annotated[
        bool,
        typer.Option(
            "--reload",
            "-r",
            envvar="AGENT_RUNTIMES_RELOAD",
            help="Enable auto-reload for development",
        ),
    ] = False,
    debug: Annotated[
        bool,
        typer.Option(
            "--debug",
            "-d",
            envvar="AGENT_RUNTIMES_DEBUG",
            help="Enable debug mode with verbose logging",
        ),
    ] = False,
    workers: Annotated[
        int,
        typer.Option(
            "--workers",
            "-w",
            envvar="AGENT_RUNTIMES_WORKERS",
            help="Number of worker processes",
        ),
    ] = 1,
    log_level: Annotated[
        LogLevel,
        typer.Option(
            "--log-level", "-l", envvar="AGENT_RUNTIMES_LOG_LEVEL", help="Log level"
        ),
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
    no_catalog_mcp_servers: Annotated[
        bool,
        typer.Option(
            "--no-catalog-mcp-servers",
            envvar="AGENT_RUNTIMES_NO_CATALOG_MCP_SERVERS",
            help="Skip starting catalog MCP servers defined in the agent spec (requires --agent-id)",
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
    jupyter_sandbox: Annotated[
        Optional[str],
        typer.Option(
            "--jupyter-sandbox",
            "-j",
            envvar="AGENT_RUNTIMES_JUPYTER_SANDBOX",
            help="Jupyter sandbox URL with token (e.g., http://localhost:8888?token=xxx). "
            "If provided, uses a Jupyter kernel for code execution instead of local eval.",
        ),
    ] = None,
    generated_code_folder: Annotated[
        Optional[str],
        typer.Option(
            "--generated-code-folder",
            envvar="AGENT_RUNTIMES_GENERATED_CODE_FOLDER",
            help="Folder for generated code bindings. When using a shared volume with Jupyter, "
            "set this to a path accessible by both containers.",
        ),
    ] = None,
    skills_folder: Annotated[
        Optional[str],
        typer.Option(
            "--skills-folder",
            envvar="AGENT_RUNTIMES_SKILLS_FOLDER",
            help="Folder for agent skills. When using a shared volume with Jupyter, "
            "set this to a path accessible by both containers.",
        ),
    ] = None,
    sandbox_variant: Annotated[
        Optional[str],
        typer.Option(
            "--sandbox-variant",
            envvar="AGENT_RUNTIMES_SANDBOX_VARIANT",
            help="Sandbox variant: 'eval' (default in-process exec), "
            "or 'jupyter' (connects to existing Jupyter server, requires --jupyter-sandbox).",
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
    node: Annotated[
        bool,
        typer.Option(
            "--node",
            envvar="AGENT_RUNTIMES_NODE",
            help="Run in Agent Node mode (enables Agent Node routes, sync and tunnel loops)",
        ),
    ] = False,
    disable_tool_approvals: Annotated[
        bool,
        typer.Option(
            "--disable-tool-approvals",
            envvar="AGENT_RUNTIMES_DISABLE_TOOL_APPROVALS",
            help="Disable tool approval flows for all agents started by this server",
        ),
    ] = False,
) -> None:
    """
    Start the agent-runtimes server.

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

        # Start with an agent but without its catalog MCP servers
        agent-runtimes serve --agent-id data-acquisition --no-catalog-mcp-servers

        # Start with specific MCP servers from the catalog
        agent-runtimes serve --mcp-servers tavily,github

        # Start with Code Mode (MCP servers become programmatic tools)
        agent-runtimes serve --codemode --mcp-servers tavily,github

        # Start with Code Mode and skills
        agent-runtimes serve --codemode --mcp-servers tavily --skills web_search,github_lookup

        # Start with a Jupyter sandbox for code execution (connects to existing Jupyter server)
        agent-runtimes serve --codemode --jupyter-sandbox "http://localhost:8888?token=my-token"

        # Start with a per-agent Jupyter sandbox (code_sandboxes starts its own server)
        agent-runtimes serve --codemode --sandbox-variant jupyter

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
            no_catalog_mcp_servers=no_catalog_mcp_servers,
            mcp_servers=mcp_servers,
            codemode=codemode,
            skills=skills,
            jupyter_sandbox=jupyter_sandbox,
            generated_code_folder=generated_code_folder,
            skills_folder=skills_folder,
            sandbox_variant=sandbox_variant,
            protocol=protocol,
            find_free_port_flag=find_free_port,
            node=node,
            disable_tool_approvals=disable_tool_approvals,
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
        typer.Option(
            "--host", "-h", envvar="AGENT_RUNTIMES_HOST", help="Server host to query"
        ),
    ] = "127.0.0.1",
    port: Annotated[
        int,
        typer.Option(
            "--port", "-p", envvar="AGENT_RUNTIMES_PORT", help="Server port to query"
        ),
    ] = 8000,
    output: Annotated[
        OutputFormat,
        typer.Option("--output", "-o", help="Output format"),
    ] = OutputFormat.table,
) -> None:
    """
    List running agents on a server.

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
        SpecsOutputFormat,
        typer.Option("--output", "-o", help="Output format"),
    ] = SpecsOutputFormat.table,
) -> None:
    """
    List available agent specs from the library.

    Shows predefined agent templates that can be used when starting the server
    with --agent-id.

    Examples:

        # List available agent specs
        agent-runtimes list-specs

        # Output as JSON
        agent-runtimes list-specs --output json
    """
    list_agentspecs(output=output)


# ============================================================================
# mcp-servers-catalog command
# ============================================================================


@app.command("mcp-servers-catalog")
def mcp_servers_catalog(
    output: Annotated[
        CatalogOutputFormat,
        typer.Option("--output", "-o", help="Output format"),
    ] = CatalogOutputFormat.table,
) -> None:
    """
    List MCP servers from the catalog.

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
        ConfigOutputFormat,
        typer.Option("--output", "-o", help="Output format"),
    ] = ConfigOutputFormat.table,
) -> None:
    """
    List MCP servers from the user's config file.

    Shows MCP servers configured in ~/.datalayer/mcp.json.

    Examples:

        # List config MCP servers
        agent-runtimes mcp-servers-config

        # Output as JSON
        agent-runtimes mcp-servers-config --output json
    """
    list_mcp_servers_config(output=output)


# ============================================================================
# start-mcp-servers command
# ============================================================================


@app.command("start-mcp-servers")
def start_mcp_servers_cmd(
    agent_id: Annotated[
        Optional[str],
        typer.Option(
            "--agent-id",
            "-a",
            help="The agent identifier (if not provided, operates on all agents)",
        ),
    ] = None,
    env_vars: Annotated[
        Optional[str],
        typer.Option(
            "--env-vars",
            "-e",
            help="Environment variables in format VAR1:VALUE1;VAR2:VALUE2",
        ),
    ] = None,
    host: Annotated[
        str,
        typer.Option("--host", "-h", help="Agent-runtimes server host"),
    ] = "127.0.0.1",
    port: Annotated[
        int,
        typer.Option("--port", "-p", help="Agent-runtimes server port"),
    ] = 8000,
) -> None:
    """
    Start MCP servers for running agent(s).

    Starts the catalog MCP servers configured for the specified agent,
    or for all agents if no agent-id is provided.

    Environment variables can be provided to configure the servers
    (e.g., API keys).

    If an agent has Codemode enabled, the toolset will be rebuilt
    to include the newly started servers as programmatic tools.

    Examples:

        # Start MCP servers for all agents
        agent-runtimes start-mcp-servers

        # Start MCP servers for a specific agent
        agent-runtimes start-mcp-servers --agent-id my-agent

        # Start with environment variables
        agent-runtimes start-mcp-servers --agent-id my-agent \\
            --env-vars "TAVILY_API_KEY:xxx;OTHER_KEY:yyy"

        # Start for all agents with environment variables
        agent-runtimes start-mcp-servers \\
            --env-vars "TAVILY_API_KEY:xxx"

        # Connect to a different server
        agent-runtimes start-mcp-servers --agent-id my-agent \\
            --host 0.0.0.0 --port 8080
    """
    try:
        parsed_env_vars = parse_env_vars(env_vars)
        result = start_agent_mcp_servers(
            agent_id=agent_id,
            env_vars=parsed_env_vars,
            host=host,
            port=port,
        )
        print_mcp_servers_result(result, operation="start")
    except AgentMcpServersError as e:
        typer.echo(f"Error: {e}", err=True)
        raise typer.Exit(code=1)
    except ValueError as e:
        typer.echo(f"Invalid input: {e}", err=True)
        raise typer.Exit(code=1)


# ============================================================================
# stop-mcp-servers command
# ============================================================================


@app.command("stop-mcp-servers")
def stop_mcp_servers_cmd(
    agent_id: Annotated[
        Optional[str],
        typer.Option(
            "--agent-id",
            "-a",
            help="The agent identifier (if not provided, operates on all agents)",
        ),
    ] = None,
    host: Annotated[
        str,
        typer.Option("--host", "-h", help="Agent-runtimes server host"),
    ] = "127.0.0.1",
    port: Annotated[
        int,
        typer.Option("--port", "-p", help="Agent-runtimes server port"),
    ] = 8000,
) -> None:
    """
    Stop MCP servers for running agent(s).

    Stops the catalog MCP servers configured for the specified agent,
    or for all agents if no agent-id is provided.

    Examples:

        # Stop MCP servers for all agents
        agent-runtimes stop-mcp-servers

        # Stop MCP servers for a specific agent
        agent-runtimes stop-mcp-servers --agent-id my-agent

        # Connect to a different server
        agent-runtimes stop-mcp-servers --agent-id my-agent \\
            --host 0.0.0.0 --port 8080
    """
    try:
        result = stop_agent_mcp_servers(
            agent_id=agent_id,
            host=host,
            port=port,
        )
        print_mcp_servers_result(result, operation="stop")
    except AgentMcpServersError as e:
        typer.echo(f"Error: {e}", err=True)
        raise typer.Exit(code=1)


if __name__ == "__main__":
    app()
