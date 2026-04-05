# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""Agent Runtimes interactive CLI assistant using AG-UI and ACP."""

import asyncio
import atexit
import itertools
import multiprocessing
import os
import signal
import sys
import threading
import time
from enum import Enum
from typing import TYPE_CHECKING, Any, List, Optional

import typer
from pydantic_ai import Agent

if TYPE_CHECKING:
    from agent_runtimes.commands.serve import Protocol


DEFAULT_RUNTIME_AGENT_NAME = "chat"


# Global reference to subprocess for cleanup
_subprocess_ref: Optional[multiprocessing.Process] = None


def _cleanup_subprocess() -> None:
    """Clean up subprocess on exit."""
    global _subprocess_ref
    if _subprocess_ref is not None:
        try:
            if _subprocess_ref.is_alive():
                _subprocess_ref.terminate()
                _subprocess_ref.join(timeout=2.0)
                if _subprocess_ref.is_alive():
                    _subprocess_ref.kill()
                    _subprocess_ref.join(timeout=1.0)
        except Exception:
            pass
        _subprocess_ref = None


def _signal_handler(signum: int, frame: Any) -> None:
    """Handle signals by cleaning up subprocess and exiting."""
    _cleanup_subprocess()
    # Re-raise with default handler for proper exit
    signal.signal(signum, signal.SIG_DFL)
    os.kill(os.getpid(), signum)


# Register cleanup handlers
atexit.register(_cleanup_subprocess)
signal.signal(signal.SIGINT, _signal_handler)
signal.signal(signal.SIGTERM, _signal_handler)
# SIGTSTP (Ctrl+Z) - we need to handle specially
try:
    signal.signal(signal.SIGTSTP, _signal_handler)
except (AttributeError, OSError):
    pass  # SIGTSTP not available on Windows


class Transport(str, Enum):
    """Transport protocol options for connecting to agent-runtimes."""

    ag_ui = "ag-ui"
    acp = "acp"


from .banner import (
    BANNER,
    # Legacy colors
    BLUE,
    BOLD,
    CYAN,
    DIM,
    GOODBYE_MESSAGE,
    GRAY,
    GREEN,
    # Datalayer brand colors
    GREEN_DARK,
    GREEN_LIGHT,
    GREEN_MEDIUM,
    MAGENTA,
    RED,
    RESET,
    WHITE,
    YELLOW,
    show_banner,
)

# Spinner frames - various styles
SPINNER_DOTS = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
SPINNER_CIRCLE = ["◐", "◓", "◑", "◒"]
SPINNER_BOUNCE = ["⠁", "⠂", "⠄", "⡀", "⢀", "⠠", "⠐", "⠈"]
SPINNER_PULSE = ["●", "◉", "○", "◉"]
SPINNER_GROWING_CIRCLE = ["○", "◔", "◑", "◕", "●", "◕", "◑", "◔"]


class Spinner:
    """Animated loading spinner for terminal output."""

    def __init__(self, message: str = "Thinking", style: str = "circle"):
        self.message = message
        self.spinner_active = False
        self.spinner_thread: threading.Thread | None = None

        # Select spinner style
        if style == "dots":
            self.frames = SPINNER_DOTS
        elif style == "circle":
            self.frames = SPINNER_CIRCLE
        elif style == "bounce":
            self.frames = SPINNER_BOUNCE
        elif style == "pulse":
            self.frames = SPINNER_PULSE
        elif style == "growing":
            self.frames = SPINNER_GROWING_CIRCLE
        else:
            self.frames = SPINNER_CIRCLE

    def _spin(self) -> None:
        """The spinning animation loop."""
        for frame in itertools.cycle(self.frames):
            if not self.spinner_active:
                break
            # Use green color for the spinner
            sys.stdout.write(
                f"\r{GREEN_MEDIUM}{frame}{RESET} {GRAY}{self.message}...{RESET}"
            )
            sys.stdout.flush()
            time.sleep(0.1)

        # Clear the spinner line
        sys.stdout.write("\r" + " " * (len(self.message) + 20) + "\r")
        sys.stdout.flush()

    def start(self) -> None:
        """Start the spinner animation."""
        if not sys.stdout.isatty():
            return

        self.spinner_active = True
        self.spinner_thread = threading.Thread(target=self._spin, daemon=True)
        self.spinner_thread.start()

    def stop(self) -> None:
        """Stop the spinner animation."""
        self.spinner_active = False
        if self.spinner_thread:
            self.spinner_thread.join()

    def __enter__(self) -> "Spinner":
        """Context manager entry."""
        self.start()
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Context manager exit."""
        self.stop()


from agent_runtimes.specs.models import DEFAULT_MODEL

# Define the embedded assistant agent used when no remote runtime is selected.
agent = Agent(
    DEFAULT_MODEL.value,
    instructions="""You are the Agent Runtimes Chat assistant, a helpful AI specialized in code analysis,
    Jupyter notebooks, and data science workflows. You help users with:
    - Writing and debugging code
    - Analyzing Jupyter notebooks
    - Data science and machine learning tasks
    - Software development best practices
    - Python programming and related tools

    Always provide clear, concise, and actionable responses.""",
    name="Agent Runtimes Chat Assistant",
)


async def run_query_with_spinner(query: str) -> str:
    """Run a query with a loading spinner animation."""
    spinner = Spinner("Thinking", style="growing")

    try:
        spinner.start()
        result = await agent.run(query)
        spinner.stop()
        return result.output
    except Exception as e:
        spinner.stop()
        raise e


# Create Typer app
app = typer.Typer(
    name="chat",
    help="Agent Runtimes Chat assistant",
    add_completion=False,
    no_args_is_help=False,
    invoke_without_command=True,
)


def _show_version() -> None:
    """Display version information."""
    from . import __version__

    typer.echo(f"{GREEN_LIGHT}Agent Runtimes Chat{RESET} v{__version__.__version__}")
    typer.echo(
        f"{GRAY}Powered by Datalayer • \033]8;;https://datalayer.ai\033\\https://datalayer.ai\033]8;;\033\\{RESET}"
    )


def _run_agent_runtime_server(
    host: str,
    port: int,
    agent_id: str,
    codemode: bool,
    protocol: "Protocol",
    port_value: Any = None,
) -> None:
    """Run the agent-runtimes server (for multiprocessing).

    This must be a module-level function (not nested) to be picklable.

    Args:
        host: Host to bind to
        port: Requested port (0 = auto-select a random free port)
        agent_id: Agent spec ID
        codemode: Enable codemode
        protocol: Server protocol (vercel-ai, ag-ui, etc.)
        port_value: Optional multiprocessing.Value('i') to communicate the
            effective port back to the parent process.
    """
    import logging
    import os
    import sys

    from agent_runtimes.commands import (
        LogLevel,
        Protocol,
        find_random_free_port,
        serve_server,
    )
    from agent_runtimes.specs.agents import get_agent_spec

    # Only suppress logging if not in debug mode
    debug_mode = (
        os.environ.get("AG_CHAT_DEBUG") == "1" or os.environ.get("CODEAI_DEBUG") == "1"
    )

    if not debug_mode:
        # Redirect stdout and stderr to devnull to keep terminal clean
        devnull = open(os.devnull, "w")
        sys.stdout = devnull
        sys.stderr = devnull

        # Suppress all logging
        logging.getLogger().setLevel(logging.CRITICAL)
        logging.getLogger("uvicorn").setLevel(logging.CRITICAL)
        logging.getLogger("uvicorn.access").setLevel(logging.CRITICAL)
        logging.getLogger("uvicorn.error").setLevel(logging.CRITICAL)
        logging.getLogger("rich").setLevel(logging.CRITICAL)

        # Disable Rich console output
        os.environ["TERM"] = "dumb"
        os.environ["NO_COLOR"] = "1"
    else:
        # Enable debug logging
        logging.basicConfig(level=logging.DEBUG)
        print(f"[DEBUG] Starting agent runtime server in debug mode")

    # Resolve port in this process so we can communicate it back
    actual_port = port
    if port == 0:
        actual_port = find_random_free_port(host)

    # Write effective port to shared value so the parent process can read it
    if port_value is not None:
        port_value.value = actual_port

    # Load agent spec to get MCP servers and sandbox variant
    mcp_servers_str = "tavily"  # Default fallback
    sandbox_variant = "jupyter"  # Default interactive CLI sandbox variant
    agent_spec = get_agent_spec(agent_id)
    if agent_spec:
        if agent_spec.mcp_servers:
            mcp_servers_str = ",".join([server.id for server in agent_spec.mcp_servers])
        if agent_spec.sandbox_variant:
            sandbox_variant = agent_spec.sandbox_variant

    serve_server(
        host=host,
        port=actual_port,
        log_level=LogLevel.debug if debug_mode else LogLevel.critical,
        agent_id=agent_id,
        agent_name=DEFAULT_RUNTIME_AGENT_NAME,
        no_config_mcp_servers=True,  # Disable config MCP servers
        mcp_servers=mcp_servers_str,  # Use MCP servers from agent spec
        codemode=codemode,  # Enable/disable codemode based on flag
        sandbox_variant=sandbox_variant if codemode else None,
        protocol=protocol,
    )


def _start_agent_runtime_server(
    agent_id: str,
    host: str = "127.0.0.1",
    port: int = 0,
    transport: Transport = Transport.ag_ui,
    codemode: bool = True,
    debug: bool = False,
) -> tuple[multiprocessing.Process, int]:
    """Start agent-runtimes server in a background process.

    Args:
        agent_id: Agent spec ID to start
        host: Host to bind to
        port: Port to bind to (0 = auto-select a random free port)
        transport: Transport protocol to use (ag-ui or acp)
        codemode: Enable codemode (default True)
        debug: Enable debug logging (default False)

    Returns:
        Tuple of (process, actual_port)
    """
    from agent_runtimes.commands import Protocol

    # Map transport to protocol
    protocol = (
        Protocol.ag_ui if transport == Transport.ag_ui else Protocol.ag_ui
    )  # ACP uses same server

    # Set debug environment variable if needed
    if debug:
        import os

        os.environ["AG_CHAT_DEBUG"] = "1"

    # Shared value so the child process can report the effective port
    port_value = multiprocessing.Value("i", 0)

    process = multiprocessing.Process(
        target=_run_agent_runtime_server,
        args=(host, port, agent_id, codemode, protocol, port_value),
        daemon=True,
    )
    process.start()

    # Wait for the child to resolve the port (happens before uvicorn.run)
    timeout = 10.0
    start = time.time()
    while port_value.value == 0 and time.time() - start < timeout:
        if not process.is_alive():
            break
        time.sleep(0.05)

    actual_port = port_value.value
    if actual_port == 0:
        raise RuntimeError("Agent runtime failed to resolve a port")

    return process, actual_port


def _wait_for_server(host: str, port: int, timeout: float = 30.0) -> bool:
    """Wait for the server to become available.

    Args:
        host: Server host
        port: Server port
        timeout: Maximum time to wait in seconds

    Returns:
        True if server is ready, False if timeout
    """
    import httpx

    url = f"http://{host}:{port}/health"
    start_time = time.time()

    while time.time() - start_time < timeout:
        try:
            response = httpx.get(url, timeout=1.0)
            if response.status_code == 200:
                return True
        except (httpx.ConnectError, httpx.TimeoutException):
            pass
        time.sleep(0.2)

    return False


def _fetch_startup_info(host: str, port: int) -> dict | None:
    """Fetch startup info from the running agent-runtimes server.

    Args:
        host: Server host
        port: Server port

    Returns:
        The startup info dict, or None on failure.
    """
    import httpx

    url = f"http://{host}:{port}/health/startup"
    try:
        response = httpx.get(url, timeout=3.0)
        if response.status_code == 200:
            return response.json()
    except Exception:
        pass
    return None


def _format_startup_info(host: str, port: int, info: dict | None) -> str:
    """Format startup info for CLI display.

    Args:
        host: Runtime server host
        port: Runtime server port
        info: The startup info dict from /health/startup

    Returns:
        Formatted string ready for terminal output.
    """
    lines: list[str] = []

    lines.append(f"  {GREEN_MEDIUM}Runtime{RESET}  http://{host}:{port}")

    if info:
        agent_info = info.get("agent", {})
        sandbox_info = info.get("sandbox", {})

        if agent_info.get("protocol"):
            lines.append(f"  {GREEN_MEDIUM}Protocol{RESET} {agent_info['protocol']}")
        if agent_info.get("model"):
            lines.append(f"  {GREEN_MEDIUM}Model{RESET}    {agent_info['model']}")
        if agent_info.get("codemode"):
            lines.append(f"  {GREEN_MEDIUM}Codemode{RESET} enabled")

        variant = sandbox_info.get("variant")
        if variant:
            sandbox_line = f"  {GREEN_MEDIUM}Sandbox{RESET}  {variant}"
            jupyter_url = sandbox_info.get("jupyter_url")
            if jupyter_url:
                sandbox_line += f"  {GRAY}({jupyter_url}){RESET}"
            else:
                jupyter_host = sandbox_info.get("jupyter_host")
                jupyter_port = sandbox_info.get("jupyter_port")
                if jupyter_host and jupyter_port:
                    sandbox_line += f"  {GRAY}({jupyter_host}:{jupyter_port}){RESET}"
            lines.append(sandbox_line)

        skills = agent_info.get("skills", [])
        if skills:
            lines.append(f"  {GREEN_MEDIUM}Skills{RESET}   {', '.join(skills)}")

        mcp_servers = agent_info.get("mcp_servers", [])
        if mcp_servers:
            lines.append(f"  {GREEN_MEDIUM}MCP{RESET}      {', '.join(mcp_servers)}")

    return "\n".join(lines)


def _spec_has_valid_env(spec: Any) -> bool:
    """Return True when a spec is enabled and all its required env vars are set."""
    if not spec.enabled:
        return False
    for mcp in spec.mcp_servers:
        for var in mcp.required_env_vars:
            if not os.environ.get(var):
                return False
    return True


def _pick_agentspec_interactive() -> str:
    """Show available agent specs and let the user pick one interactively.

    Specs are split into two groups:
      ● Valid   – enabled with all required env vars present (selectable)
      ○ Invalid – disabled or missing env vars (shown for reference, not selectable)

    The first valid spec is proposed as the default (press Enter to select it).

    Returns:
        The chosen agent spec ID.
    """
    from agent_runtimes.specs.agents import list_agent_specs

    specs = list_agent_specs()
    if not specs:
        print(f"{GREEN_DARK}[ERROR]{RESET} No agent specs found", file=sys.stderr)
        raise typer.Exit(1)

    # Partition into valid (enabled + all env vars) and the rest, each sorted by id
    valid_specs = sorted(
        [s for s in specs if _spec_has_valid_env(s)], key=lambda s: s.id
    )
    other_specs = sorted(
        [s for s in specs if not _spec_has_valid_env(s)], key=lambda s: s.id
    )
    ordered = valid_specs + other_specs
    valid_count = len(valid_specs)

    # Default is the first valid spec (index 0) when available
    default_idx: Optional[int] = 0 if valid_count > 0 else None

    print(f"\n{GREEN_LIGHT}Available Agent Specs:{RESET}\n")
    for i, spec in enumerate(ordered, 1):
        is_valid = i <= valid_count
        bullet = f" {GREEN_MEDIUM}●{RESET}" if is_valid else f" {GRAY}○{RESET}"
        default_marker = (
            f" {GREEN_LIGHT}(default){RESET}" if (i - 1) == default_idx else ""
        )
        num_color = GREEN_MEDIUM if is_valid else GRAY
        print(
            f"  {num_color}{i:>3}.{RESET}{bullet} {WHITE}{spec.id}{RESET}{default_marker}"
        )
        if spec.description:
            desc_line = spec.description.strip().split("\n")[0]
            if len(desc_line) > 70:
                desc_line = desc_line[:67] + "..."
            print(f"       {GRAY}{desc_line}{RESET}")
        # Show required env vars with availability status
        env_vars: set[str] = set()
        for mcp in spec.mcp_servers:
            env_vars.update(mcp.required_env_vars)
        if env_vars:
            env_parts: list[str] = []
            for var in sorted(env_vars):
                if os.environ.get(var):
                    env_parts.append(f"{GREEN_LIGHT}{var}{RESET}")
                else:
                    env_parts.append(f"{RED}{var}{RESET}")
            print(f"       {' '.join(env_parts)}")

    if valid_count == 0:
        print(f"\n{RED}No valid agent specs available.{RESET}")
        print(
            f"{GRAY}Enable a spec and/or set the required environment variables.{RESET}"
        )
        raise typer.Exit(1)

    default_display = f" [{default_idx + 1}]" if default_idx is not None else ""
    print()
    while True:
        try:
            choice = input(
                f"{GREEN_MEDIUM}Choose an agent spec [1-{valid_count}]{default_display}: {RESET}"
            ).strip()
            if not choice:
                if default_idx is not None:
                    chosen = ordered[default_idx]
                    print(f"\n{GREEN_LIGHT}Selected:{RESET} {chosen.id}\n")
                    return chosen.id
                continue
            idx = int(choice) - 1
            if 0 <= idx < valid_count:
                chosen = ordered[idx]
                print(f"\n{GREEN_LIGHT}Selected:{RESET} {chosen.id}\n")
                return chosen.id
            elif 0 <= idx < len(ordered):
                print(
                    f"{GRAY}Agent spec #{choice} is not available (disabled or missing env vars).{RESET}"
                )
                print(
                    f"{GRAY}Please enter a number between 1 and {valid_count}.{RESET}"
                )
            else:
                print(
                    f"{GRAY}Please enter a number between 1 and {valid_count}.{RESET}"
                )
        except ValueError:
            # Allow typing the spec ID directly (only valid ones)
            matching = [s for s in valid_specs if s.id == choice]
            if matching:
                print(f"\n{GREEN_LIGHT}Selected:{RESET} {matching[0].id}\n")
                return matching[0].id
            # Check if it matches an invalid spec for a helpful message
            invalid_match = [s for s in other_specs if s.id == choice]
            if invalid_match:
                print(
                    f"{GRAY}Agent spec '{choice}' is not available (disabled or missing env vars).{RESET}"
                )
            else:
                print(
                    f"{GRAY}Invalid input. Enter a number or a valid agent spec ID.{RESET}"
                )
        except (KeyboardInterrupt, EOFError):
            print()
            raise typer.Exit(0)


@app.callback(invoke_without_command=True)
def main_callback(
    ctx: typer.Context,
    query: Optional[List[str]] = typer.Argument(
        None,
        help="Query to send to the AI agent. If not provided, starts interactive mode.",
    ),
    agentspec_id: Optional[str] = typer.Option(
        None,
        "--agentspec-id",
        "-a",
        help="Agent spec ID to start from the agent-runtimes library",
    ),
    port: int = typer.Option(
        0,
        "--port",
        "-p",
        help="Port for the agent-runtimes server (0 = auto-select random free port)",
    ),
    banner: bool = typer.Option(
        False, "--banner", "-b", help="Show animated banner with Matrix rain animation"
    ),
    banner_all: bool = typer.Option(
        False,
        "--banner-all",
        "-B",
        help="Show animated banner with Matrix rain and black hole animations",
    ),
    debug: bool = typer.Option(
        False,
        "--debug",
        "-d",
        help="Enable debug mode with verbose logging (shows tool execution details)",
    ),
    codemode_disabled: bool = typer.Option(
        False,
        "--codemode-disabled",
        "--no-codemode",
        help="Disable codemode (MCP tools as programmatic tools)",
    ),
    suggestions: Optional[str] = typer.Option(
        None,
        "--suggestions",
        "-s",
        help="Extra suggestions to add (comma-separated), e.g. 'Search for X,Summarize Y'",
    ),
    eggs: bool = typer.Option(False, "--eggs", help="Enable Easter egg commands"),
    show_version: bool = typer.Option(
        False, "--version", "-v", help="Show version information"
    ),
) -> None:
    """Agent Runtimes Chat assistant.

    Run without arguments to start interactive chat mode with slash commands.
    Provide a query as arguments for single-shot mode.

    If no --agentspec-id is given, lists available agent specs and prompts
    you to choose one interactively.

    Examples:

        agent-runtimes chat                        # Pick agent spec interactively

        agent-runtimes chat --agentspec-id crawler # Use specific agent spec

        agent-runtimes chat "What is Python?"      # Single query mode

        agent-runtimes chat -a crawler "Search for AI trends"  # Single query with specific agent
    """
    # If a subcommand was invoked, don't run the default behavior
    if ctx.invoked_subcommand is not None:
        return

    if show_version:
        _show_version()
        raise typer.Exit(0)

    global _subprocess_ref

    # Show ASCII banner early (before agent selection)
    from .banner import BANNER, DIM, show_banner
    from .banner import RESET as BANNER_RESET

    if banner or banner_all:
        show_banner(splash=banner, splash_all=banner_all)
    else:
        if sys.stdout.isatty():
            print(BANNER)
            print(
                f"{DIM}Powered by Datalayer  •  \033]8;;https://datalayer.ai\033\\https://datalayer.ai\033]8;;\033\\{BANNER_RESET}\n"
            )

    # Resolve agent spec: use provided ID or pick interactively
    agent_id = agentspec_id
    if agent_id is None:
        agent_id = _pick_agentspec_interactive()

    try:
        if query:
            # Check if user typed "version" as a query - treat as version command
            query_str = " ".join(query)
            if query_str.strip().lower() == "version":
                _show_version()
                raise typer.Exit(0)

            # Non-interactive mode: start agent-runtimes server and run query
            if agent_id:
                print(f"{GRAY}Starting agent-runtimes server with {agent_id}...{RESET}")
                process, actual_port = _start_agent_runtime_server(
                    agent_id,
                    port=port,
                    transport=Transport.ag_ui,
                    codemode=not codemode_disabled,
                    debug=debug,
                )
                _subprocess_ref = process  # Register for cleanup

                # Wait for server to be ready
                if not _wait_for_server("127.0.0.1", actual_port, timeout=30.0):
                    print(
                        f"{GREEN_DARK}[ERROR]{RESET} Server failed to start",
                        file=sys.stderr,
                    )
                    _cleanup_subprocess()
                    raise typer.Exit(1)

                # Display startup info
                startup_info = _fetch_startup_info("127.0.0.1", actual_port)
                print(_format_startup_info("127.0.0.1", actual_port, startup_info))
                print()

                # Connect to the agent and run the query
                url = f"http://127.0.0.1:{actual_port}/api/v1/ag-ui/{DEFAULT_RUNTIME_AGENT_NAME}/"
                try:
                    output = asyncio.run(_run_single_query_ag_ui(url, query_str))
                    print(output)
                finally:
                    # Cleanup
                    _cleanup_subprocess()
            else:
                # Fall back to local agent
                output = asyncio.run(run_query_with_spinner(query_str))
                print(output)
        else:
            # Interactive mode: start server and launch TUX
            if agent_id:
                from rich.console import Console
                from rich.live import Live
                from rich.spinner import Spinner

                # Show starting message with spinner
                console = Console()
                with Live(
                    Spinner(
                        "dots",
                        text=f"[bold cyan]Starting agent runtime...[/bold cyan]",
                        style="cyan",
                    ),
                    console=console,
                    transient=True,
                    refresh_per_second=10,
                ) as live:
                    process, actual_port = _start_agent_runtime_server(
                        agent_id,
                        port=port,
                        transport=Transport.ag_ui,
                        codemode=not codemode_disabled,
                        debug=debug,
                    )
                    _subprocess_ref = process  # Register for cleanup

                    # Update status while waiting with more visible styling
                    live.update(
                        Spinner(
                            "dots",
                            text=f"[bold cyan]Waiting for agent runtime '{agent_id}' on port {actual_port}...[/bold cyan]",
                            style="cyan",
                        )
                    )

                    # Wait for server to be ready
                    if not _wait_for_server("127.0.0.1", actual_port, timeout=60.0):
                        live.stop()
                        print(
                            f"{GREEN_DARK}[ERROR]{RESET} Server failed to start",
                            file=sys.stderr,
                        )
                        _cleanup_subprocess()
                        raise typer.Exit(1)

                    live.update(
                        Spinner(
                            "dots",
                            text=f"[bold green]Agent runtime ready![/bold green]",
                            style="green",
                        )
                    )

                # Display startup info
                startup_info = _fetch_startup_info("127.0.0.1", actual_port)
                print(_format_startup_info("127.0.0.1", actual_port, startup_info))
                print()

                # Extract Jupyter URL for the /jupyter slash command
                jupyter_url = None
                if startup_info:
                    sandbox_info = startup_info.get("sandbox", {})
                    jupyter_url = sandbox_info.get("jupyter_url")
                    if not jupyter_url:
                        jh = sandbox_info.get("jupyter_host")
                        jp = sandbox_info.get("jupyter_port")
                        if jh and jp:
                            jupyter_url = f"http://{jh}:{jp}"
                    # Append token as query param so the browser can authenticate
                    if jupyter_url:
                        jupyter_token = sandbox_info.get("jupyter_token")
                        if jupyter_token:
                            jupyter_url = f"{jupyter_url}?token={jupyter_token}"

                url = f"http://127.0.0.1:{actual_port}/api/v1/ag-ui/{DEFAULT_RUNTIME_AGENT_NAME}/"
                server_url = f"http://127.0.0.1:{actual_port}"

                try:
                    # Use Rich-based TUX
                    from .tux import run_tux

                    extra_suggestions = (
                        [s.strip() for s in suggestions.split(",") if s.strip()]
                        if suggestions
                        else []
                    )
                    asyncio.run(
                        run_tux(
                            url,
                            server_url,
                            agent_id=DEFAULT_RUNTIME_AGENT_NAME,
                            eggs=eggs,
                            jupyter_url=jupyter_url,
                            extra_suggestions=extra_suggestions,
                        )
                    )
                finally:
                    _cleanup_subprocess()
            else:
                # Fall back to local agent
                agent.to_cli_sync(prog_name="agent-runtimes chat")

    except typer.Exit:
        _cleanup_subprocess()
        raise
    except KeyboardInterrupt:
        _cleanup_subprocess()
        print(f"\n{GREEN_LIGHT}{GOODBYE_MESSAGE}{RESET}")
        print(
            f"   {GRAY}\033]8;;https://datalayer.ai\033\\https://datalayer.ai\033]8;;\033\\{RESET}"
        )
        print()
        raise typer.Exit(0)
    except Exception as e:
        _cleanup_subprocess()
        print(f"{GREEN_DARK}[ERROR]{RESET} {e}", file=sys.stderr)
        raise typer.Exit(1)


async def _run_single_query_acp(url: str, query: str) -> str:
    """Run a single query against the remote agent via ACP (WebSocket).

    Args:
        url: WebSocket URL of the agent
        query: Query to send

    Returns:
        Response text from the agent
    """
    from agent_runtimes.transports.clients import ACPClient

    spinner = Spinner("Thinking", style="growing")

    try:
        async with ACPClient(url) as client:
            spinner.start()

            response_text = ""
            async for event in client.run(query, stream=True):
                event_type = event.get("type", "")

                if event_type == "text_delta":
                    if spinner.spinner_active:
                        spinner.stop()
                    content = event.get("content", "")
                    response_text += content

                elif event_type == "completed":
                    break

            spinner.stop()
            return response_text

    except Exception as e:
        spinner.stop()
        raise e


async def _run_single_query_ag_ui(url: str, query: str) -> str:
    """Run a single query against the remote agent via AG-UI (HTTP/SSE).

    Args:
        url: HTTP URL of the agent
        query: Query to send

    Returns:
        Response text from the agent
    """
    from ag_ui.core import EventType

    from agent_runtimes.transports.clients import AGUIClient

    spinner = Spinner("Thinking", style="growing")

    try:
        async with AGUIClient(url) as client:
            spinner.start()

            response_text = ""
            async for event in client.run(query):
                if event.type == EventType.TEXT_MESSAGE_CONTENT:
                    if spinner.spinner_active:
                        spinner.stop()
                    content = event.delta or ""
                    response_text += content

                elif event.type == EventType.RUN_FINISHED:
                    break

                elif event.type == EventType.RUN_ERROR:
                    raise Exception(event.error or "Unknown error")

            spinner.stop()
            return response_text

    except Exception as e:
        spinner.stop()
        raise e


@app.command()
def version() -> None:
    """Show Agent Runtimes Chat assistant version information."""
    _show_version()


@app.command()
def connect(
    url: str = typer.Argument(
        ..., help="URL of the agent server (WebSocket for ACP, HTTP for AG-UI)"
    ),
    transport: Transport = typer.Option(
        Transport.ag_ui,
        "--transport",
        "-t",
        help="Transport protocol (ag-ui: HTTP/SSE, acp: WebSocket)",
    ),
    splash: bool = typer.Option(
        False, "--splash", "-s", help="Show animated splash screen"
    ),
) -> None:
    """Connect to a remote agent server.

    Examples:

        agent-runtimes chat connect http://localhost:8000/api/v1/ag-ui/my-agent/

        agent-runtimes chat connect ws://localhost:8000/api/v1/acp/ws/my-agent -t acp

        agent-runtimes chat connect https://agent.datalayer.ai/api/v1/ag-ui/chat/
    """
    try:
        from agent_runtimes.transports.clients import ACPClient, AGUIClient
    except ImportError as e:
        print(
            f"{GREEN_DARK}[ERROR]{RESET} agent-runtimes package required: pip install agent-runtimes",
            file=sys.stderr,
        )
        raise typer.Exit(1)

    show_banner(splash=splash)

    if transport == Transport.acp:
        print(f"{GREEN_MEDIUM}Connecting via ACP:{RESET} {url}")
        print()
        asyncio.run(_remote_chat_loop_acp(url))
    else:
        print(f"{GREEN_MEDIUM}Connecting via AG-UI:{RESET} {url}")
        print()
        asyncio.run(_remote_chat_loop_ag_ui(url))


async def _remote_chat_loop_acp(url: str) -> None:
    """Run the interactive chat loop with a remote ACP agent."""
    from agent_runtimes.transports.clients import ACPClient

    try:
        async with ACPClient(url) as client:
            agent_info = client.agent_info
            if agent_info:
                print(f"{GREEN_LIGHT}Connected to:{RESET} {agent_info.name}")
                if agent_info.description:
                    print(f"{GRAY}{agent_info.description}{RESET}")
            print()
            print(
                f"{GRAY}Type your message and press Enter. Type 'quit' or 'exit' to leave.{RESET}"
            )
            print()

            while True:
                try:
                    # Get user input
                    user_input = input(f"{GREEN_MEDIUM}You:{RESET} ").strip()

                    if not user_input:
                        continue

                    if user_input.lower() in ("quit", "exit", "q"):
                        print(f"\n{GREEN_LIGHT}{GOODBYE_MESSAGE}{RESET}")
                        print(
                            f"   {GRAY}\033]8;;https://datalayer.ai\033\\https://datalayer.ai\033]8;;\033\\{RESET}"
                        )
                        print()
                        break

                    # Show spinner while waiting
                    spinner = Spinner("Thinking", style="growing")
                    spinner.start()

                    # Collect response
                    response_text = ""
                    async for event in client.run(user_input, stream=True):
                        event_type = event.get("type", "")

                        if event_type == "text_delta":
                            if spinner.spinner_active:
                                spinner.stop()
                            content = event.get("content", "")
                            response_text += content
                            print(content, end="", flush=True)

                        elif event_type == "completed":
                            break

                    spinner.stop()

                    # If we didn't get streaming text, print final output
                    if not response_text and "output" in event:
                        print(f"\n{GREEN_LIGHT}Agent:{RESET} {event.get('output', '')}")
                    else:
                        print()  # Newline after streamed response

                    print()

                except KeyboardInterrupt:
                    print(f"\n{GREEN_LIGHT}{GOODBYE_MESSAGE}{RESET}")
                    print(
                        f"   {GRAY}\033]8;;https://datalayer.ai\033\\https://datalayer.ai\033]8;;\033\\{RESET}"
                    )
                    print()
                    break

    except ConnectionRefusedError:
        print(f"{GREEN_DARK}[ERROR]{RESET} Could not connect to {url}", file=sys.stderr)
        print(f"{GRAY}Make sure the agent server is running.{RESET}", file=sys.stderr)
    except Exception as e:
        print(f"{GREEN_DARK}[ERROR]{RESET} Connection error: {e}", file=sys.stderr)


async def _remote_chat_loop_ag_ui(url: str) -> None:
    """Run the interactive chat loop with a remote AG-UI agent."""
    from ag_ui.core import EventType

    from agent_runtimes.transports.clients import AGUIClient

    try:
        async with AGUIClient(url) as client:
            print(f"{GREEN_LIGHT}Connected to AG-UI agent{RESET}")
            print()
            print(
                f"{GRAY}Type your message and press Enter. Type 'quit' or 'exit' to leave.{RESET}"
            )
            print()

            while True:
                try:
                    # Get user input
                    user_input = input(f"{GREEN_MEDIUM}You:{RESET} ").strip()

                    if not user_input:
                        continue

                    if user_input.lower() in ("quit", "exit", "q"):
                        print(f"\n{GREEN_LIGHT}{GOODBYE_MESSAGE}{RESET}")
                        print(
                            f"   {GRAY}\033]8;;https://datalayer.ai\033\\https://datalayer.ai\033]8;;\033\\{RESET}"
                        )
                        print()
                        break

                    # Show spinner while waiting
                    spinner = Spinner("Thinking", style="growing")
                    spinner.start()

                    # Collect response
                    response_text = ""
                    async for event in client.run(user_input):
                        if event.type == EventType.TEXT_MESSAGE_CONTENT:
                            if spinner.spinner_active:
                                spinner.stop()
                            content = event.delta or ""
                            response_text += content
                            print(content, end="", flush=True)

                        elif event.type == EventType.RUN_FINISHED:
                            break

                        elif event.type == EventType.RUN_ERROR:
                            spinner.stop()
                            print(
                                f"\n{GREEN_DARK}[ERROR]{RESET} {event.error or 'Unknown error'}",
                                file=sys.stderr,
                            )
                            break

                    spinner.stop()

                    # Add newline after streamed response
                    if response_text:
                        print()

                    print()

                except KeyboardInterrupt:
                    print(f"\n{GREEN_LIGHT}{GOODBYE_MESSAGE}{RESET}")
                    print(
                        f"   {GRAY}\033]8;;https://datalayer.ai\033\\https://datalayer.ai\033]8;;\033\\{RESET}"
                    )
                    print()
                    break

    except ConnectionRefusedError:
        print(f"{GREEN_DARK}[ERROR]{RESET} Could not connect to {url}", file=sys.stderr)
        print(f"{GRAY}Make sure the agent server is running.{RESET}", file=sys.stderr)
    except Exception as e:
        print(f"{GREEN_DARK}[ERROR]{RESET} Connection error: {e}", file=sys.stderr)


@app.command()
def agents(
    server: str = typer.Option(
        "http://localhost:8000", "--server", "-s", help="Agent server base URL"
    ),
) -> None:
    """List available agents on an agent-runtimes server.

    Examples:

        agent-runtimes chat agents

        agent-runtimes chat agents --server https://agents.datalayer.ai
    """
    import httpx

    try:
        url = f"{server.rstrip('/')}/api/v1/acp/agents"
        response = httpx.get(url, timeout=10.0)
        response.raise_for_status()

        data = response.json()
        agents_list = data.get("agents", [])

        if not agents_list:
            print(f"{GRAY}No agents available on {server}{RESET}")
            return

        print(f"{GREEN_LIGHT}Available Agents on {server}:{RESET}")
        print()

        for agent in agents_list:
            print(
                f"  {GREEN_MEDIUM}•{RESET} {BOLD}{agent.get('name', 'Unknown')}{RESET}"
            )
            print(f"    {GRAY}ID:{RESET} {agent.get('id', 'N/A')}")
            if agent.get("description"):
                print(f"    {GRAY}Description:{RESET} {agent.get('description')}")
            caps = agent.get("capabilities", {})
            cap_list = [k for k, v in caps.items() if v is True]
            if cap_list:
                print(f"    {GRAY}Capabilities:{RESET} {', '.join(cap_list)}")
            print()

    except httpx.ConnectError:
        print(
            f"{GREEN_DARK}[ERROR]{RESET} Could not connect to {server}", file=sys.stderr
        )
    except httpx.HTTPStatusError as e:
        print(
            f"{GREEN_DARK}[ERROR]{RESET} Server returned {e.response.status_code}",
            file=sys.stderr,
        )
    except Exception as e:
        print(f"{GREEN_DARK}[ERROR]{RESET} {e}", file=sys.stderr)


def main() -> None:
    """Main entry point for the Agent Runtimes interactive CLI assistant."""
    app()


if __name__ == "__main__":
    main()
