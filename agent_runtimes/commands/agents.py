# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2023-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Agent runtime commands for Datalayer CLI."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

import requests
import typer
import yaml
from datalayer_core.utils.date import timestamp_to_local_date
from datalayer_core.utils.network import fetch
from datalayer_core.utils.urls import DatalayerURLs
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from agent_runtimes.agents.agent_local import (
    DEFAULT_LOCAL_AGENT_NAME,
    DEFAULT_LOCAL_HOST,
    DEFAULT_LOCAL_LOG_LEVEL,
    DEFAULT_LOCAL_PROTOCOL,
    ensure_local_agent,
    start_local_agent_runtime,
    terminate_local_agent_runtime,
)
from agent_runtimes.client import DatalayerClient

DEFAULT_AGENT_SPEC_ID = "example-simple"

app = typer.Typer(
    name="agents",
    help="Agent runtime management commands.",
    invoke_without_command=True,
)

console = Console()


@app.callback()
def agents_callback(ctx: typer.Context) -> None:
    """Agent runtime management commands."""
    if ctx.invoked_subcommand is None:
        typer.echo(ctx.get_help())


def _make_client(
    token: Optional[str] = None,
    iam_url: Optional[str] = None,
    runtimes_url: Optional[str] = None,
) -> DatalayerClient:
    urls = DatalayerURLs.from_environment(iam_url=iam_url, runtimes_url=runtimes_url)
    return DatalayerClient(urls=urls, api_key=token)


def _is_url(value: str) -> bool:
    lowered = value.lower()
    return lowered.startswith("http://") or lowered.startswith("https://")


def _load_agent_spec(spec_source: str) -> dict[str, Any]:
    source = spec_source.strip()
    if not source:
        raise typer.BadParameter("--agentspec must be a non-empty URL or file path.")

    raw_text = ""
    if _is_url(source):
        try:
            response = requests.get(source, timeout=30)
        except Exception as exc:
            raise RuntimeError(
                f"Failed to fetch --agentspec URL '{source}': {exc}"
            ) from exc
        if response.status_code >= 400:
            preview = (response.text or "")[:500]
            raise RuntimeError(
                f"--agentspec URL returned HTTP {response.status_code}: {source}\n{preview}"
            )
        raw_text = response.text or ""
    else:
        path = Path(source)
        if not path.exists():
            raise RuntimeError(f"--agentspec file does not exist: {path}")
        if not path.is_file():
            raise RuntimeError(f"--agentspec path is not a file: {path}")
        raw_text = path.read_text(encoding="utf-8")

    try:
        parsed = yaml.safe_load(raw_text)
    except Exception as exc:
        raise RuntimeError(f"Failed to parse --agentspec as YAML/JSON: {exc}") from exc

    if not isinstance(parsed, dict):
        raise RuntimeError("--agentspec must decode to an object (mapping).")
    if not parsed:
        raise RuntimeError("--agentspec decoded to an empty object.")
    return parsed


def _resolve_billable_account_details(
    *,
    client: DatalayerClient,
    billable_account_uid: str,
) -> dict[str, str]:
    """Resolve account metadata from IAM whoami/memberships payloads.

    When no explicit billable account UID is provided by the runtime payload,
    fall back to the authenticated user profile from whoami.
    """

    resolved_token = str(client._get_api_key() or "").strip()
    if not resolved_token:
        return {"uid": billable_account_uid} if billable_account_uid else {}

    iam_base = str(client.urls.iam_url).rstrip("/")
    headers = {"Authorization": f"Bearer {resolved_token}"}

    try:
        whoami_response = requests.get(
            f"{iam_base}/api/iam/v1/whoami",
            headers=headers,
            timeout=10,
        )
    except Exception:
        whoami_response = None

    if whoami_response is not None and whoami_response.status_code == 200:
        payload = whoami_response.json()
        profile = payload.get("profile") or {}
        profile_uid = str(profile.get("uid") or "").strip()
        if profile_uid and (
            not billable_account_uid or profile_uid == billable_account_uid
        ):
            full_name = str(profile.get("name") or "").strip()
            if not full_name:
                first_name = str(profile.get("first_name") or "").strip()
                last_name = str(profile.get("last_name") or "").strip()
                full_name = " ".join(p for p in [first_name, last_name] if p)
            return {
                "uid": profile_uid,
                "handle": str(profile.get("handle") or "").strip(),
                "type": str(profile.get("type") or "user").strip() or "user",
                "name": full_name,
                "description": str(profile.get("description") or "").strip(),
            }

    try:
        memberships_response = requests.get(
            f"{iam_base}/api/iam/v1/memberships",
            headers=headers,
            timeout=10,
        )
    except Exception:
        memberships_response = None

    if memberships_response is not None and memberships_response.status_code == 200:
        memberships_payload = memberships_response.json()
        memberships = memberships_payload.get("memberships") or []
        for membership in memberships:
            uid = str((membership or {}).get("uid") or "").strip()
            if uid == billable_account_uid:
                return {
                    "uid": billable_account_uid,
                    "handle": str((membership or {}).get("handle") or "").strip(),
                    "type": str((membership or {}).get("type") or "").strip(),
                    "name": str((membership or {}).get("name") or "").strip(),
                    "description": str(
                        (membership or {}).get("description") or ""
                    ).strip(),
                }

    return {"uid": billable_account_uid} if billable_account_uid else {}


def _resolve_agentspec_label(runtime_payload: dict[str, Any]) -> str:
    """Best-effort extraction of agentspec identifier from runtime payload."""
    candidates = [
        runtime_payload.get("agent_spec_id"),
        runtime_payload.get("agentspec_id"),
        runtime_payload.get("agentSpecId"),
    ]
    for candidate in candidates:
        value = str(candidate or "").strip()
        if value:
            return value
    return "n/a"


def _billable_uid_label(
    *,
    billable_uid: str,
    authenticated_uid: str,
    rich: bool = False,
) -> str:
    """Human label for billable UID in text/raw outputs."""
    if billable_uid and authenticated_uid and billable_uid == authenticated_uid:
        return "[bold green]me[/bold green]" if rich else "me"
    return billable_uid or "n/a"


def _print_runtime_summary_panel(
    *,
    title: str,
    identifier: str,
    agentspec: str,
    url: str,
) -> None:
    """Render a compact runtime summary panel."""
    lines = [
        f"Identifier: {identifier}",
        f"Agentspec: {agentspec}",
        f"URL: {url}",
    ]
    console.print(
        Panel(
            "\n".join(lines),
            title=title,
            border_style="green",
        )
    )


def _create_local_agent_runtime(
    *,
    agent_spec_id: str,
    agent_name: str,
    host: str,
    port: Optional[int],
    protocol: str,
    log_level: str,
    token: Optional[str],
    raw: bool,
) -> None:
    """Launch a local agent-runtimes server and serve until interrupted."""
    runtime = start_local_agent_runtime(
        agent_spec_id=agent_spec_id,
        agent_name=agent_name,
        host=host,
        port=port,
        protocol=protocol,
        log_level=log_level,
    )

    resolved_token = (token or "").strip()
    if resolved_token:
        try:
            ensure_local_agent(
                base_url=runtime.base_url,
                agent_name=agent_name,
                token=resolved_token,
                agent_spec_id=agent_spec_id,
                transport=protocol,
            )
        except Exception as exc:
            terminate_local_agent_runtime(runtime)
            raise RuntimeError(f"Failed to register local agent: {exc}") from exc

    if raw:
        payload = {
            "success": True,
            "local": True,
            "runtime": {
                "base_url": runtime.base_url,
                "agent_name": runtime.agent_name,
                "agent_spec_id": runtime.agent_spec_id,
                "chat_endpoint": runtime.chat_endpoint,
            },
        }
        console.print(json.dumps(payload, ensure_ascii=False))
    else:
        console.print(f"[green]Local agent runtime '{agent_name}' started![/green]")
        console.print(f"Base URL: {runtime.base_url}")
        console.print(f"Agentspec id: {agent_spec_id}")
        console.print(f"Chat endpoint: {runtime.chat_endpoint}")
        console.print("[dim]Press Ctrl+C to stop the local runtime.[/dim]")

    process = runtime.process
    try:
        if process is not None:
            process.wait()
    except KeyboardInterrupt:
        console.print("\n[yellow]Stopping local agent runtime...[/yellow]")
    finally:
        terminate_local_agent_runtime(runtime)


@app.command(name="ls")
def list_agents(
    token: Optional[str] = typer.Option(
        None,
        "--api-key",
        help="API key (Bearer token for API requests).",
    ),
    iam_url: Optional[str] = typer.Option(
        None,
        "--iam-url",
        help="Datalayer IAM server URL",
    ),
    runtimes_url: Optional[str] = typer.Option(
        None,
        "--runtimes-url",
        help="Datalayer Runtimes server URL",
    ),
) -> None:
    """List running agent runtimes."""
    try:
        client = _make_client(token=token, iam_url=iam_url, runtimes_url=runtimes_url)
        runtimes = client.list_runtimes()

        authenticated_uid = str(
            _resolve_billable_account_details(
                client=client,
                billable_account_uid="",
            ).get("uid")
            or ""
        ).strip()

        table = Table(title="Agents")
        table.add_column("ID", style="cyan", no_wrap=True)
        table.add_column("Name", style="cyan", no_wrap=True)
        table.add_column("Environment", style="cyan", no_wrap=True)
        table.add_column("Billable Account UID", style="cyan", no_wrap=True)
        table.add_column("Expired At", style="cyan", no_wrap=True)

        for runtime in runtimes:
            runtime_payload: dict[str, Any] = {}
            ownership_payload: dict[str, Any] = {}
            pod_name = str(runtime.pod_name or "")
            if pod_name:
                try:
                    runtime_response = client._get_runtime(pod_name)
                    runtime_payload = runtime_response.get("runtime") or {}
                    ownership_payload = runtime_payload.get("ownership") or {}
                except Exception:
                    runtime_payload = {}
                    ownership_payload = {}

            billable_uid = str(
                runtime_payload.get("billable_account_uid")
                or ownership_payload.get("billable_account_uid")
                or getattr(runtime, "billable_account_uid", "")
                or ""
            ).strip()
            if not billable_uid and authenticated_uid:
                billable_uid = authenticated_uid

            display_billable_uid = _billable_uid_label(
                billable_uid=billable_uid,
                authenticated_uid=authenticated_uid,
                rich=True,
            )

            expired_at = runtime.expired_at
            table.add_row(
                pod_name,
                str(runtime.name or ""),
                str(runtime.environment or ""),
                display_billable_uid,
                "Never" if expired_at is None else timestamp_to_local_date(expired_at),
            )

        console.print(table)
    except Exception as exc:
        console.print(f"[red]Error listing agent runtimes: {exc}[/red]")
        raise typer.Exit(1)


@app.command(name="create")
def create_agent_runtime(
    environment: Optional[str] = typer.Argument(None, help="Environment name."),
    given_name: Optional[str] = typer.Option(
        None,
        "--given-name",
        help="Custom name for the runtime.",
    ),
    spec_id: Optional[str] = typer.Option(
        None,
        "--agentspec-id",
        help=(
            "Agentspec id for runtime bootstrap. "
            f"Defaults to {DEFAULT_AGENT_SPEC_ID} when --agentspec is omitted."
        ),
    ),
    spec: Optional[str] = typer.Option(
        None,
        "--agentspec",
        help="Agentspec source as YAML/JSON URL or local file path.",
    ),
    time_reservation: Optional[float] = typer.Option(
        10.0,
        "--time-reservation",
        help="Time reservation in minutes for the runtime.",
    ),
    billable_account_uid: Optional[str] = typer.Option(
        None,
        "--billable-account-uid",
        help="Account UID to bill the runtime to (org/team).",
    ),
    billable_account_type: Optional[str] = typer.Option(
        None,
        "--billable-account-type",
        help="Billable account type: user, organization, or team.",
    ),
    billable_account_handle: Optional[str] = typer.Option(
        None,
        "--billable-account-handle",
        help="Billable account handle (informational).",
    ),
    raw: bool = typer.Option(
        False,
        "--raw",
        help="Print machine-readable JSON payload.",
    ),
    token: Optional[str] = typer.Option(
        None,
        "--api-key",
        help="API key (Bearer token for API requests).",
    ),
    iam_url: Optional[str] = typer.Option(
        None,
        "--iam-url",
        help="Datalayer IAM server URL",
    ),
    runtimes_url: Optional[str] = typer.Option(
        None,
        "--runtimes-url",
        help="Datalayer Runtimes server URL",
    ),
    local: bool = typer.Option(
        False,
        "--local",
        help="Launch the agent as a local agent-runtimes server.",
    ),
    cloud: bool = typer.Option(
        False,
        "--cloud",
        help="Launch the agent as a cloud runtime.",
    ),
    host: str = typer.Option(
        DEFAULT_LOCAL_HOST,
        "--host",
        help="Host interface for the local runtime (only with --local).",
    ),
    port: Optional[int] = typer.Option(
        None,
        "--port",
        help="Port for the local runtime (random free port when omitted, only with --local).",
    ),
    protocol: str = typer.Option(
        DEFAULT_LOCAL_PROTOCOL,
        "--protocol",
        help="Transport protocol for the local runtime (only with --local).",
    ),
    log_level: str = typer.Option(
        DEFAULT_LOCAL_LOG_LEVEL,
        "--log-level",
        help="Log level for the local runtime process (only with --local).",
    ),
) -> None:
    """Create a new runtime preloaded with an agentspec.

    By default creates a cloud runtime. Use ``--local`` for a local
    ``agent-runtimes`` server, or ``--cloud`` to be explicit.
    """
    import questionary

    try:
        if spec and spec_id:
            raise typer.BadParameter(
                "Use either --agentspec-id or --agentspec, not both."
            )

        if local and cloud:
            raise typer.BadParameter("Use only one of --local or --cloud.")

        if local:
            if spec:
                raise typer.BadParameter(
                    "--agentspec is not supported with --local; use --agentspec-id."
                )
            _create_local_agent_runtime(
                agent_spec_id=(spec_id or "").strip() or DEFAULT_AGENT_SPEC_ID,
                agent_name=(given_name or "").strip() or DEFAULT_LOCAL_AGENT_NAME,
                host=host,
                port=port,
                protocol=protocol,
                log_level=log_level,
                token=token,
                raw=raw,
            )
            return

        client = _make_client(token=token, iam_url=iam_url, runtimes_url=runtimes_url)

        if environment is None:
            environments = client.list_environments()
            if not environments:
                console.print("[yellow]No environments available.[/yellow]")
                raise typer.Exit(0)
            choices = []
            for env in environments:
                label = env.name
                if env.title:
                    label += f"  ({env.title})"
                choices.append(questionary.Choice(title=label, value=env.name))

            selected = questionary.select(
                "Select the environment for the new agent runtime:",
                choices=choices,
            ).ask()
            if selected is None:
                raise typer.Exit(0)
            environment = selected

        agent_spec_payload: dict[str, Any] | None = None
        resolved_spec_id: str | None = None
        if spec:
            agent_spec_payload = _load_agent_spec(spec)
        else:
            resolved_spec_id = (spec_id or "").strip() or DEFAULT_AGENT_SPEC_ID

        final_time_reservation = time_reservation or 10.0
        runtime = client.create_runtime(
            name=given_name,
            environment=environment,
            time_reservation=final_time_reservation,
            agent_spec_id=resolved_spec_id,
            agent_spec=agent_spec_payload,
            billable_account_uid=billable_account_uid,
            billable_account_type=billable_account_type,
            billable_account_handle=billable_account_handle,
        )

        authenticated_uid = str(
            _resolve_billable_account_details(
                client=client,
                billable_account_uid="",
            ).get("uid")
            or ""
        ).strip()

        created_runtime_payload: dict[str, Any] = {}
        ownership_payload: dict[str, Any] = {}
        created_pod_name = str(runtime.pod_name or "")
        if created_pod_name:
            try:
                created_runtime_response = client._get_runtime(created_pod_name)
                created_runtime_payload = created_runtime_response.get("runtime") or {}
                ownership_payload = created_runtime_payload.get("ownership") or {}
            except Exception:
                created_runtime_payload = {}
                ownership_payload = {}

        billable_uid = str(
            created_runtime_payload.get("billable_account_uid")
            or ownership_payload.get("billable_account_uid")
            or billable_account_uid
            or ""
        ).strip()
        if not billable_uid and authenticated_uid:
            billable_uid = authenticated_uid

        if raw:
            payload = {
                "success": True,
                "runtime": {
                    "given_name": runtime.name,
                    "environment_name": runtime.environment,
                    "pod_name": runtime.pod_name,
                    "uid": runtime.uid,
                    "ingress": runtime.ingress,
                    "reservation_id": runtime.reservation_id,
                    "burning_rate": runtime.burning_rate,
                    "started_at": runtime.started_at,
                    "expired_at": runtime.expired_at,
                    "billable_account_uid": billable_uid or None,
                    "billable_account_uid_label": _billable_uid_label(
                        billable_uid=billable_uid,
                        authenticated_uid=authenticated_uid,
                    ),
                },
                "agent_spec_id": resolved_spec_id,
                "agent_spec_source": spec or "",
            }
            console.print(json.dumps(payload, ensure_ascii=False))
            return

        spec_label = resolved_spec_id or spec or "n/a"
        identifier = str(runtime.pod_name or runtime.uid or runtime.name or "")
        url = str(runtime.ingress or "")
        _print_runtime_summary_panel(
            title="Agent Runtime Created",
            identifier=identifier,
            agentspec=spec_label,
            url=url,
        )

    except typer.Exit:
        raise
    except Exception as exc:
        console.print("[red]Error creating agent runtime.[/red]")
        console.print(f"[red]{exc}[/red]")
        raise typer.Exit(1)


@app.command(name="get")
def get_agent_runtime(
    pod_name: Optional[str] = typer.Argument(
        None,
        help="Pod name of the agent runtime to read.",
    ),
    raw: bool = typer.Option(
        False,
        "--raw",
        help="Print machine-readable JSON payload.",
    ),
    token: Optional[str] = typer.Option(
        None,
        "--api-key",
        help="API key (Bearer token for API requests).",
    ),
    iam_url: Optional[str] = typer.Option(
        None,
        "--iam-url",
        help="Datalayer IAM server URL",
    ),
    runtimes_url: Optional[str] = typer.Option(
        None,
        "--runtimes-url",
        help="Datalayer Runtimes server URL",
    ),
) -> None:
    """Read a single agent runtime by pod name."""
    import questionary

    try:
        client = _make_client(token=token, iam_url=iam_url, runtimes_url=runtimes_url)

        if pod_name is None:
            runtimes = client.list_runtimes()
            if not runtimes:
                console.print("[yellow]No running runtimes found.[/yellow]")
                raise typer.Exit(0)
            choices = []
            for runtime in runtimes:
                label = runtime.pod_name or ""
                if runtime.name:
                    label = f"{runtime.pod_name}  ({runtime.name})"
                if runtime.environment:
                    label += f"  [{runtime.environment}]"
                choices.append(questionary.Choice(title=label, value=runtime.pod_name))

            selected = questionary.select(
                "Select the agent runtime to read:",
                choices=choices,
            ).ask()
            if selected is None:
                raise typer.Exit(0)
            pod_name = selected

        runtime_response = client._get_runtime(pod_name)
        runtime_payload = runtime_response.get("runtime") or {}
        ownership_payload = runtime_payload.get("ownership") or {}
        runtime = client.get_runtime(pod_name)

        authenticated_uid = str(
            _resolve_billable_account_details(
                client=client,
                billable_account_uid="",
            ).get("uid")
            or ""
        ).strip()

        billable_uid = str(
            runtime_payload.get("billable_account_uid")
            or ownership_payload.get("billable_account_uid")
            or getattr(runtime, "billable_account_uid", "")
            or ""
        ).strip()
        if not billable_uid and authenticated_uid:
            billable_uid = authenticated_uid

        runtime_dict = {
            "given_name": runtime.name,
            "environment_name": runtime.environment,
            "pod_name": runtime.pod_name,
            "ingress": runtime.ingress,
            "reservation_id": runtime.reservation_id,
            "uid": runtime.uid,
            "burning_rate": runtime.burning_rate,
            "token": runtime.jupyter_token,
            "started_at": runtime.started_at,
            "expired_at": runtime.expired_at,
            "billable_account_uid": billable_uid or None,
            "billable_account_uid_label": _billable_uid_label(
                billable_uid=billable_uid,
                authenticated_uid=authenticated_uid,
            ),
        }

        if raw:
            console.print(
                json.dumps(
                    {"success": True, "runtime": runtime_dict}, ensure_ascii=False
                )
            )
            return

        _print_runtime_summary_panel(
            title="Agent Runtime",
            identifier=str(runtime.pod_name or runtime.uid or runtime.name or ""),
            agentspec=_resolve_agentspec_label(runtime_payload),
            url=str(runtime.ingress or ""),
        )

    except typer.Exit:
        raise
    except Exception as exc:
        console.print(f"[red]Error reading agent runtime: {exc}[/red]")
        raise typer.Exit(1)


@app.command(name="update")
def update_agent_runtime(
    pod_name: Optional[str] = typer.Argument(
        None,
        help="Pod name of the agent runtime to update.",
    ),
    capability: list[str] = typer.Option(
        [],
        "--capability",
        help="Capability to apply (repeatable). Replaces existing capabilities.",
    ),
    raw: bool = typer.Option(
        False,
        "--raw",
        help="Print machine-readable JSON payload.",
    ),
    token: Optional[str] = typer.Option(
        None,
        "--api-key",
        help="API key (Bearer token for API requests).",
    ),
    iam_url: Optional[str] = typer.Option(
        None,
        "--iam-url",
        help="Datalayer IAM server URL",
    ),
    runtimes_url: Optional[str] = typer.Option(
        None,
        "--runtimes-url",
        help="Datalayer Runtimes server URL",
    ),
) -> None:
    """Update an agent runtime's capabilities."""
    import questionary

    try:
        client = _make_client(token=token, iam_url=iam_url, runtimes_url=runtimes_url)

        if pod_name is None:
            runtimes = client.list_runtimes()
            if not runtimes:
                console.print("[yellow]No running runtimes found.[/yellow]")
                raise typer.Exit(0)
            choices = []
            for runtime in runtimes:
                label = runtime.pod_name or ""
                if runtime.name:
                    label = f"{runtime.pod_name}  ({runtime.name})"
                if runtime.environment:
                    label += f"  [{runtime.environment}]"
                choices.append(questionary.Choice(title=label, value=runtime.pod_name))

            selected = questionary.select(
                "Select the agent runtime to update:",
                choices=choices,
            ).ask()
            if selected is None:
                raise typer.Exit(0)
            pod_name = selected

        client.update_runtime(pod_name, list(capability))

        if raw:
            console.print(
                json.dumps(
                    {
                        "success": True,
                        "pod_name": pod_name,
                        "capabilities": list(capability),
                    },
                    ensure_ascii=False,
                )
            )
            return

        console.print(
            f"[green]Agent runtime '{pod_name}' updated successfully![/green]"
        )
        if capability:
            console.print(f"Capabilities: {', '.join(capability)}")

    except typer.Exit:
        raise
    except Exception as exc:
        console.print(f"[red]Error updating agent runtime: {exc}[/red]")
        raise typer.Exit(1)


@app.command(name="delete")
@app.command(name="terminate")
def terminate_agent_runtime(
    pod_name: Optional[str] = typer.Argument(
        None,
        help="Pod name of the runtime to terminate.",
    ),
    token: Optional[str] = typer.Option(
        None,
        "--api-key",
        help="API key (Bearer token for API requests).",
    ),
    iam_url: Optional[str] = typer.Option(
        None,
        "--iam-url",
        help="Datalayer IAM server URL",
    ),
    runtimes_url: Optional[str] = typer.Option(
        None,
        "--runtimes-url",
        help="Datalayer Runtimes server URL",
    ),
) -> None:
    """Terminate a running agent runtime."""
    import questionary

    try:
        client = _make_client(token=token, iam_url=iam_url, runtimes_url=runtimes_url)

        if pod_name is None:
            runtimes = client.list_runtimes()
            if not runtimes:
                console.print("[yellow]No running runtimes found.[/yellow]")
                raise typer.Exit(0)

            choices = []
            for runtime in runtimes:
                label = runtime.pod_name or ""
                if runtime.name:
                    label = f"{runtime.pod_name}  ({runtime.name})"
                if runtime.environment:
                    label += f"  [{runtime.environment}]"
                choices.append(questionary.Choice(title=label, value=runtime.pod_name))

            selected = questionary.select(
                "Select the agent runtime to terminate:",
                choices=choices,
            ).ask()
            if selected is None:
                raise typer.Exit(0)
            pod_name = selected

        success = client.terminate_runtime(pod_name)
        if success:
            console.print(
                f"[green]Agent runtime '{pod_name}' terminated successfully![/green]"
            )
        else:
            console.print(f"[red]Failed to terminate agent runtime '{pod_name}'[/red]")
            raise typer.Exit(1)

    except typer.Exit:
        raise
    except Exception as exc:
        console.print(f"[red]Error terminating agent runtime: {exc}[/red]")
        raise typer.Exit(1)


def agents_ls(
    token: Optional[str] = typer.Option(
        None,
        "--api-key",
        help="API key (Bearer token for API requests).",
    ),
    iam_url: Optional[str] = typer.Option(
        None,
        "--iam-url",
        help="Datalayer IAM server URL",
    ),
    runtimes_url: Optional[str] = typer.Option(
        None,
        "--runtimes-url",
        help="Datalayer Runtimes server URL",
    ),
) -> None:
    """List running agent runtimes (root command alias)."""
    list_agents(token=token, iam_url=iam_url, runtimes_url=runtimes_url)


@app.command(name="inspect")
def inspect_agent_runtime(
    agent: Optional[str] = typer.Option(
        None,
        "--agent",
        "-a",
        help="Agent identifier (pod name, uid, or given name). Defaults to first running runtime.",
    ),
    token: Optional[str] = typer.Option(
        None,
        "--api-key",
        help="API key (Bearer token for API requests).",
    ),
    iam_url: Optional[str] = typer.Option(
        None,
        "--iam-url",
        help="Datalayer IAM server URL",
    ),
    runtimes_url: Optional[str] = typer.Option(
        None,
        "--runtimes-url",
        help="Datalayer Runtimes server URL",
    ),
) -> None:
    """Inspect an agent runtime and list available code sandboxes."""
    try:
        client = _make_client(token=token, iam_url=iam_url, runtimes_url=runtimes_url)
        runtimes = client.list_runtimes()
        if not runtimes:
            console.print("[yellow]No running runtimes found.[/yellow]")
            raise typer.Exit(1)

        selected = None
        if agent:
            for candidate in runtimes:
                if agent in {candidate.pod_name, candidate.uid, candidate.name}:
                    selected = candidate
                    break
            if selected is None:
                console.print(f"[red]Agent '{agent}' not found.[/red]")
                raise typer.Exit(1)
        else:
            selected = runtimes[0]

        pod_name = selected.pod_name or ""
        runtime_response = client._get_runtime(pod_name)
        runtime_payload = runtime_response.get("runtime") or {}
        ownership_payload = runtime_payload.get("ownership") or {}

        refreshed = client.get_runtime(pod_name)
        endpoint = str(refreshed.ingress or "").rstrip("/")
        runtime_token = str(refreshed.jupyter_token or client._get_api_key() or "")
        if not endpoint:
            console.print("[red]Runtime has no ingress endpoint.[/red]")
            raise typer.Exit(1)

        billable_account_uid = str(
            runtime_payload.get("billable_account_uid")
            or ownership_payload.get("billable_account_uid")
            or ""
        ).strip()
        billable_account_handle = str(
            runtime_payload.get("billable_account_handle")
            or ownership_payload.get("billable_account_handle")
            or ""
        ).strip()
        billable_account_kind = str(
            runtime_payload.get("billable_account_kind")
            or ownership_payload.get("billable_account_kind")
            or runtime_payload.get("billable_account_type")
            or ownership_payload.get("billable_account_type")
            or ""
        ).strip()

        account_details = _resolve_billable_account_details(
            client=client,
            billable_account_uid=billable_account_uid,
        )
        authenticated_uid = str(
            _resolve_billable_account_details(
                client=client,
                billable_account_uid="",
            ).get("uid")
            or ""
        ).strip()
        billable_account_uid = str(
            account_details.get("uid") or billable_account_uid or ""
        ).strip()
        display_billable_uid = _billable_uid_label(
            billable_uid=billable_account_uid,
            authenticated_uid=authenticated_uid,
            rich=True,
        )
        resolved_handle = str(
            account_details.get("handle") or billable_account_handle or ""
        ).strip()
        resolved_kind = str(
            account_details.get("type") or billable_account_kind or ""
        ).strip()
        resolved_name = str(account_details.get("name") or "").strip()
        resolved_description = str(account_details.get("description") or "").strip()

        kernel_endpoints = [f"{endpoint}/api/kernels"]
        if "/jupyter/server/" in endpoint:
            host_prefix, remainder = endpoint.split("/jupyter/server/", 1)
            path_parts = [part for part in remainder.split("/") if part]
            if path_parts:
                pool = path_parts[0]
                kernel_endpoints.append(
                    f"{host_prefix}/jupyter/server/{pool}/api/kernels"
                )
            kernel_endpoints.append(f"{host_prefix}/jupyter/api/kernels")
        kernel_endpoints.append(f"{endpoint}/jupyter/api/kernels")

        # Deduplicate while preserving order.
        deduped_kernel_endpoints: list[str] = []
        seen_endpoints: set[str] = set()
        for kernel_url in kernel_endpoints:
            if kernel_url not in seen_endpoints:
                seen_endpoints.add(kernel_url)
                deduped_kernel_endpoints.append(kernel_url)
        kernel_endpoints = deduped_kernel_endpoints

        kernels: list[Any] = []
        kernel_endpoint_used = ""
        kernel_lookup_error = ""
        for kernel_url in kernel_endpoints:
            try:
                response = fetch(kernel_url, token=runtime_token, timeout=15)
                payload = response.json() if response.content else []
                if isinstance(payload, list):
                    kernels = payload
                else:
                    kernels = []
                kernel_endpoint_used = kernel_url
                kernel_lookup_error = ""
                break
            except Exception as exc:
                kernel_lookup_error = str(exc)

        if not isinstance(kernels, list):
            kernels = []

        _print_runtime_summary_panel(
            title="Agent Runtime Inspection",
            identifier=str(refreshed.pod_name or refreshed.uid or refreshed.name or ""),
            agentspec=_resolve_agentspec_label(runtime_payload),
            url=endpoint,
        )

        summary = Table(title="Agent Runtime Inspection")
        summary.add_column("Field", style="cyan")
        summary.add_column("Value")
        summary.add_row("Runtime", str(refreshed.name or pod_name))
        summary.add_row("Pod", str(pod_name))
        summary.add_row("UID", str(refreshed.uid or ""))
        summary.add_row("Ingress", endpoint)
        summary.add_row("Billable Account UID", display_billable_uid)
        if kernel_endpoint_used:
            summary.add_row("Kernels", str(len(kernels)))
            summary.add_row("Kernel API", kernel_endpoint_used)
        else:
            summary.add_row("Kernels", "unavailable")
            summary.add_row("Kernel API", "not exposed via ingress")
        console.print(summary)

        account_table = Table(title="Billable Account")
        account_table.add_column("Field", style="cyan")
        account_table.add_column("Value")
        account_table.add_row("UID", display_billable_uid)
        account_table.add_row("Handle", resolved_handle or "n/a")
        account_table.add_row("Type", resolved_kind or "n/a")
        account_table.add_row("Name", resolved_name or "n/a")
        account_table.add_row("Description", resolved_description or "n/a")
        console.print(account_table)

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
        else:
            if kernel_lookup_error:
                console.print(
                    "[yellow]Kernel list unavailable (all probed endpoints failed).[/yellow]"
                )
                console.print("[dim]Probed endpoints:[/dim]")
                for kernel_url in kernel_endpoints:
                    console.print(f"[dim]- {kernel_url}[/dim]")
                console.print(f"[dim]Last error: {kernel_lookup_error}[/dim]")
            else:
                console.print("[yellow]No kernels returned by runtime API.[/yellow]")
    except typer.Exit:
        raise
    except Exception as exc:
        console.print(f"[red]Error inspecting agent runtime: {exc}[/red]")
        raise typer.Exit(1)


@app.command(name="health")
def health_agent_runtime(
    agent: Optional[str] = typer.Option(
        None,
        "--agent",
        "-a",
        help="Agent identifier (pod name, uid, or given name). Defaults to first running runtime.",
    ),
    token: Optional[str] = typer.Option(
        None,
        "--api-key",
        help="API key (Bearer token for API requests).",
    ),
    iam_url: Optional[str] = typer.Option(
        None,
        "--iam-url",
        help="Datalayer IAM server URL",
    ),
    runtimes_url: Optional[str] = typer.Option(
        None,
        "--runtimes-url",
        help="Datalayer Runtimes server URL",
    ),
) -> None:
    """Check agent runtime health by executing a probe on the sandbox."""
    try:
        client = _make_client(
            token=token,
            iam_url=iam_url,
            runtimes_url=runtimes_url,
        )
        runtimes = client.list_runtimes()
        if not runtimes:
            console.print("[yellow]No running runtimes found.[/yellow]")
            raise typer.Exit(1)

        selected = None
        if agent:
            for candidate in runtimes:
                if agent in {candidate.pod_name, candidate.uid, candidate.name}:
                    selected = candidate
                    break
            if selected is None:
                console.print(f"[red]Agent '{agent}' not found.[/red]")
                raise typer.Exit(1)
        else:
            selected = runtimes[0]

        pod_name = selected.pod_name or selected.uid or selected.name or ""
        refreshed = client.get_runtime(pod_name)
        health = client.check_runtime_health(
            pod_name,
            api_key=token,
        )

        health_status = "alive" if bool(health.get("success")) else "unreachable"
        detail = str(health.get("message") or "health probe failed")
        probe_mode = str(health.get("probe_mode") or "n/a")

        table = Table(title="Agent Runtime Health")
        table.add_column("Field", style="cyan")
        table.add_column("Value")
        table.add_row("Runtime", str(refreshed.name or pod_name))
        table.add_row("Pod", str(pod_name))
        table.add_row("UID", str(refreshed.uid or ""))
        table.add_row("Ingress", str(refreshed.ingress or "n/a"))
        table.add_row("Probe", probe_mode)
        table.add_row("Status", health_status)
        table.add_row("Detail", detail)
        console.print(table)

        stdout_tail = str(health.get("stdout_tail") or "").strip()
        if stdout_tail:
            console.print(f"[dim]Probe stdout: {stdout_tail}[/dim]")

        if health_status != "alive":
            raise typer.Exit(1)
    except typer.Exit:
        raise
    except Exception as exc:
        console.print(f"[red]Error checking agent runtime health: {exc}[/red]")
        raise typer.Exit(1)
