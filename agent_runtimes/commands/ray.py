# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Ray commands for Datalayer CLI."""

from __future__ import annotations

import ast
import json
import re
import shlex
import sys
import time
from pathlib import Path
from typing import Any, Optional

import typer
from rich.console import Console
from rich.table import Table

from agent_runtimes.client import AgentClient

app = typer.Typer(
    name="ray",
    help="Manage Ray clusters and Ray jobs through the Datalayer runtimes service.",
    invoke_without_command=True,
)

clusters_app = typer.Typer(
    name="clusters",
    help="Manage Ray clusters.",
    invoke_without_command=True,
)
jobs_app = typer.Typer(
    name="jobs",
    help="Manage Ray jobs.",
    invoke_without_command=True,
)

console = Console()

_ANSI_ESCAPE_RE = re.compile(r"\x1B\[[0-?]*[ -/]*[@-~]")


@app.callback()
def ray_callback(ctx: typer.Context) -> None:
    """Ray management commands."""
    if ctx.invoked_subcommand is None:
        typer.echo(ctx.get_help())


@clusters_app.callback()
def clusters_callback(ctx: typer.Context) -> None:
    """Ray cluster commands."""
    if ctx.invoked_subcommand is None:
        typer.echo(ctx.get_help())


@jobs_app.callback()
def jobs_callback(ctx: typer.Context) -> None:
    """Ray job commands."""
    if ctx.invoked_subcommand is None:
        typer.echo(ctx.get_help())


def _make_client(
    token: Optional[str] = None,
) -> AgentClient:
    return AgentClient(api_key=token)


def _print_json(payload: dict[str, Any]) -> None:
    console.print_json(data=payload)


def _load_json(raw: Optional[str], flag_name: str) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        value = json.loads(raw)
    except Exception as exc:
        raise typer.BadParameter(f"Invalid JSON for {flag_name}: {exc}") from exc
    if not isinstance(value, dict):
        raise typer.BadParameter(f"{flag_name} must decode to a JSON object")
    return value


def _resolve_python_inline(raw: Optional[str]) -> Optional[str]:
    """Resolve inline Python payload, supporting stdin/file references.

    Supported syntaxes for --python-inline/--py:
    - raw source text
    - @-      : read from stdin (supports multiline heredoc pipelines)
    - @<path> : read from local file path
    """
    if raw is None:
        return None

    value = str(raw)
    if value == "@-":
        return sys.stdin.read()

    if value.startswith("@") and len(value) > 1:
        path = Path(value[1:]).expanduser()
        try:
            return path.read_text()
        except Exception as exc:
            raise typer.BadParameter(
                f"Unable to read inline Python source from {path}: {exc}"
            ) from exc

    return value


def _normalize_logs_text(value: Any) -> str:
    """Normalize logs payloads into readable plain text.

    Handles legacy payloads where logs are serialized as Python bytes repr,
    e.g. `b"..."`, and strips ANSI terminal escape sequences.
    """

    if value is None:
        return ""

    text: str
    if isinstance(value, bytes):
        text = value.decode("utf-8", errors="replace")
    else:
        text = str(value)

    stripped = text.strip()
    if stripped.startswith(("b'", 'b"')):
        try:
            literal = ast.literal_eval(stripped)
            if isinstance(literal, bytes):
                text = literal.decode("utf-8", errors="replace")
            else:
                text = str(literal)
        except Exception:
            pass

    text = _ANSI_ESCAPE_RE.sub("", text)
    return text


def _format_scope_label(kind: str, handle: str, uid: str, fallback_kind: str) -> str:
    scope_kind = (kind or fallback_kind).strip()
    scope_handle = (handle or "").strip()
    scope_uid = (uid or "").strip()
    if scope_handle:
        return f"{scope_kind}: @{scope_handle}"
    if scope_uid:
        return f"{scope_kind}: {scope_uid}"
    return ""


@clusters_app.command(name="list")
@clusters_app.command(name="ls")
def clusters_list(
    namespace: str = typer.Option(
        "default", "--namespace", help="Kubernetes namespace."
    ),
    token: Optional[str] = typer.Option(None, "--api-key", help="API key."),
    raw: bool = typer.Option(False, "--raw", help="Print raw JSON."),
) -> None:
    client = _make_client(token=token)
    payload = client.ray_list_clusters(namespace=namespace)
    if raw:
        _print_json(payload)
        return

    items = payload.get("clusters") or []
    table = Table(title=f"Ray Clusters ({len(items)})")
    table.add_column("Name", style="cyan")
    table.add_column("Namespace")
    table.add_column("State")
    table.add_column("Workers")
    table.add_column("Principal")
    table.add_column("Billing")

    for item in items:
        metadata = item.get("metadata") or {}
        status = item.get("status") or {}
        ownership = item.get("ownership") or {}
        desired = status.get("desiredWorkerReplicas")
        available = status.get("availableWorkerReplicas")
        workers = (
            f"{available}/{desired}" if desired is not None else str(available or "")
        )
        principal = _format_scope_label(
            str(item.get("principal_kind") or ownership.get("principal_kind") or ""),
            str(
                item.get("principal_handle") or ownership.get("principal_handle") or ""
            ),
            str(item.get("principal_uid") or ownership.get("principal_uid") or ""),
            "principal",
        )
        billing = _format_scope_label(
            str(
                item.get("billing_entity_kind")
                or ownership.get("billing_entity_kind")
                or ""
            ),
            str(
                item.get("billing_entity_handle")
                or ownership.get("billing_entity_handle")
                or ""
            ),
            str(
                item.get("billing_entity_uid")
                or ownership.get("billing_entity_uid")
                or ""
            ),
            "account",
        )
        table.add_row(
            str(metadata.get("name", "")),
            str(metadata.get("namespace", namespace)),
            str(status.get("state", "")),
            workers,
            principal,
            billing,
        )

    console.print(table)


@clusters_app.command(name="create")
def clusters_create(
    name: str = typer.Argument(..., help="RayCluster name."),
    namespace: str = typer.Option(
        "default", "--namespace", help="Kubernetes namespace."
    ),
    image: str = typer.Option(
        "rayproject/ray:2.38.0", "--image", help="Ray container image."
    ),
    ray_version: str = typer.Option(
        "2.38.0", "--ray-version", help="Ray version in CR spec."
    ),
    worker_replicas: int = typer.Option(1, "--worker-replicas", min=0),
    worker_min_replicas: int = typer.Option(1, "--worker-min-replicas", min=0),
    worker_max_replicas: int = typer.Option(3, "--worker-max-replicas", min=0),
    custom_spec_json: Optional[str] = typer.Option(
        None,
        "--custom-spec-json",
        help="Optional full RayCluster spec JSON object.",
    ),
    token: Optional[str] = typer.Option(None, "--api-key", help="API key."),
) -> None:
    custom_spec = _load_json(custom_spec_json, "--custom-spec-json")
    payload: dict[str, Any] = {
        "name": name,
        "namespace": namespace,
        "image": image,
        "ray_version": ray_version,
        "worker_replicas": worker_replicas,
        "worker_min_replicas": worker_min_replicas,
        "worker_max_replicas": worker_max_replicas,
    }
    if custom_spec:
        payload["custom_spec"] = custom_spec

    client = _make_client(token=token)
    result = client.ray_create_cluster(payload)
    if result.get("success") is False:
        reason = str(
            result.get("message") or result.get("reason") or "Unable to create cluster"
        )
        console.print(f"[red]Cluster creation failed:[/red] {reason}")
        raise typer.Exit(code=1)

    cluster = result.get("cluster") or {}
    metadata = cluster.get("metadata") or {}
    console.print(
        f"[green]Cluster created:[/green] {metadata.get('name', '')} "
        f"(ns={metadata.get('namespace', namespace)})"
    )
    console.print(
        "[dim]Next: agent-runtimes ray clusters ls --namespace {0}[/dim]".format(
            namespace
        )
    )


@clusters_app.command(name="get")
def clusters_get(
    name: str = typer.Argument(..., help="RayCluster name."),
    namespace: str = typer.Option(
        "default", "--namespace", help="Kubernetes namespace."
    ),
    token: Optional[str] = typer.Option(None, "--api-key", help="API key."),
) -> None:
    client = _make_client(token=token)
    payload = client.ray_get_cluster(name, namespace=namespace)
    _print_json(payload)


@clusters_app.command(name="delete")
def clusters_delete(
    name: str = typer.Argument(..., help="RayCluster name."),
    namespace: str = typer.Option(
        "default", "--namespace", help="Kubernetes namespace."
    ),
    token: Optional[str] = typer.Option(None, "--api-key", help="API key."),
) -> None:
    client = _make_client(token=token)
    client.ray_delete_cluster(name, namespace=namespace)
    console.print(f"[green]Cluster deleted:[/green] {name} (ns={namespace})")


@jobs_app.command(name="submit")
def jobs_submit(
    cluster_name: str = typer.Argument(..., help="Target RayCluster name."),
    entrypoint: Optional[str] = typer.Option(
        None,
        "--entrypoint",
        help="Ray job entrypoint command.",
    ),
    python_inline: Optional[str] = typer.Option(
        None,
        "--python-inline",
        "--py",
        help="Inline Python source; supports @- (stdin) and @<path> for multiline input.",
    ),
    namespace: str = typer.Option(
        "default", "--namespace", help="Kubernetes namespace."
    ),
    job_name: Optional[str] = typer.Option(
        None, "--job-name", help="Optional RayJob name."
    ),
    runtime_env_yaml: Optional[str] = typer.Option(
        None, "--runtime-env-yaml", help="Raw runtimeEnvYAML string."
    ),
    shutdown_after_job_finishes: bool = typer.Option(
        True, "--shutdown-after-job-finishes/--keep-cluster"
    ),
    ttl_seconds_after_finished: Optional[int] = typer.Option(
        3600, "--ttl-seconds-after-finished", min=0
    ),
    token: Optional[str] = typer.Option(None, "--api-key", help="API key."),
) -> None:
    resolved_python_inline = _resolve_python_inline(python_inline)

    if bool(entrypoint) == bool(resolved_python_inline):
        raise typer.BadParameter(
            "Provide exactly one of --entrypoint or --python-inline/--py."
        )

    payload: dict[str, Any] = {
        "namespace": namespace,
        "shutdown_after_job_finishes": shutdown_after_job_finishes,
        "ttl_seconds_after_finished": ttl_seconds_after_finished,
    }
    if entrypoint:
        payload["entrypoint"] = entrypoint
    if resolved_python_inline:
        # Backward compatibility: older ray addon APIs require `entrypoint`.
        # Keep sending a concrete entrypoint while also passing python_inline
        # for newer servers that natively support it.
        payload["entrypoint"] = f"python -c {shlex.quote(resolved_python_inline)}"
        payload["python_inline"] = resolved_python_inline
    if job_name:
        payload["job_name"] = job_name
    if runtime_env_yaml:
        payload["runtime_env_yaml"] = runtime_env_yaml

    client = _make_client(token=token)
    result = client.ray_submit_job(cluster_name, payload)
    job = result.get("job") or {}
    metadata = job.get("metadata") or {}
    console.print(
        f"[green]Job submitted:[/green] {metadata.get('name', '')} "
        f"(cluster={cluster_name}, ns={namespace})"
    )
    if metadata.get("name"):
        console.print(
            "[dim]Next: agent-runtimes ray jobs monitor {0} --namespace {1}[/dim]".format(
                metadata.get("name"), namespace
            )
        )


@jobs_app.command(name="list")
@jobs_app.command(name="ls")
def jobs_list(
    namespace: str = typer.Option(
        "default", "--namespace", help="Kubernetes namespace."
    ),
    cluster_name: Optional[str] = typer.Option(
        None, "--cluster-name", help="Filter by cluster label."
    ),
    token: Optional[str] = typer.Option(None, "--api-key", help="API key."),
    raw: bool = typer.Option(False, "--raw", help="Print raw JSON."),
) -> None:
    try:
        client = _make_client(token=token)
        payload = client.ray_list_jobs(namespace=namespace, cluster_name=cluster_name)
        if raw:
            _print_json(payload)
            return

        items = payload.get("jobs") or []
        table = Table(title=f"Ray Jobs ({len(items)})")
        table.add_column("Name", style="cyan")
        table.add_column("Namespace")
        table.add_column("Cluster")
        table.add_column("Status")

        for item in items:
            metadata = item.get("metadata") or {}
            labels = metadata.get("labels") or {}
            status = item.get("status") or {}
            table.add_row(
                str(metadata.get("name", "")),
                str(metadata.get("namespace", namespace)),
                str(labels.get("ray.io/cluster", "")),
                str(status.get("jobStatus", "")),
            )

        console.print(table)
    except Exception as exc:
        message = str(exc).strip() or "Unknown Ray jobs error"
        lowered = message.lower()

        if "no ray provider registered" in lowered:
            console.print(
                "[red]Unable to list Ray jobs:[/red] No Ray provider registered."
            )
            console.print(
                "[yellow]Hint:[/yellow] Start or register a Ray provider in the runtimes service, then retry [bold]d ray jobs ls[/bold]."
            )
        elif "status=503" in lowered:
            console.print(
                "[red]Unable to list Ray jobs:[/red] Ray service unavailable (503)."
            )
            console.print(
                "[yellow]Hint:[/yellow] Check runtimes/operator health and Ray provider registration."
            )
        else:
            console.print(f"[red]Unable to list Ray jobs:[/red] {message}")

        raise typer.Exit(code=1)


@jobs_app.command(name="status")
def jobs_status(
    name: str = typer.Argument(..., help="RayJob name."),
    namespace: str = typer.Option(
        "default", "--namespace", help="Kubernetes namespace."
    ),
    token: Optional[str] = typer.Option(None, "--api-key", help="API key."),
) -> None:
    client = _make_client(token=token)
    payload = client.ray_get_job(name, namespace=namespace)
    _print_json(payload)


@jobs_app.command(name="delete")
def jobs_delete(
    name: str = typer.Argument(..., help="RayJob name."),
    namespace: str = typer.Option(
        "default", "--namespace", help="Kubernetes namespace."
    ),
    token: Optional[str] = typer.Option(None, "--api-key", help="API key."),
) -> None:
    client = _make_client(token=token)
    client.ray_delete_job(name, namespace=namespace)
    console.print(f"[green]Job deleted:[/green] {name} (ns={namespace})")


@jobs_app.command(name="logs")
def jobs_logs(
    name: str = typer.Argument(..., help="RayJob name."),
    namespace: str = typer.Option(
        "default", "--namespace", help="Kubernetes namespace."
    ),
    pod_name: Optional[str] = typer.Option(
        None, "--pod-name", help="Optional explicit pod name."
    ),
    container: Optional[str] = typer.Option(
        None, "--container", help="Optional pod container name."
    ),
    tail_lines: int = typer.Option(200, "--tail-lines", min=1, max=5000),
    token: Optional[str] = typer.Option(None, "--api-key", help="API key."),
) -> None:
    client = _make_client(token=token)
    payload = client.ray_get_job_logs(
        name,
        namespace=namespace,
        pod_name=pod_name,
        container=container,
        tail_lines=tail_lines,
    )
    console.print(
        f"[bold]Logs[/bold] job={payload.get('job_name', name)} "
        f"pod={payload.get('pod_name', '')}"
    )
    console.print(_normalize_logs_text(payload.get("logs", "")))


@jobs_app.command(name="events")
def jobs_events(
    name: str = typer.Argument(..., help="RayJob name."),
    namespace: str = typer.Option(
        "default", "--namespace", help="Kubernetes namespace."
    ),
    limit: int = typer.Option(100, "--limit", min=1, max=1000),
    token: Optional[str] = typer.Option(None, "--api-key", help="API key."),
    raw: bool = typer.Option(False, "--raw", help="Print raw JSON."),
) -> None:
    client = _make_client(token=token)
    payload = client.ray_get_job_events(name, namespace=namespace, limit=limit)
    if raw:
        _print_json(payload)
        return

    events = payload.get("events") or []
    table = Table(title=f"Ray Job Events ({len(events)})")
    table.add_column("Type")
    table.add_column("Reason")
    table.add_column("Target")
    table.add_column("Time")
    table.add_column("Message")

    for event in events:
        table.add_row(
            str(event.get("type") or ""),
            str(event.get("reason") or ""),
            str(event.get("involved_object_name") or ""),
            str(
                event.get("event_time")
                or event.get("last_timestamp")
                or event.get("first_timestamp")
                or ""
            ),
            str(event.get("message") or ""),
        )

    console.print(table)


@jobs_app.command(name="monitor")
def jobs_monitor(
    name: str = typer.Argument(..., help="RayJob name."),
    namespace: str = typer.Option(
        "default", "--namespace", help="Kubernetes namespace."
    ),
    interval_seconds: int = typer.Option(
        5, "--interval-seconds", min=1, help="Polling interval in seconds."
    ),
    timeout_seconds: int = typer.Option(
        600, "--timeout-seconds", min=1, help="Maximum time to wait before exiting."
    ),
    show_events: bool = typer.Option(
        False, "--show-events", help="Show latest events on each poll."
    ),
    token: Optional[str] = typer.Option(None, "--api-key", help="API key."),
) -> None:
    """Monitor RayJob status until it reaches a terminal state."""
    client = _make_client(token=token)
    started = time.time()
    last_status: Optional[str] = None
    terminal_statuses = {"SUCCEEDED", "FAILED", "STOPPED"}

    while True:
        payload = client.ray_get_job(name, namespace=namespace)
        status = str(payload.get("status") or "UNKNOWN").upper()
        if status != last_status:
            console.print(f"[bold]job={name}[/bold] ns={namespace} status={status}")
            last_status = status

        if show_events:
            events_payload = client.ray_get_job_events(
                name, namespace=namespace, limit=5
            )
            events = events_payload.get("events") or []
            for event in events[:3]:
                console.print(
                    "[dim]{0} {1}: {2}[/dim]".format(
                        event.get("type") or "",
                        event.get("reason") or "",
                        event.get("message") or "",
                    )
                )

        if status in terminal_statuses:
            console.print(f"[green]Job reached terminal status:[/green] {status}")
            if status != "SUCCEEDED":
                raise typer.Exit(1)
            return

        if (time.time() - started) >= timeout_seconds:
            console.print(
                f"[red]Timed out after {timeout_seconds}s while waiting for job status.[/red]"
            )
            raise typer.Exit(1)

        time.sleep(interval_seconds)


app.add_typer(clusters_app)
app.add_typer(jobs_app)
