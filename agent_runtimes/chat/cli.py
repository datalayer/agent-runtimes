# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

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

# Narrow interactive selection to the gallery context set by default. This keeps
# the picker focused while preserving the existing valid/env/sort logic.
DEFAULT_AGENTSPEC_CONTEXT_IDS: tuple[str, ...] = (
    "example-simple",
    "worker-accountant",
    "example-analyze-excel-spreadsheet",
    "example-agent-critic-loop-for-analysis",
    "example-ai-explains-notebook-output",
    "example-replace-excel-pivot-work",
)


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


def _cleanup_subprocess_with_spinner(message: str = "Terminating agent...") -> None:
    """Clean up subprocess while showing a transient spinner when interactive."""
    global _subprocess_ref
    if (
        _subprocess_ref is None
        or not _subprocess_ref.is_alive()
        or not sys.stdout.isatty()
    ):
        _cleanup_subprocess()
        return

    try:
        from rich.console import Console
        from rich.live import Live
        from rich.spinner import Spinner as RichSpinner

        console = Console()
        with Live(
            RichSpinner("dots", text=f"[bold cyan]{message}[/bold cyan]", style="cyan"),
            console=console,
            transient=True,
            refresh_per_second=12,
        ):
            _cleanup_subprocess()
    except Exception:
        _cleanup_subprocess()


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
    BOLD,
    GRAY,
    GREEN_DARK,
    GREEN_LIGHT,
    GREEN_MEDIUM,
    RED,
    RESET,
    WHITE,
    print_goodbye,
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
    instructions="""You are theLoop assistant, a helpful AI specialized in code analysis,
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


def _quiet_the_logs(debug: bool) -> None:
    """Keep library logging out of the terminal unless it is asked for.

    `agent_runtimes.__main__` configures logging at INFO for the command-line
    tools, and in this terminal that means every HTTP request the session
    makes prints over the conversation. This is a reader's window, not a
    developer's console: errors still surface, everything under them goes,
    and `--debug` puts the lot back.
    """
    import logging

    if debug or os.environ.get("AG_CHAT_DEBUG") == "1":
        logging.getLogger().setLevel(logging.DEBUG)
        return
    logging.getLogger().setLevel(logging.ERROR)
    # Named as well as inherited: a library that sets its own level is not
    # quieted by the root's.
    for noisy in ("httpx", "httpcore", "urllib3", "asyncio", "reactor"):
        logging.getLogger(noisy).setLevel(logging.ERROR)


def _show_version() -> None:
    """Display version information."""
    from .banner import LOOP_VERSION

    typer.echo(f"{GREEN_LIGHT}Agent Runtimes Chat{RESET} v{LOOP_VERSION}")
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
        print("[DEBUG] Starting agent runtime server in debug mode")

    # Resolve port in this process so we can communicate it back
    actual_port = port
    if port == 0:
        actual_port = find_random_free_port(host)

    # Write effective port to shared value so the parent process can read it
    if port_value is not None:
        port_value.value = actual_port

    # Point the codemode MCP proxy at this server's actual port. The loop
    # binds to a random free port, so the hardcoded 8765 default would make the
    # sandbox's tool calls unreachable ("Connection error to MCP proxy at
    # http://localhost:8765..."). Respect an explicit override if already set.
    os.environ.setdefault(
        "AGENT_RUNTIMES_MCP_PROXY_URL",
        f"http://127.0.0.1:{actual_port}/api/v1/mcp/proxy",
    )

    # Load agent spec to get MCP servers and sandbox variant
    # Keep empty by default so specs with no MCP servers do not start any.
    mcp_servers_str = ""
    sandbox_variant = "jupyter-server"  # Default interactive CLI sandbox variant
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


def _format_startup_info(
    host: str, port: int, info: dict | None, where: Optional[str] = None
) -> str:
    """Format startup info for CLI display.

    Args:
        host: Runtime server host
        port: Runtime server port
        info: The startup info dict from /health/startup

    Returns:
        Formatted string ready for terminal output.
    """
    lines: list[str] = []

    def add_row(label: str, value: str) -> None:
        # Keep values vertically aligned regardless of label length.
        lines.append(f"  {GREEN_MEDIUM}{label:<13}{RESET} {value}")

    if where:
        # On Datalayer: the runtime, and the relay on this machine reaching it.
        add_row("Agent Runtime", f"{where}  {GRAY}(via http://{host}:{port}){RESET}")
    else:
        add_row("Agent Runtime", f"http://{host}:{port}")

    if info:
        agent_info = info.get("agent", {})
        sandbox_info = info.get("sandbox", {})

        if agent_info.get("protocol"):
            add_row("Protocol", str(agent_info["protocol"]))
        if agent_info.get("model"):
            add_row("Model", str(agent_info["model"]))
        if agent_info.get("codemode"):
            add_row("Codemode", "enabled")

        variant = sandbox_info.get("variant")
        if variant:
            sandbox_line = str(variant)
            jupyter_url = sandbox_info.get("jupyter_url")
            if jupyter_url:
                sandbox_line += f"  {GRAY}({jupyter_url}){RESET}"
            else:
                jupyter_host = sandbox_info.get("jupyter_host")
                jupyter_port = sandbox_info.get("jupyter_port")
                if jupyter_host and jupyter_port:
                    sandbox_line += f"  {GRAY}({jupyter_host}:{jupyter_port}){RESET}"
            add_row("Code Sandbox", sandbox_line)

            kernel_id = sandbox_info.get("kernel_id")
            if str(variant).lower() == "jupyter-server" and kernel_id:
                add_row("Kernel ID", str(kernel_id))

        skills = agent_info.get("skills", [])
        if skills:
            add_row("Skills", ", ".join(skills))

        mcp_servers = agent_info.get("mcp_servers", [])
        if mcp_servers:
            add_row("MCP", ", ".join(mcp_servers))

    return "\n".join(lines)


def _available_model_ids_by_env() -> tuple[set[str], list[str], int]:
    """Return model IDs offered here, and which of them the env vars reach.

    A model whose spec says ``available: false`` is switched off in the
    catalogue: it is not listed, not counted, and not a reason to let an
    agent through. So the total is the number of models this build offers
    at all, and the ids are those of them whose credentials are present —
    the two figures the terminal prints as a ratio.

    Returns:
        (available_ids, available_display_lines, offered_model_specs)
    """
    try:
        from agent_runtimes.specs.models import (
            check_env_vars_available,
            list_chat_models,
        )
    except Exception:
        return set(), [], 0

    available_ids: set[str] = set()
    available_lines: list[str] = []
    models = [model for model in list_chat_models() if model.available]
    for model in sorted(models, key=lambda m: m.id):
        if check_env_vars_available(list(model.required_env_vars or [])):
            available_ids.add(model.id)
            available_lines.append(f"{model.id} ({model.name})")
    return available_ids, available_lines, len(models)


def _spec_has_valid_env(spec: Any, available_model_ids: set[str] | None = None) -> bool:
    """Return True when a spec is enabled and all required env vars are set.

    Validation includes:
    - spec is enabled
    - MCP server required env vars are present
    - model required env vars are present (when model exists in catalog)
    """
    if not spec.enabled:
        return False

    for mcp in spec.mcp_servers:
        for var in mcp.required_env_vars:
            if not os.environ.get(var):
                return False

    if available_model_ids is not None and getattr(spec, "model", None):
        try:
            from agent_runtimes.specs.models import get_model

            model_ref = str(spec.model)
            model_spec = get_model(model_ref)
            # Only gate on catalog models; unknown/custom models remain allowed.
            if model_spec is not None and model_spec.id not in available_model_ids:
                return False
        except Exception:
            pass

    return True


def _parse_agentspec_context_ids() -> list[str]:
    """Return agent spec IDs to expose in interactive selection.

    Environment overrides (comma-separated IDs):
    - ``LOOP_AGENTSPEC_CONTEXT_IDS``
    - ``DATALAYER_LOOP_AGENTSPEC_CONTEXT_IDS``

    If no override is provided, defaults to ``DEFAULT_AGENTSPEC_CONTEXT_IDS``.
    """
    raw = os.environ.get("LOOP_AGENTSPEC_CONTEXT_IDS") or os.environ.get(
        "DATALAYER_LOOP_AGENTSPEC_CONTEXT_IDS"
    )
    if raw is None:
        return list(DEFAULT_AGENTSPEC_CONTEXT_IDS)
    return [part.strip() for part in raw.split(",") if part.strip()]


def _pick_agentspec_interactive() -> str:
    """Show available agent specs and let the user pick one interactively.

    Specs are split into two groups:
            ○ Invalid – disabled or missing env vars (shown first for reference)
            ● Valid   – enabled with all required env vars present (selectable)

    The first valid spec is proposed as the default (press Enter to select it).

    Returns:
        The chosen agent spec ID.
    """
    from agent_runtimes.specs.agents import list_agentspecs

    all_specs = list_agentspecs()
    if not all_specs:
        print(f"{GREEN_DARK}[ERROR]{RESET} No agent specs found", file=sys.stderr)
        raise typer.Exit(1)

    context_ids = _parse_agentspec_context_ids()
    context_set = set(context_ids)
    show_all_specs = False

    while True:
        specs = all_specs
        if not show_all_specs and context_ids:
            specs = [s for s in all_specs if s.id in context_set]
            if not specs:
                print(
                    f"{GREEN_DARK}[ERROR]{RESET} No agent specs found in LOOP_AGENTSPEC_CONTEXT_IDS filter",
                    file=sys.stderr,
                )
                raise typer.Exit(1)

        # Resolve model credentials from env vars and list available model specs.
        available_model_ids, available_model_lines, total_models = (
            _available_model_ids_by_env()
        )

        print()
        if total_models > 0:
            print(
                f"{GREEN_LIGHT}Model specs available by env vars:{RESET} "
                f"{len(available_model_ids)}/{total_models}"
            )
            if available_model_lines:
                for line in available_model_lines:
                    print(f"       {GREEN_MEDIUM}●{RESET} {WHITE}{line}{RESET}")
            else:
                print(f"       {RED}No model specs are currently available.{RESET}")
            print(
                f"{GRAY}Only agents whose model requirements are available are selectable.{RESET}"
            )

        # Partition into valid (enabled + MCP/model env vars) and the rest, each sorted by id.
        # Display invalid first, then valid, while keeping selection restricted to valid.
        valid_specs = sorted(
            [s for s in specs if _spec_has_valid_env(s, available_model_ids)],
            key=lambda s: s.id,
        )
        other_specs = sorted(
            [s for s in specs if not _spec_has_valid_env(s, available_model_ids)],
            key=lambda s: s.id,
        )
        ordered = other_specs + valid_specs
        valid_count = len(valid_specs)
        invalid_count = len(other_specs)

        if valid_count == 0:
            print(f"\n{RED}No valid agent specs available.{RESET}")
            print(
                f"{GRAY}Enable a spec and/or set the required MCP/model environment variables.{RESET}"
            )
            raise typer.Exit(1)

        # Default preference: example-simple when valid, otherwise first valid spec.
        default_idx: Optional[int] = None
        for i, spec in enumerate(ordered):
            if i >= invalid_count and spec.id == "example-simple":
                default_idx = i
                break
        if default_idx is None:
            default_idx = invalid_count

        print(f"\n{GREEN_LIGHT}Selected Agentspecs:{RESET}\n")
        for i, spec in enumerate(ordered, 1):
            is_valid = (i - 1) >= invalid_count
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

            model_ref = str(getattr(spec, "model", "") or "")
            if model_ref:
                try:
                    from agent_runtimes.specs.models import get_model

                    model_spec = get_model(model_ref)
                except Exception:
                    model_spec = None
                if model_spec is not None:
                    model_ok = model_spec.id in available_model_ids
                    model_color = GREEN_LIGHT if model_ok else RED
                    print(f"       model: {model_color}{model_spec.id}{RESET}")
                else:
                    print(f"       model: {GRAY}{model_ref} (custom/unknown){RESET}")

        show_all_index: Optional[int] = None
        if not show_all_specs:
            show_all_index = len(ordered) + 1
            print(
                f"  {GREEN_MEDIUM}{show_all_index:>3}.{RESET} {GREEN_MEDIUM}●{RESET} {WHITE}show-all-specs{RESET}"
            )
            print(f"       {GRAY}Show the complete spec list{RESET}")

        default_display = f" [{default_idx + 1}]" if default_idx is not None else ""
        max_choice = len(ordered) + (1 if show_all_index is not None else 0)
        print()
        try:
            choice = input(
                f"{GREEN_MEDIUM}Choose an agentspec [1-{max_choice}]{default_display}: {RESET}"
            ).strip()
            if not choice:
                if default_idx is not None:
                    chosen = ordered[default_idx]
                    print(f"\n{GREEN_LIGHT}Selected:{RESET} {chosen.id}\n")
                    return chosen.id
                continue
            idx = int(choice) - 1

            if show_all_index is not None and idx == (show_all_index - 1):
                show_all_specs = True
                continue

            if invalid_count <= idx < len(ordered):
                chosen = ordered[idx]
                print(f"\n{GREEN_LIGHT}Selected:{RESET} {chosen.id}\n")
                return chosen.id
            elif 0 <= idx < len(ordered):
                print(
                    f"{GRAY}Agent spec #{choice} is not available (disabled or missing MCP/model env vars).{RESET}"
                )
                print(
                    f"{GRAY}Please choose a valid (●) spec or press Enter for the default.{RESET}"
                )
            else:
                print(f"{GRAY}Please enter a number between 1 and {max_choice}.{RESET}")
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
                    f"{GRAY}Agent spec '{choice}' is not available (disabled or missing MCP/model env vars).{RESET}"
                )
            elif not show_all_specs and choice.lower() in {
                "show-all",
                "show-all-specs",
                "all",
            }:
                show_all_specs = True
            else:
                print(
                    f"{GRAY}Invalid input. Enter a number or a valid agent spec ID.{RESET}"
                )
        except (KeyboardInterrupt, EOFError):
            print()
            raise typer.Exit(0)


def _choose_where_at_start(*, local: bool, cloud: bool) -> str:
    """Here or on Datalayer, asked before the agentspec (LOOP L-01).

    Datalayer is offered only to somebody signed in; nobody else is asked,
    and is told in one line how to be offered it.
    """
    from agent_runtimes.loop.launch import choose_where, interactive, signed_in

    offered = local or cloud or signed_in()
    if not offered and interactive():
        print(
            f"{GRAY}Running on this machine. Sign in (`datalayer login`) to be offered Datalayer's cloud runtimes too.{RESET}"
        )
    return choose_where(local=local, cloud=cloud, cloud_offered=offered)


def _launch_on_datalayer(
    agent_id: Optional[str],
    *,
    environment: Optional[str],
    minutes: Optional[int],
    runtime: Optional[str] = None,
) -> Any:
    """A cloud runtime for the agent, or None to run it on this machine instead.

    What Datalayer offers is read through the SDK and shown first — the
    credits left and the agent runtimes already running — then a running
    one is attached to (``runtime``, or chosen) or a new one is launched in
    an environment picked from the SDK's list, only those that can launch an
    agent selectable. No agentspec list: the runtime's agent is ``agent_id``
    (``-a``), else the one loop starts with, said in one line. Every refusal
    is one sentence and the exit.
    """
    from rich.console import Console

    from agent_runtimes.loop.launch import (
        CloudRefused,
        NotSignedIn,
        interactive,
        launch_cloud,
        make_client,
        offer_lines,
        read_offer,
    )

    console = Console()
    try:
        client, _ = make_client()
        offer = read_offer(client)
        console.print()
        for line in offer_lines(offer):
            console.print(f"[dim]{line}[/dim]")
        console.print()
        launch = launch_cloud(
            agent_id,
            environment=environment,
            minutes=minutes,
            runtime=runtime,
            offer=offer,
            status=lambda message: console.print(f"[cyan]{message}[/cyan]"),
            note=lambda message: console.print(f"[dim]{message}[/dim]"),
        )
    except NotSignedIn:
        console.print(
            "[yellow]Not signed in to Datalayer: run `datalayer login`, or set DATALAYER_API_KEY.[/yellow]"
        )
        if interactive():
            import questionary

            if questionary.confirm(
                "Run it on this machine instead?", default=True
            ).ask():
                return None
        raise typer.Exit(1)
    except CloudRefused as refused:
        console.print(f"[red]✗[/red] {refused}")
        raise typer.Exit(1)
    if launch.attached:
        console.print(
            f"[green]●[/green] Back on runtime [bold]{launch.runtime_name}[/bold] on Datalayer — "
            f"{launch.environment}, {launch.minutes} min left "
            "[dim](billed until it is stopped or its reservation ends)[/dim]"
        )
    else:
        console.print(
            f"[green]●[/green] Runtime [bold]{launch.runtime_name}[/bold] on Datalayer — "
            f"{launch.environment}, reserved {launch.minutes} min "
            f"[dim](at most {launch.credits:.2f} credits)[/dim]"
        )
    return launch


def _say(message: str) -> None:
    """Say a status line on standard error, which ``--prompt`` keeps answers off."""
    print(message, file=sys.stderr, flush=True)


def _interrupted(signum: int, frame: Any) -> None:
    """Turn a termination into an interrupt, so that cleanup runs."""
    raise KeyboardInterrupt


async def _run_lines(tux: Any, lines: List[str]) -> int:
    """Run each line in the session, in order: the exit code.

    Parameters
    ----------
    tux : CliTux
        The session the lines run in.
    lines : list of str
        What ``--prompt`` gave, each run as if typed at the prompt.

    Returns
    -------
    int
        0 when every line ran, 1 at the first that errored (the rest are
        not run).
    """
    tux.running = True
    tux.scripted = True
    try:
        for number, line in enumerate(lines, 1):
            _say(f"[{number}/{len(lines)}] {line}")
            if not await tux.run_line(line):
                _say(f"Stopped at step {number} of {len(lines)}: {tux.last_error}")
                return 1
            if not tux.running:  # /exit
                break
        return 0
    finally:
        if tux._agui_client is not None:
            await tux._agui_client.disconnect()
            tux._agui_client = None


def run_prompts(
    prompts: List[str],
    *,
    agent_id: Optional[str],
    local: bool = False,
    cloud: bool = False,
    runtime: Optional[str] = None,
    environment: Optional[str] = None,
    minutes: Optional[int] = None,
    keep: bool = False,
    port: int = 0,
    codemode: bool = True,
    debug: bool = False,
    eggs: bool = False,
) -> int:
    """``loop --prompt``: launch the agent, run each line in one session, stop it.

    The session starts as interactive ``loop`` starts it — on this machine,
    or on Datalayer through `launch_cloud` — but asks nothing: every choice
    comes from the options or their defaults, and a choice that would need
    asking is refused in a sentence. Each prompt then runs through
    `CliTux.run_line`, as if typed: ``/command`` is that slash command,
    anything else a message whose answer is printed. The cloud runtime is
    stopped at the end unless ``keep``, on an error or an interrupt too, and
    a local server always is.

    Parameters
    ----------
    prompts : list of str
        The lines to run, in order.
    agent_id : str or None
        The agentspec (``-a``). Needed on this machine; on Datalayer it
        defaults to the agent ``loop`` starts with.
    local, cloud : bool
        Where the agent runs (``--local``, ``--cloud``); on this machine
        unless said.
    runtime : str or None
        A running Datalayer runtime to attach to (``--runtime``).
    environment : str or None
        The environment of a new cloud runtime (``--environment``).
    minutes : int or None
        How long to reserve a new cloud runtime for (``--minutes``).
    keep : bool
        Leave the cloud runtime running at the end (``--keep``).
    port : int
        The local server's port, 0 for any free one.
    codemode : bool
        Whether the local agent runs with codemode.
    debug : bool
        Whether the local server logs.
    eggs : bool
        Whether the Easter egg commands are registered.

    Returns
    -------
    int
        0 when every line ran; 1 when the launch was refused, the runtime did
        not start or answer, or a line errored; 2 when the options leave a
        choice that would need asking; 130 when interrupted.
    """
    from agent_runtimes.loop.launch import (
        CLOUD,
        CLOUD_AGENT_NAME,
        CloudRefused,
        NotSignedIn,
        choose_where,
        finish_cloud,
        launch_cloud,
    )

    global _subprocess_ref

    # This module's handlers kill the process outright; here an interrupt
    # must reach the cleanup below, which stops what is billed.
    previous = {sig: signal.getsignal(sig) for sig in (signal.SIGINT, signal.SIGTERM)}
    signal.signal(signal.SIGINT, signal.default_int_handler)
    signal.signal(signal.SIGTERM, _interrupted)
    cloud_launch = None
    try:
        if runtime and local:
            _say("--runtime attaches on Datalayer: drop --local.")
            return 2
        try:
            where = choose_where(
                local=local, cloud=cloud or bool(runtime), can_ask=False
            )
        except ValueError as error:
            _say(str(error))
            return 2
        if where == CLOUD:
            try:
                cloud_launch = launch_cloud(
                    agent_id,
                    environment=environment,
                    minutes=minutes,
                    runtime=runtime,
                    can_ask=False,
                    status=_say,
                    note=_say,
                )
            except NotSignedIn:
                _say(
                    "Not signed in to Datalayer: run `datalayer login`, or set DATALAYER_API_KEY."
                )
                return 1
            except (CloudRefused, RuntimeError, ValueError) as refused:
                _say(str(refused))
                return 1
            _say(
                f"Runtime {cloud_launch.runtime_name} on Datalayer ({cloud_launch.environment}, "
                f"{cloud_launch.minutes} min) runs {cloud_launch.agent_spec_id or CLOUD_AGENT_NAME}."
            )
            server_url = cloud_launch.server_url
            agent_name = CLOUD_AGENT_NAME
        else:
            if not agent_id:
                _say(
                    "Name the agent to run on this machine with -a <agentspec>: "
                    "--prompt asks nothing."
                )
                return 2
            _say(f"Starting {agent_id} on this machine…")
            process, actual_port = _start_agent_runtime_server(
                agent_id,
                port=port,
                transport=Transport.ag_ui,
                codemode=codemode,
                debug=debug,
            )
            _subprocess_ref = process
            if not _wait_for_server("127.0.0.1", actual_port, timeout=60.0):
                _say(f"The agent runtime for {agent_id} did not start on this machine.")
                return 1
            server_url = f"http://127.0.0.1:{actual_port}"
            agent_name = DEFAULT_RUNTIME_AGENT_NAME

        from .tux import CliTux

        tux = CliTux(
            agent_url=f"{server_url}/api/v1/ag-ui/{agent_name}/",
            server_url=server_url,
            agent_id=agent_name,
            eggs=eggs,
            where=cloud_launch.label if cloud_launch else None,
        )
        return asyncio.run(_run_lines(tux, prompts))
    except KeyboardInterrupt:
        _say("Interrupted.")
        return 130
    finally:
        # A second interrupt does not cut the cleanup short.
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        try:
            if cloud_launch is not None:
                finish_cloud(cloud_launch, keep=keep, can_ask=False, say=_say)
            _cleanup_subprocess()
        finally:
            for sig, handler in previous.items():
                signal.signal(sig, handler)


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
    local: bool = typer.Option(
        False, "--local", help="Run the agent on this machine, without asking where."
    ),
    cloud: bool = typer.Option(
        False,
        "--cloud",
        help="Run the agent on Datalayer, in a cloud runtime, without asking where.",
    ),
    environment: Optional[str] = typer.Option(
        None,
        "--environment",
        "-e",
        help=(
            "The Datalayer environment of a new cloud runtime, without asking "
            "(with --cloud; default: the first that can launch an agent)."
        ),
    ),
    minutes: Optional[int] = typer.Option(
        None,
        "--minutes",
        "-m",
        help="How long to reserve the cloud runtime for, in minutes (with --cloud).",
    ),
    keep: bool = typer.Option(
        False,
        "--keep",
        help="Leave the cloud runtime running when the session ends (with --cloud).",
    ),
    runtime: Optional[str] = typer.Option(
        None,
        "--runtime",
        "-r",
        help=(
            "Attach to an agent runtime already running on Datalayer, by its name "
            "(implies --cloud; nothing is launched). With --agentspec-id, its agent "
            "is made that agentspec's."
        ),
    ),
    show_version: bool = typer.Option(
        False, "--version", "-v", help="Show version information"
    ),
    prompts: Optional[List[str]] = typer.Option(
        None,
        "--prompt",
        "-q",
        help=(
            "Run without interaction: launch the agent, run this line as if typed "
            "(a /slash command, else a message whose answer is printed), then stop. "
            "Repeat it for several lines, run in order in one session. Nothing is "
            "asked; exits non-zero when a line errors."
        ),
    ),
) -> None:
    """Agent Runtimes Chat assistant.

    Run without arguments to start interactive chat mode with slash commands.
    Provide a query as arguments for single-shot mode.

    If no --agentspec-id is given, lists available agent specs and prompts
    you to choose one interactively.

    Examples:

        loop                        # Pick agent spec interactively

        loop --agentspec-id crawler # Use specific agent spec

        loop "What is Python?"      # Single query mode

        loop -a crawler "Search for AI trends"  # Single query with specific agent

        loop --cloud -a crawler     # On Datalayer: a cloud runtime, billed by the minute

        loop --runtime <name>       # Back to an agent runtime running on Datalayer

        loop --cloud -a example-simple --prompt "/models" --prompt "Hello"

    Where the agent runs is asked first — on this machine, or on Datalayer
    when signed in — unless --local, --cloud or --runtime says so. Without a
    terminal it runs here.
    """
    # If a subcommand was invoked, don't run the default behavior
    if ctx.invoked_subcommand is not None:
        return

    _quiet_the_logs(debug)

    if show_version:
        _show_version()
        raise typer.Exit(0)

    if prompts:
        if query:
            raise typer.BadParameter(
                "Give the lines with --prompt only, not as arguments as well."
            )
        raise typer.Exit(
            run_prompts(
                prompts,
                agent_id=agentspec_id,
                local=local,
                cloud=cloud,
                runtime=runtime,
                environment=environment,
                minutes=minutes,
                keep=keep,
                port=port,
                codemode=not codemode_disabled,
                debug=debug,
                eggs=eggs,
            )
        )

    global _subprocess_ref

    # Optional animated splash (default startup uses the rich welcome panel only)
    from .banner import show_banner

    if banner or banner_all:
        show_banner(splash=banner, splash_all=banner_all)
    else:
        pass

    extra_suggestions = (
        [s.strip() for s in suggestions.split(",") if s.strip()] if suggestions else []
    )

    if runtime and local:
        raise typer.BadParameter("--runtime attaches on Datalayer: drop --local.")
    cloud = cloud or bool(runtime)

    # Resolve agent spec: use provided ID or pick interactively
    agent_id = agentspec_id
    if agent_id is None:
        # Render the same rich LOOP banner style before the first agentspec
        # selection question so startup uses a single visual language.
        from .tux import CliTux

        preview_tux = CliTux(
            agent_url="http://127.0.0.1:0/api/v1/ag-ui/chat/",
            server_url="http://127.0.0.1:0",
            agent_id=DEFAULT_RUNTIME_AGENT_NAME,
            eggs=eggs,
            extra_suggestions=extra_suggestions,
        )
        preview_tux.show_welcome()

    # Where it runs (LOOP L-01), asked first: what the flags say, else what
    # the person answers — on this machine, or on Datalayer. Here the
    # agentspec is picked from the list this machine's keys allow; on
    # Datalayer the environment is picked instead, and no agentspec list is
    # shown.
    from agent_runtimes.loop.launch import CLOUD, CLOUD_AGENT_NAME

    where = _choose_where_at_start(local=local, cloud=cloud)
    cloud_launch = None
    if where == CLOUD:
        cloud_launch = _launch_on_datalayer(
            agent_id, environment=environment, minutes=minutes, runtime=runtime
        )
        if cloud_launch is None:
            where = "local"
        else:
            # A runtime gone back to may not say its agentspec: its agent is `default`.
            agent_id = cloud_launch.agent_spec_id or agent_id or CLOUD_AGENT_NAME
    if cloud_launch is None and agent_id is None:
        agent_id = _pick_agentspec_interactive()
    runtime_agent_name = (
        CLOUD_AGENT_NAME if cloud_launch else DEFAULT_RUNTIME_AGENT_NAME
    )

    try:
        if query:
            # Check if user typed "version" as a query - treat as version command
            query_str = " ".join(query)
            if query_str.strip().lower() == "version":
                _show_version()
                raise typer.Exit(0)

            # Non-interactive mode, on Datalayer: the query through the relay,
            # then the runtime stopped unless it is kept.
            if cloud_launch is not None:
                from agent_runtimes.loop.launch import finish_cloud

                try:
                    output = asyncio.run(
                        _run_single_query_ag_ui(cloud_launch.agent_url, query_str)
                    )
                    print(output)
                finally:
                    finish_cloud(cloud_launch, keep=keep, can_ask=False)
            # Non-interactive mode: start agent-runtimes server and run query
            elif agent_id:
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

                from .tux import CliTux

                # Show the unified LOOP banner immediately before startup.
                preview_tux = CliTux(
                    agent_url="http://127.0.0.1:0/api/v1/ag-ui/chat/",
                    server_url="http://127.0.0.1:0",
                    agent_id=DEFAULT_RUNTIME_AGENT_NAME,
                    eggs=eggs,
                    extra_suggestions=extra_suggestions,
                )
                preview_tux.show_welcome()

                if cloud_launch is not None:
                    # The relay is this machine's address for the cloud runtime.
                    actual_port = cloud_launch.port
                else:
                    # Show starting message with spinner
                    console = Console()
                    with Live(
                        Spinner(
                            "dots",
                            text="[bold cyan]Starting agent runtime...[/bold cyan]",
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

                        # Show available model IDs on one line while the runtime starts.
                        _available_model_ids, _, _ = _available_model_ids_by_env()
                        _available_models_line = (
                            ", ".join(sorted(_available_model_ids))
                            if _available_model_ids
                            else "none"
                        )
                        console.print(
                            f"[dim]Available model IDs: {_available_models_line}[/dim]"
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
                                text="[bold green]Agent runtime ready![/bold green]",
                                style="green",
                            )
                        )

                # Display startup info
                startup_info = _fetch_startup_info("127.0.0.1", actual_port)
                print(
                    _format_startup_info(
                        "127.0.0.1",
                        actual_port,
                        startup_info,
                        where=cloud_launch.label if cloud_launch else None,
                    )
                )
                print()

                # Confirmation message based on the selected agent spec.
                try:
                    from agent_runtimes.specs.agents import get_agent_spec

                    _spec = get_agent_spec(agent_id)
                except Exception:
                    _spec = None
                _agent_label = _spec.name if _spec and _spec.name else agent_id
                _agent_emoji = (
                    str(getattr(_spec, "emoji", "") or "").strip() if _spec else ""
                )
                _agent_prefix = f"{_agent_emoji}  " if _agent_emoji else ""
                _ready_line = ""
                if _spec and _spec.description:
                    _desc_line = _spec.description.strip().split("\n")[0]
                    if len(_desc_line) > 90:
                        _desc_line = _desc_line[:87].rstrip() + "..."
                    _ready_line = f" - {_desc_line}"

                # Capability summary appended to the same confirmation line.
                # Prefer the ACTUAL running state reported by /health/startup
                # (mcp servers / skills started via CLI flags or catalog are not
                # in the static spec), falling back to the spec when unavailable.
                _agent_info = (startup_info or {}).get("agent", {}) or {}
                _sandbox_info = (startup_info or {}).get("sandbox", {}) or {}

                _mcp_list = _agent_info.get("mcp_servers")
                if _mcp_list is None and _spec is not None:
                    _mcp_list = [
                        getattr(m, "id", m)
                        for m in (getattr(_spec, "mcp_servers", []) or [])
                    ]
                _mcp_count = len(_mcp_list or [])

                _skill_list = _agent_info.get("skills")
                if _skill_list is None and _spec is not None:
                    _skill_list = list(getattr(_spec, "skills", []) or [])
                _skill_count = len(_skill_list or [])

                _sandbox_variant = _sandbox_info.get("variant")
                if not _sandbox_variant and _spec is not None:
                    _sandbox_variant = getattr(_spec, "sandbox_variant", None)

                _codemode_on = bool(_agent_info.get("codemode"))
                if not _codemode_on and _spec is not None:
                    _codemode = getattr(_spec, "codemode", None)
                    _codemode_on = bool(
                        _codemode.get("enabled")
                        if isinstance(_codemode, dict)
                        else _codemode
                    )

                _summary_parts: list[str] = [
                    f"{_mcp_count} MCP server{'s' if _mcp_count != 1 else ''}"
                ]
                if _skill_count:
                    _summary_parts.append(
                        f"{_skill_count} skill{'s' if _skill_count != 1 else ''}"
                    )
                if str(_sandbox_variant or "").lower() == "jupyter-server":
                    _summary_parts.append("Jupyter sandbox")
                if _codemode_on and not codemode_disabled:
                    _summary_parts.append("Code Mode")
                _summary_line = (
                    f" {GRAY}({' • '.join(_summary_parts)}){RESET}"
                    if _summary_parts
                    else ""
                )
                startup_message = (
                    f"{GREEN_MEDIUM}●{RESET} {BOLD}{WHITE}Agent {RESET}{GREEN_LIGHT}{_agent_prefix}{_agent_label}{RESET}"
                    f"{BOLD}{WHITE} is started and ready{RESET}"
                    f"{GRAY}{_ready_line}{RESET}"
                    f"{_summary_line}"
                )

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

                url = (
                    f"http://127.0.0.1:{actual_port}/api/v1/ag-ui/{runtime_agent_name}/"
                )
                server_url = f"http://127.0.0.1:{actual_port}"

                try:
                    # Use Rich-based TUX
                    from .tux import run_tux

                    asyncio.run(
                        run_tux(
                            url,
                            server_url,
                            agent_id=runtime_agent_name,
                            eggs=eggs,
                            jupyter_url=jupyter_url,
                            extra_suggestions=extra_suggestions,
                            startup_message=startup_message,
                            where=cloud_launch.label if cloud_launch else None,
                        )
                    )
                finally:
                    if cloud_launch is not None:
                        from agent_runtimes.loop.launch import finish_cloud

                        finish_cloud(cloud_launch, keep=keep)
                    else:
                        _cleanup_subprocess_with_spinner("Terminating agent...")
            else:
                # Fall back to local agent
                agent.to_cli_sync(prog_name="agent-runtimes chat")

    except typer.Exit:
        _cleanup_subprocess()
        raise
    except KeyboardInterrupt:
        _cleanup_subprocess()
        print_goodbye()
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
    """ShowLoop assistant version information."""
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

        loop connect http://localhost:8000/api/v1/ag-ui/my-agent/

        loop connect ws://localhost:8000/api/v1/acp/ws/my-agent -t acp

        loop connect https://agent.datalayer.ai/api/v1/ag-ui/chat/
    """
    try:
        from agent_runtimes.transports.clients import ACPClient, AGUIClient
    except ImportError:
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
                        print_goodbye()
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
                    print_goodbye()
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
                        print_goodbye()
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
                    print_goodbye()
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

        loop agents

        loop agents --server https://agents.datalayer.ai
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
