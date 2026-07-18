# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Execution application for running code in Datalayer code sandboxes."""

from __future__ import annotations

import json
import signal
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
from uuid import uuid4

import typer
from datalayer_core.utils.defaults import DEFAULT_ENVIRONMENT
from datalayer_core.utils.network import fetch
from rich.console import Console
from rich.table import Table

from agent_runtimes.client import AgentClient
from agent_runtimes.console.manager import RuntimeManager
from agent_runtimes.utils.notebook import get_cells

# Create the main Typer app for exec functionality
app = typer.Typer(
    name="exec",
    help="Execute files or notebooks on code sandboxes",
    invoke_without_command=True,
)

console = Console()

KERNEL_READY_TIMEOUT_SECONDS = 20.0
KERNEL_PROBE_TIMEOUT_SECONDS = 20.0
DEFAULT_EXEC_TIMEOUT_SECONDS = 10.0


@app.callback()
def exec_callback(ctx: typer.Context) -> None:
    """Execute files or notebooks on code sandboxes."""
    if ctx.invoked_subcommand is None:
        typer.echo(ctx.get_help())


class CodeSandboxExecService:
    """Service for executing files on Datalayer code sandboxes."""

    def __init__(self, token: Optional[str] = None) -> None:
        """Initialize the exec service."""
        self.kernel_manager: Optional[RuntimeManager] = None
        self.kernel_client = None
        self._executing = False
        self._client = AgentClient(api_key=token)

    def handle_sigint(self, *args: Any) -> None:
        """Handle SIGINT signal during kernel execution."""
        if self._executing:
            if self.kernel_manager:
                self.kernel_manager.interrupt_kernel()
            else:
                console.print(
                    "[red]ERROR: Cannot interrupt kernels we didn't start.[/red]",
                    file=sys.stderr,
                )
        else:
            # raise the KeyboardInterrupt if we aren't waiting for execution,
            # so that the interact loop advances, and prompt is redrawn, etc.
            raise KeyboardInterrupt

    def init_kernel_manager(self, sandbox_name: str) -> None:
        """Initialize the kernel manager and connect to a code sandbox."""
        max_attempts = 2
        last_error: Exception | None = None
        # Set up signal handler once.
        signal.signal(signal.SIGINT, self.handle_sigint)

        for attempt in range(1, max_attempts + 1):
            try:
                # Validate sandbox only when explicitly provided.
                # Empty sandbox name delegates selection/creation to RuntimeManager.start_kernel.
                if sandbox_name:
                    runtimes = self._client.list_runtimes()
                    target_sandbox = None

                    for runtime in runtimes:
                        if runtime.name == sandbox_name or runtime.uid == sandbox_name:
                            target_sandbox = runtime
                            break

                    if target_sandbox is None:
                        raise RuntimeError(f"Code sandbox '{sandbox_name}' not found")

                # Get token using the same method as AgentClient
                token = self._client._get_api_key()

                # Create a RuntimeManager with proper credentials
                self.kernel_manager = RuntimeManager(
                    datalayer_url=self._client.urls.datalayer_url,
                    token=token or "",
                    username="",  # Username is not required for token-based auth
                )

                # Start kernel and get client
                self.kernel_manager.start_kernel(name=sandbox_name or "")

                if bool(
                    getattr(self.kernel_manager, "runtime_created_in_start", False)
                ):
                    self._inspect_created_code_sandbox_kernels()

                self.kernel_client = self.kernel_manager.client

                if not self.kernel_client:
                    raise RuntimeError("Failed to create kernel client")

                self.kernel_client.start_channels()
                # Fresh runtimes can report healthy before the kernel channels are
                # fully ready for requests. Wait explicitly to avoid hanging on
                # the first execute call.
                self.kernel_client.wait_for_ready(timeout=KERNEL_READY_TIMEOUT_SECONDS)
                self._probe_kernel_execution()
                manager_runtime_name = str(
                    getattr(self.kernel_manager, "runtime_name", "")
                    or sandbox_name
                    or "auto-selected"
                )
                manager_runtime_uid = str(
                    getattr(self.kernel_manager, "runtime_uid", "") or ""
                )
                manager_kernel_id = str(
                    getattr(self.kernel_manager, "_kernel_id", "") or ""
                )
                if manager_runtime_uid or manager_kernel_id:
                    runtime_ref = f"{manager_runtime_uid}#{manager_kernel_id}".strip(
                        "#"
                    )
                    console.print(
                        f"[green]Connected to code sandbox: {manager_runtime_name} ({runtime_ref})[/green]"
                    )
                else:
                    console.print(
                        f"[green]Connected to code sandbox: {sandbox_name or 'auto-selected'}[/green]"
                    )
                return
            except Exception as e:
                last_error = e
                self.cleanup()
                self.kernel_manager = None
                self.kernel_client = None
                if attempt < max_attempts:
                    console.print(
                        "[yellow]Kernel not ready yet, retrying connection...[/yellow]"
                    )
                    time.sleep(1.5 * attempt)
                    continue
                break

        if last_error is None:
            last_error = RuntimeError("Unknown code sandbox initialization failure")

        final_error = last_error
        try:
            console.print(
                f"[red]Failed to connect to code sandbox '{sandbox_name}': {final_error}[/red]"
            )

            # Provide helpful authentication guidance
            if (
                "Token is required" in str(final_error)
                or "authentication" in str(final_error).lower()
            ):
                console.print(
                    "[yellow]Hint: Make sure you're authenticated. You can:[/yellow]"
                )
                console.print("[yellow]  1. Run 'dla login' to authenticate[/yellow]")
                console.print(
                    "[yellow]  2. Set DATALAYER_API_KEY environment variable[/yellow]"
                )
                console.print("[yellow]  3. Use --api-key option if available[/yellow]")
        finally:
            raise typer.Exit(1)

    def _inspect_created_code_sandbox_kernels(self) -> None:
        """Inspect kernels after sandbox auto-creation and fail fast when count != 1."""
        if not self.kernel_manager:
            raise RuntimeError("Code sandbox manager is not initialized")

        server_url = str(getattr(self.kernel_manager, "server_url", "") or "").rstrip(
            "/"
        )
        sandbox_token = str(getattr(self.kernel_manager, "token", "") or "")
        sandbox_name = str(getattr(self.kernel_manager, "runtime_name", "") or "")
        sandbox_uid = str(getattr(self.kernel_manager, "runtime_uid", "") or "")
        sandbox_pod = str(getattr(self.kernel_manager, "runtime_pod_name", "") or "")

        response = fetch(f"{server_url}/api/kernels", token=sandbox_token, timeout=15)
        kernels = response.json() if response.content else []
        if not isinstance(kernels, list):
            kernels = []

        summary = Table(title="Code Sandbox Inspection (auto-created by exec)")
        summary.add_column("Field", style="cyan")
        summary.add_column("Value")
        summary.add_row("Code Sandbox", sandbox_name or sandbox_pod)
        summary.add_row("Pod", sandbox_pod)
        summary.add_row("UID", sandbox_uid)
        summary.add_row("Ingress", server_url)
        summary.add_row("Kernels", str(len(kernels)))
        console.print(summary)

        code_sandboxes_table = Table(title="Available Code Sandboxes")
        code_sandboxes_table.add_column("ID", style="green")
        code_sandboxes_table.add_column("Name")
        code_sandboxes_table.add_column("State")
        code_sandboxes_table.add_column("Connections")
        code_sandboxes_table.add_column("Last Activity")
        for kernel in kernels:
            code_sandboxes_table.add_row(
                str((kernel or {}).get("id") or ""),
                str((kernel or {}).get("name") or ""),
                str((kernel or {}).get("execution_state") or ""),
                str((kernel or {}).get("connections") or "0"),
                str((kernel or {}).get("last_activity") or ""),
            )
        if kernels:
            console.print(code_sandboxes_table)

        if len(kernels) != 1:
            raise RuntimeError(
                f"Auto-created code sandbox expected exactly one kernel, found {len(kernels)}"
            )

    def _probe_kernel_execution(self) -> None:
        """Validate the kernel can execute a trivial statement before running user code."""
        if not self.kernel_client:
            raise RuntimeError("Kernel client not initialized")

        def _noop_output_hook(msg: dict[str, Any]) -> None:
            # A stream-based probe validates the same IOPub path used by cells.
            _ = msg

        self.kernel_client.execute_interactive(
            "print('__datalayer_probe__')",
            silent=False,
            timeout=KERNEL_PROBE_TIMEOUT_SECONDS,
            output_hook=_noop_output_hook,
        )

    def execute_file(
        self,
        filepath: Path,
        silent: bool = True,
        timeout: Optional[float] = None,
        raise_exceptions: bool = False,
    ) -> dict[str, Any]:
        """
        Execute a file or notebook on the connected code sandbox.

        Parameters
        ----------
        filepath : Path
            Path to the file to execute.
        silent : bool
            Whether to suppress cell output.
        timeout : Optional[float]
            Execution timeout for each cell.
        raise_exceptions : bool
            Whether to stop on exceptions.
        """
        if not self.kernel_client:
            raise RuntimeError("Kernel client not initialized")

        report: dict[str, Any] = {
            "input_file": str(filepath),
            "cells": [],
        }

        try:
            self._executing = True
            console.print(f"[blue]Executing file: {filepath}[/blue]")

            # Guardrail: ensure the selected code sandbox endpoint is reachable
            # before submitting any execute requests.
            self._assert_code_sandbox_alive()
            self._prepare_kernel_before_execution()

            # Get cells from the file
            cells = list(get_cells(filepath))

            if not cells:
                console.print("[yellow]No executable cells found in file[/yellow]")
                return report

            total_cells = len(cells)
            console.print(f"[blue]Found {total_cells} cell(s) to execute[/blue]")
            failed_cells = 0
            effective_timeout = (
                float(timeout) if timeout is not None else DEFAULT_EXEC_TIMEOUT_SECONDS
            )

            # Execute each cell
            for i, (cell_id, cell_source) in enumerate(cells, 1):
                if not cell_source.strip():
                    continue

                console.print(f"[blue]Executing cell {i}/{total_cells}...[/blue]")
                self._print_cell_source(i, cell_source)
                captured_outputs: list[dict[str, Any]] = []

                def output_hook(msg: dict[str, Any]) -> None:
                    msg_type = str(msg.get("msg_type") or "")
                    content = msg.get("content") or {}

                    if msg_type == "stream":
                        captured_outputs.append(
                            {
                                "output_type": "stream",
                                "name": content.get("name", "stdout"),
                                "text": content.get("text", ""),
                            }
                        )
                        return

                    if msg_type in {"display_data", "execute_result"}:
                        data = content.get("data") or {}
                        captured_outputs.append(
                            {
                                "output_type": msg_type,
                                "data": data,
                                "metadata": content.get("metadata") or {},
                                "execution_count": content.get("execution_count"),
                            }
                        )
                        return

                    if msg_type == "error":
                        captured_outputs.append(
                            {
                                "output_type": "error",
                                "ename": content.get("ename"),
                                "evalue": content.get("evalue"),
                                "traceback": content.get("traceback") or [],
                            }
                        )

                cell_report: dict[str, Any] = {
                    "cell_index": i,
                    "cell_id": cell_id,
                    "status": "ok",
                    "outputs": captured_outputs,
                }

                try:
                    try:
                        reply = self.kernel_client.execute_interactive(
                            cell_source,
                            silent=silent,
                            timeout=effective_timeout,
                            output_hook=output_hook,
                        )
                    except TypeError:
                        # Backward compatibility when output_hook is not available.
                        reply = self.kernel_client.execute_interactive(
                            cell_source,
                            silent=silent,
                            timeout=effective_timeout,
                        )

                    cell_report["reply"] = (
                        reply.get("content") if isinstance(reply, dict) else {}
                    )

                    if raise_exceptions and reply["content"]["status"] != "ok":
                        content = reply["content"]
                        if content["status"] == "error":
                            if cell_id:
                                console.print(
                                    f"[red]Exception when running cell {cell_id}[/red]"
                                )
                            console.print(
                                "[red]" + "\n".join(content["traceback"]) + "[/red]"
                            )
                            raise typer.Exit(1)
                        else:
                            raise RuntimeError(
                                f"Unknown failure: {json.dumps(content)}"
                            )

                    self._print_cell_outputs(i, captured_outputs)

                    # Show success for each cell if not silent
                    if not silent:
                        status = reply["content"]["status"]
                        if status == "ok":
                            console.print(
                                f"[green]✓ Cell {i} executed successfully[/green]"
                            )
                        else:
                            console.print(
                                f"[yellow]⚠ Cell {i} completed with status: {status}[/yellow]"
                            )

                    if reply["content"].get("status") != "ok":
                        cell_report["status"] = str(
                            reply["content"].get("status") or "error"
                        )
                        failed_cells += 1

                except Exception as e:
                    if raise_exceptions:
                        raise
                    failed_cells += 1
                    cell_report["status"] = "error"
                    cell_report["error"] = str(e)
                    console.print(f"[yellow]Warning: Cell {i} failed: {e}[/yellow]")
                finally:
                    report["cells"].append(cell_report)

            if failed_cells > 0:
                console.print(
                    f"[red]Execution completed with {failed_cells} failed cell(s).[/red]"
                )
                report["failed_cells"] = failed_cells
                report["success"] = False
            else:
                console.print("[green]✓ Execution completed successfully[/green]")
                report["failed_cells"] = 0
                report["success"] = True
            return report

        except typer.Exit:
            raise
        except Exception as e:
            if raise_exceptions:
                raise
            console.print(f"[red]Error executing file: {e}[/red]")
            raise typer.Exit(1)
        finally:
            self._executing = False

    def _print_cell_outputs(
        self, cell_index: int, outputs: list[dict[str, Any]]
    ) -> None:
        """Print collected outputs for a cell after execution."""
        if not outputs:
            console.print(f"[dim]Cell {cell_index} output: (no output)[/dim]")
            return

        console.print(f"[cyan]Cell {cell_index} output:[/cyan]")
        for output in outputs:
            output_type = str(output.get("output_type") or "")
            if output_type == "stream":
                text = str(output.get("text") or "").rstrip("\n")
                if text:
                    console.print(text)
                continue

            if output_type in {"display_data", "execute_result"}:
                data = output.get("data") or {}
                text_plain = ""
                if isinstance(data, dict):
                    text_plain = str(data.get("text/plain") or "").rstrip("\n")
                if text_plain:
                    console.print(text_plain)
                else:
                    console.print(json.dumps(output, ensure_ascii=False))
                continue

            if output_type == "error":
                traceback = output.get("traceback") or []
                if traceback:
                    console.print(
                        "[red]" + "\n".join(str(line) for line in traceback) + "[/red]"
                    )
                else:
                    ename = str(output.get("ename") or "Error")
                    evalue = str(output.get("evalue") or "")
                    console.print(f"[red]{ename}: {evalue}[/red]")
                continue

            console.print(json.dumps(output, ensure_ascii=False))

    def _print_cell_source(self, cell_index: int, source: str) -> None:
        """Print the source code that will be sent to the kernel for execution."""
        console.print(f"[cyan]Cell {cell_index} source:[/cyan]")
        console.print("[dim]<code>[/dim]")
        console.print(source.rstrip("\n"))
        console.print("[dim]</code>[/dim]")

    def _assert_code_sandbox_alive(self) -> None:
        """Fail early when the selected code sandbox endpoint is not reachable."""
        if not self.kernel_manager:
            raise RuntimeError("Code sandbox manager is not initialized")

        server_url = str(getattr(self.kernel_manager, "server_url", "") or "").rstrip(
            "/"
        )
        sandbox_token = str(getattr(self.kernel_manager, "token", "") or "")
        if not server_url:
            raise RuntimeError("Code sandbox endpoint is not available")

        attempts = 5
        last_error: Exception | None = None
        for attempt in range(1, attempts + 1):
            try:
                fetch(f"{server_url}/api/kernels", token=sandbox_token, timeout=15)
                return
            except Exception as e:
                last_error = e
                if attempt < attempts:
                    time.sleep(0.4 * attempt)
                    continue
                break

        raise RuntimeError(
            f"Code sandbox health check failed for '{server_url}': {last_error}"
        ) from last_error

    def _prepare_kernel_before_execution(self) -> None:
        """List kernels visible on the code sandbox before execution starts."""
        kernels = self._fetch_code_sandbox_kernels()
        self._print_available_kernels(
            title="Kernels available before execution:",
            kernels=kernels,
        )

    def _fetch_code_sandbox_kernels(self) -> list[dict[str, Any]]:
        """Fetch kernels from the current code sandbox."""
        if not self.kernel_manager:
            return []

        server_url = str(getattr(self.kernel_manager, "server_url", "") or "").rstrip(
            "/"
        )
        sandbox_token = str(getattr(self.kernel_manager, "token", "") or "")
        if not server_url:
            return []

        response = fetch(f"{server_url}/api/kernels", token=sandbox_token, timeout=15)
        kernels = response.json() if response.content else []
        if not isinstance(kernels, list):
            return []
        return [kernel for kernel in kernels if isinstance(kernel, dict)]

    def _print_available_kernels(
        self,
        title: str,
        kernels: list[dict[str, Any]],
    ) -> None:
        """Print kernels currently visible on the code sandbox."""
        selected_kernel_id = str(getattr(self.kernel_manager, "_kernel_id", "") or "")

        if not kernels:
            console.print(f"[yellow]{title} none[/yellow]")
            return

        console.print(f"[blue]{title}[/blue]")
        for kernel in sorted(
            kernels,
            key=lambda kernel: str((kernel or {}).get("id") or ""),
        ):
            kernel_id = str((kernel or {}).get("id") or "")
            kernel_name = str((kernel or {}).get("name") or "")
            execution_state = str((kernel or {}).get("execution_state") or "")
            connections = (kernel or {}).get("connections")
            last_activity = str((kernel or {}).get("last_activity") or "")
            marker = (
                "*" if selected_kernel_id and kernel_id == selected_kernel_id else " "
            )
            console.print(
                f"  [{marker}] id={kernel_id} name={kernel_name} state={execution_state} connections={connections} last_activity={last_activity}"
            )

    def cleanup(self) -> None:
        """Clean up resources."""
        if self.kernel_client:
            try:
                self.kernel_client.stop_channels()
            except Exception as e:
                console.print(f"[yellow]Warning during cleanup: {e}[/yellow]")


# Main execution function decorated as the default command
@app.command()
def main(
    filename: Optional[str] = typer.Argument(
        None,
        help="Path to the file or notebook to execute",
    ),
    sandbox: Optional[str] = typer.Option(
        None,
        "--sandbox",
        "-s",
        help="Name of the code sandbox to execute on (uses first available if not specified)",
    ),
    verbose: bool = typer.Option(
        False, "--verbose", "-v", help="Show all cell outputs"
    ),
    timeout: Optional[float] = typer.Option(
        None,
        "--timeout",
        "-t",
        help="Execution timeout for each cell in seconds",
    ),
    raise_exceptions: bool = typer.Option(
        False, "--raise", help="Stop executing if an exception occurs"
    ),
    token: Optional[str] = typer.Option(
        None,
        "--api-key",
        help="API key (Bearer token for API requests).",
    ),
    example_notebook: bool = typer.Option(
        False,
        "--example-notebook",
        help="Create a temporary example notebook, execute it, then remove it.",
    ),
    example_py: bool = typer.Option(
        False,
        "--example-py",
        help="Create a temporary example Python file, execute it, then remove it.",
    ),
    output_name: Optional[str] = typer.Option(
        None,
        "--output-name",
        help="Output report filename/path. Defaults to <input-name>.out.json next to the input file.",
    ),
) -> None:
    """Execute a Python file or Jupyter notebook on a Datalayer code sandbox."""

    auth_token = token

    if example_notebook and example_py:
        console.print(
            "[red]Error: --example-notebook and --example-py are mutually exclusive[/red]"
        )
        raise typer.Exit(1)

    if filename and (example_notebook or example_py):
        console.print(
            "[red]Error: provide either a filename or one --example-* flag, not both[/red]"
        )
        raise typer.Exit(1)

    if not filename and not example_notebook and not example_py:
        console.print("[red]Error: missing FILE_PATH or an --example-* option[/red]")
        raise typer.Exit(1)

    generated_example = False
    filepath: Path
    if example_notebook:
        filepath = _create_example_notebook_file()
        generated_example = True
        console.print(f"[blue]Generated example notebook: {filepath}[/blue]")
    elif example_py:
        filepath = _create_example_python_file()
        generated_example = True
        console.print(f"[blue]Generated example Python file: {filepath}[/blue]")
    else:
        # Resolve file path
        filepath = Path(str(filename)).expanduser().resolve()

    try:
        # Check if file exists and is readable
        if not filepath.exists():
            console.print(f"[red]Error: File '{filepath}' does not exist[/red]")
            raise typer.Exit(1)

        if not filepath.is_file():
            console.print(f"[red]Error: '{filepath}' is not a file[/red]")
            raise typer.Exit(1)

        try:
            with filepath.open("rb"):
                pass
        except Exception as e:
            console.print(
                f"[red]Error: Could not open file '{filepath}' for reading: {e}[/red]"
            )
            raise typer.Exit(1)

        # Check file extension
        if filepath.suffix not in [".py", ".ipynb"]:
            console.print(
                f"[yellow]Warning: File extension '{filepath.suffix}' is not .py or .ipynb[/yellow]"
            )

        # Determine which code sandbox to use
        selected_sandbox = sandbox
        if selected_sandbox is None:
            selected_sandbox = _select_code_sandbox(token=auth_token)

        # Create exec service and execute
        exec_service = CodeSandboxExecService(token=auth_token)

        try:
            # Initialize connection to code sandbox
            exec_service.init_kernel_manager(selected_sandbox)

            # Execute the file
            execution_report = exec_service.execute_file(
                filepath=filepath,
                silent=not verbose,
                timeout=timeout,
                raise_exceptions=raise_exceptions,
            )

            report_path = _resolve_output_report_path(filepath, output_name)
            execution_report["output_file"] = str(report_path)
            report_path.write_text(
                json.dumps(execution_report, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )
            console.print(f"[green]Saved execution outputs: {report_path}[/green]")
            console.print(
                f"[green]Full output report path: {report_path.resolve()}[/green]"
            )
            if int(execution_report.get("failed_cells") or 0) > 0:
                raise typer.Exit(1)

        finally:
            # Always cleanup
            exec_service.cleanup()
    finally:
        if generated_example:
            try:
                filepath.unlink(missing_ok=True)
            except Exception as e:
                console.print(
                    f"[yellow]Warning: could not remove temporary example file '{filepath}': {e}[/yellow]"
                )


def _example_file_path(suffix: str) -> Path:
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    name = f"datalayer-exec-example-{ts}-{uuid4().hex[:8]}{suffix}"
    return Path(tempfile.gettempdir()) / name


def _create_example_python_file() -> Path:
    path = _example_file_path(".py")
    path.write_text(
        "import json\n"
        "import pandas as pd\n\n"
        "pd.set_option('display.max_rows', None)\n"
        "pd.set_option('display.max_columns', None)\n"
        "pd.set_option('display.width', None)\n\n"
        "print('Python example: building sample sales dataframe')\n"
        "df = pd.DataFrame({\n"
        "    'day': ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],\n"
        "    'region': ['north', 'north', 'south', 'south', 'west', 'west'],\n"
        "    'orders': [12, 14, 8, 11, 9, 15],\n"
        "    'revenue': [240, 310, 175, 220, 190, 360],\n"
        "})\n\n"
        "print('DataFrame:')\n"
        "print(df.to_string(index=False))\n\n"
        "print('Grouped summary by region:')\n"
        "summary = (\n"
        "    df.groupby('region', as_index=False)\n"
        "      .agg(total_orders=('orders', 'sum'), total_revenue=('revenue', 'sum'))\n"
        "      .sort_values('total_revenue', ascending=False)\n"
        ")\n"
        "print(summary.to_string(index=False))\n\n"
        "payload = {\n"
        "    'rows': int(len(df)),\n"
        "    'best_region': str(summary.iloc[0]['region']),\n"
        "    'total_revenue': int(df['revenue'].sum()),\n"
        "}\n"
        "print('JSON summary:')\n"
        "print(json.dumps(payload, indent=2))\n",
        encoding="utf-8",
    )
    return path


def _create_example_notebook_file() -> Path:
    path = _example_file_path(".ipynb")
    notebook_payload = {
        "cells": [
            {
                "id": f"cell-{uuid4().hex[:8]}",
                "cell_type": "code",
                "execution_count": None,
                "metadata": {"id": f"cell-{uuid4().hex[:8]}", "language": "python"},
                "outputs": [],
                "source": [
                    "import pandas as pd\n",
                    "pd.set_option('display.max_rows', None)\n",
                    "pd.set_option('display.max_columns', None)\n",
                    "pd.set_option('display.width', None)\n",
                    "print('Notebook example: pandas setup complete')\n",
                ],
            },
            {
                "id": f"cell-{uuid4().hex[:8]}",
                "cell_type": "code",
                "execution_count": None,
                "metadata": {"id": f"cell-{uuid4().hex[:8]}", "language": "python"},
                "outputs": [],
                "source": [
                    "df = pd.DataFrame({\n",
                    "    'day': ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],\n",
                    "    'region': ['north', 'north', 'south', 'south', 'west', 'west'],\n",
                    "    'orders': [12, 14, 8, 11, 9, 15],\n",
                    "    'revenue': [240, 310, 175, 220, 190, 360],\n",
                    "})\n",
                    "print('Raw dataframe:')\n",
                    "print(df.to_string(index=False))\n",
                ],
            },
            {
                "id": f"cell-{uuid4().hex[:8]}",
                "cell_type": "code",
                "execution_count": None,
                "metadata": {"id": f"cell-{uuid4().hex[:8]}", "language": "python"},
                "outputs": [],
                "source": [
                    "summary = (\n",
                    "    df.groupby('region', as_index=False)\n",
                    "      .agg(total_orders=('orders', 'sum'), total_revenue=('revenue', 'sum'))\n",
                    "      .sort_values('total_revenue', ascending=False)\n",
                    ")\n",
                    "print('Revenue summary by region:')\n",
                    "print(summary.to_string(index=False))\n",
                    "print('Top region:', summary.iloc[0]['region'])\n",
                ],
            },
        ],
        "metadata": {},
        "nbformat": 4,
        "nbformat_minor": 5,
    }
    path.write_text(json.dumps(notebook_payload), encoding="utf-8")
    return path


def _resolve_output_report_path(filepath: Path, output_name: Optional[str]) -> Path:
    """Compute output report path for collected execution outputs."""
    if output_name:
        candidate = Path(output_name).expanduser()
        if candidate.is_absolute():
            return candidate
        return filepath.parent / candidate

    # notebook-name.ipynb -> notebook-name.out.json
    # script.py -> script.out.json
    return filepath.with_suffix(".out.json")


def _select_code_sandbox(token: Optional[str] = None) -> str:
    """
    Select a code sandbox to use for execution.

    Returns the first available code sandbox, or interactively provisions one when
    no code sandbox is available.

    Parameters
    ----------
    token : Optional[str]
        Authentication token for API requests.

    Returns
    -------
    str
        The name/ID of the code sandbox to use.
    """
    try:
        client = AgentClient(api_key=token)
        runtimes = client.list_runtimes()

        if not runtimes:
            console.print("[yellow]No code sandbox is running.[/yellow]")

            should_create = typer.confirm(
                "No code sandbox is available. Create one now?",
                default=True,
            )
            if not should_create:
                console.print("[red]Execution aborted: no code sandbox selected.[/red]")
                raise typer.Exit(1)

            environment = DEFAULT_ENVIRONMENT
            burn_rate = _get_environment_burning_rate(client, environment)
            remaining_credits = _get_remaining_credits_after_reservations(client)
            default_seconds = _default_code_sandbox_seconds(
                remaining_credits=remaining_credits,
                burn_rate=burn_rate,
            )

            console.print(
                f"[blue]Environment: {environment} (burning_rate={burn_rate:.6f} credits/s)[/blue]"
            )
            console.print(
                f"[blue]Remaining credits (after reservations): {remaining_credits:.6f}[/blue]"
            )
            console.print(
                f"[blue]Suggested code sandbox duration: {default_seconds:.2f} seconds (33% of remaining credits)[/blue]"
            )

            requested_seconds = typer.prompt(
                "Code sandbox duration in seconds",
                type=float,
                default=default_seconds,
                show_default=True,
            )
            if requested_seconds <= 0:
                console.print(
                    "[red]Code sandbox duration must be greater than 0 seconds.[/red]"
                )
                raise typer.Exit(1)

            requested_credits = burn_rate * requested_seconds
            time_reservation_minutes = requested_seconds / 60.0
            console.print(
                f"[blue]Requested reservation: {requested_seconds:.2f}s -> {requested_credits:.6f} credits[/blue]"
            )

            created_runtime = client.create_runtime(
                environment=environment,
                time_reservation=time_reservation_minutes,
            )

            sandbox_name = str(created_runtime.name or "")
            sandbox_uid = str(created_runtime.uid or "")
            sandbox_pod = str(created_runtime.pod_name or "")
            sandbox_ingress = str(created_runtime.ingress or "").rstrip("/")
            sandbox_token = str(
                created_runtime.jupyter_token or client._get_api_key() or ""
            )

            if not sandbox_ingress or not sandbox_token:
                console.print(
                    "[red]Code sandbox created but ingress/token is not available for inspection.[/red]"
                )
                raise typer.Exit(1)

            pre_confirm_kernel_id = _inspect_code_sandbox_kernels_unique(
                sandbox_name=sandbox_name or sandbox_pod or sandbox_uid,
                sandbox_uid=sandbox_uid,
                sandbox_pod=sandbox_pod,
                sandbox_ingress=sandbox_ingress,
                sandbox_token=sandbox_token,
                inspection_label="post-create",
            )

            proceed = typer.confirm(
                "Proceed with execution on this code sandbox?",
                default=True,
            )
            if not proceed:
                console.print("[red]Execution aborted by user.[/red]")
                raise typer.Exit(1)

            post_confirm_kernel_id = _inspect_code_sandbox_kernels_unique(
                sandbox_name=sandbox_name or sandbox_pod or sandbox_uid,
                sandbox_uid=sandbox_uid,
                sandbox_pod=sandbox_pod,
                sandbox_ingress=sandbox_ingress,
                sandbox_token=sandbox_token,
                inspection_label="pre-exec confirmation",
            )

            if post_confirm_kernel_id != pre_confirm_kernel_id:
                console.print(
                    "[red]Kernel changed between inspections. Failing fast before execution.[/red]"
                )
                raise typer.Exit(1)

            selected_name = sandbox_uid or sandbox_name or sandbox_pod
            if not selected_name:
                console.print(
                    "[red]Code sandbox created but no code sandbox identifier is available.[/red]"
                )
                raise typer.Exit(1)

            console.print(
                f"[green]Using newly created code sandbox: {selected_name}#{post_confirm_kernel_id}[/green]"
            )
            return selected_name

        # Use the first available code sandbox
        selected = runtimes[0]
        sandbox_uid = str(selected.uid or "")
        kernel_id = ""
        try:
            runtime_token = str(
                getattr(selected, "jupyter_token", "") or client._get_api_key() or ""
            )
            ingress = str(getattr(selected, "ingress", "") or "").rstrip("/")
            if ingress and runtime_token:
                response = fetch(
                    f"{ingress}/api/kernels", token=runtime_token, timeout=10
                )
                kernels = response.json() if response.content else []
                if isinstance(kernels, list) and kernels:
                    ordered = sorted(
                        (str((kernel or {}).get("id") or "") for kernel in kernels)
                    )
                    kernel_id = ordered[0] if ordered else ""
        except Exception:
            kernel_id = ""

        sandbox_ref = sandbox_uid
        if sandbox_uid and kernel_id:
            sandbox_ref = f"{sandbox_uid}#{kernel_id}"

        console.print(
            f"[blue]No code sandbox specified, using: {selected.name} ({sandbox_ref})[/blue]"
        )
        return selected.name or selected.uid or ""

    except typer.Exit:
        # Re-raise typer.Exit without modification
        raise
    except Exception as e:
        console.print(f"[red]Error checking available code sandboxes: {e}[/red]")
        console.print(
            "[yellow]Hint: Make sure you're authenticated with 'dla login'[/yellow]"
        )
        raise typer.Exit(1)


def _get_environment_burning_rate(client: AgentClient, environment: str) -> float:
    """Get environment burning rate in credits/second."""
    environments = client.list_environments()
    for env in environments:
        if str(env.name or "") == environment:
            burn_rate = float(env.burning_rate or 0.0)
            if burn_rate <= 0:
                raise RuntimeError(
                    f"Environment '{environment}' has invalid burning rate: {burn_rate}"
                )
            return burn_rate
    raise RuntimeError(
        f"Environment '{environment}' not found. Available environments: {[str(env.name or '') for env in environments]}"
    )


def _to_float(value: Any, default: float = 0.0) -> float:
    """Safely parse a float-like value."""
    try:
        if value is None:
            return default
        return float(value)
    except Exception:
        return default


def _get_remaining_credits_after_reservations(client: AgentClient) -> float:
    """Compute remaining credits after reservations from usage payload."""
    usage = client.get_usage_credits()
    if not usage.get("success", True):
        raise RuntimeError(
            f"Failed to load usage credits: {usage.get('message', 'Unknown error')}"
        )

    credits = usage.get("credits", {}) or {}
    reservations = usage.get("reservations", []) or []

    credits_value = _to_float(credits.get("credits"), 0.0)
    quota = credits.get("quota")

    if quota is None:
        available_before_reservations = credits_value
    else:
        available_before_reservations = _to_float(quota, 0.0) - credits_value

    reserved_total = 0.0
    for reservation in reservations:
        if not isinstance(reservation, dict):
            continue
        reserved_total += _to_float(reservation.get("credits"), 0.0)

    remaining = available_before_reservations - reserved_total
    return max(0.0, remaining)


def _default_code_sandbox_seconds(remaining_credits: float, burn_rate: float) -> float:
    """Suggest code sandbox duration in seconds using 33% of remaining credits."""
    proposed_credits = max(0.0, remaining_credits * 0.33)
    if burn_rate <= 0:
        raise RuntimeError("Burning rate must be positive to compute duration")
    seconds = proposed_credits / burn_rate
    # Keep a practical positive default even when credits are very low.
    return max(10.0, seconds)


def _inspect_code_sandbox_kernels_unique(
    sandbox_name: str,
    sandbox_uid: str,
    sandbox_pod: str,
    sandbox_ingress: str,
    sandbox_token: str,
    inspection_label: str,
) -> str:
    """Inspect code sandbox kernels and return the unique kernel id.

    Fails fast if the code sandbox does not expose exactly one kernel.
    """
    response = fetch(f"{sandbox_ingress}/api/kernels", token=sandbox_token, timeout=15)
    kernels = response.json() if response.content else []
    if not isinstance(kernels, list):
        kernels = []

    summary = Table(title=f"Code Sandbox Inspection ({inspection_label})")
    summary.add_column("Field", style="cyan")
    summary.add_column("Value")
    summary.add_row("Code Sandbox", sandbox_name)
    summary.add_row("Pod", sandbox_pod)
    summary.add_row("UID", sandbox_uid)
    summary.add_row("Ingress", sandbox_ingress)
    summary.add_row("Code Sandboxes", str(len(kernels)))
    console.print(summary)

    code_sandboxes_table = Table(title="Available Code Sandboxes")
    code_sandboxes_table.add_column("ID", style="green")
    code_sandboxes_table.add_column("Name")
    code_sandboxes_table.add_column("State")
    code_sandboxes_table.add_column("Connections")
    code_sandboxes_table.add_column("Last Activity")
    for kernel in kernels:
        code_sandboxes_table.add_row(
            str((kernel or {}).get("id") or ""),
            str((kernel or {}).get("name") or ""),
            str((kernel or {}).get("execution_state") or ""),
            str((kernel or {}).get("connections") or "0"),
            str((kernel or {}).get("last_activity") or ""),
        )
    if kernels:
        console.print(code_sandboxes_table)

    if len(kernels) != 1:
        raise RuntimeError(
            f"Code sandbox inspection requires exactly one kernel; found {len(kernels)}"
        )

    kernel_id = str((kernels[0] or {}).get("id") or "").strip()
    if not kernel_id:
        raise RuntimeError("Code sandbox inspection returned a kernel without an id")
    return kernel_id


if __name__ == "__main__":
    app()
