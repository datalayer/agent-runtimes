# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Event commands for the agent-runtimes CLI."""

from __future__ import annotations

import json
import os
from typing import Any, Optional

import httpx
import typer

from agent_runtimes.events import (
    create_event,
    delete_event,
    get_event,
    list_events,
    mark_event_read,
    mark_event_unread,
)

DEFAULT_BASE_URL = "https://prod1.datalayer.run"

app = typer.Typer(
    name="events",
    help="Agent event management commands",
    invoke_without_command=True,
)


@app.callback()
def events_callback(ctx: typer.Context) -> None:
    """Agent event management commands."""
    if ctx.invoked_subcommand is None:
        typer.echo(ctx.get_help())


def _resolve_token(token: Optional[str]) -> str:
    resolved = token or os.environ.get("DATALAYER_API_KEY", "")
    if not resolved:
        raise ValueError("Missing token. Use --token or set DATALAYER_API_KEY.")
    return resolved


def _resolve_base_url(base_url: Optional[str]) -> str:
    return (
        base_url
        or os.environ.get("DATALAYER_AI_AGENTS_URL")
        or os.environ.get("AI_AGENTS_URL")
        or DEFAULT_BASE_URL
    ).rstrip("/")


def _list_all_events(token: str, base_url: str, kind: Optional[str] = None) -> dict[str, Any]:
    params: dict[str, Any] = {"limit": 100, "offset": 0}
    if kind:
        params["kind"] = kind
    response = httpx.get(
        f"{base_url}/api/ai-agents/v1/events",
        headers={"Authorization": f"Bearer {token}"},
        params=params,
        timeout=30.0,
    )
    response.raise_for_status()
    return response.json()


def _resolve_event_agent_id(token: str, base_url: str, event_id: str) -> str:
    data = _list_all_events(token=token, base_url=base_url)
    events = data.get("events", []) if isinstance(data, dict) else []
    for event in events:
        if str(event.get("id", "")) == event_id:
            agent_id = str(event.get("agent_id", ""))
            if agent_id:
                return agent_id
    raise ValueError(
        f"Unable to resolve agent_id for event '{event_id}'. Use --agent-id."
    )


def _print_events(events: list[dict[str, Any]]) -> None:
    if not events:
        typer.echo("No events found.")
        return
    typer.echo(json.dumps(events, indent=2, default=str))


@app.command(name="list")
def events_list(
    agent_id: Optional[str] = typer.Option(None, "--agent-id", help="Filter events by agent runtime ID."),
    kind: Optional[str] = typer.Option(None, "--kind", help="Filter events by kind."),
    token: Optional[str] = typer.Option(None, "--token", help="Authentication token (Bearer token for API requests)."),
    base_url: Optional[str] = typer.Option(None, "--base-url", help="Datalayer run base URL."),
) -> None:
    """List agent events."""
    try:
        resolved_token = _resolve_token(token)
        resolved_base_url = _resolve_base_url(base_url)
        if agent_id:
            result = list_events(
                token=resolved_token,
                agent_id=agent_id,
                kind=kind,
                base_url=resolved_base_url,
            )
        else:
            result = _list_all_events(
                token=resolved_token,
                base_url=resolved_base_url,
                kind=kind,
            )
        events = result.get("events", []) if isinstance(result, dict) else []
        _print_events(events)
    except Exception as e:
        typer.echo(f"Error listing events: {e}", err=True)
        raise typer.Exit(1)


@app.command(name="ls")
def events_ls(
    agent_id: Optional[str] = typer.Option(None, "--agent-id", help="Filter events by agent runtime ID."),
    kind: Optional[str] = typer.Option(None, "--kind", help="Filter events by kind."),
    token: Optional[str] = typer.Option(None, "--token", help="Authentication token (Bearer token for API requests)."),
    base_url: Optional[str] = typer.Option(None, "--base-url", help="Datalayer run base URL."),
) -> None:
    """List agent events (alias for list)."""
    events_list(agent_id=agent_id, kind=kind, token=token, base_url=base_url)


@app.command(name="get")
def events_get(
    event_id: str = typer.Argument(..., help="ID of the event to retrieve."),
    agent_id: Optional[str] = typer.Option(None, "--agent-id", help="Agent runtime ID owning the event (recommended)."),
    token: Optional[str] = typer.Option(None, "--token", help="Authentication token (Bearer token for API requests)."),
    base_url: Optional[str] = typer.Option(None, "--base-url", help="Datalayer run base URL."),
) -> None:
    """Get a single event by ID."""
    try:
        resolved_token = _resolve_token(token)
        resolved_base_url = _resolve_base_url(base_url)
        resolved_agent_id = agent_id or _resolve_event_agent_id(
            token=resolved_token,
            base_url=resolved_base_url,
            event_id=event_id,
        )
        event = get_event(
            token=resolved_token,
            agent_id=resolved_agent_id,
            event_id=event_id,
            base_url=resolved_base_url,
        )
        typer.echo(json.dumps(event, indent=2, default=str))
    except Exception as e:
        typer.echo(f"Error getting event: {e}", err=True)
        raise typer.Exit(1)


@app.command(name="create")
def events_create(
    agent_id: str = typer.Argument(..., help="Agent runtime ID."),
    title: str = typer.Argument(..., help="Event title."),
    kind: str = typer.Option("generic", "--kind", help="Event kind."),
    status: str = typer.Option("pending", "--status", help="Event status."),
    token: Optional[str] = typer.Option(None, "--token", help="Authentication token (Bearer token for API requests)."),
    base_url: Optional[str] = typer.Option(None, "--base-url", help="Datalayer run base URL."),
) -> None:
    """Create a new agent event."""
    try:
        event = create_event(
            token=_resolve_token(token),
            agent_id=agent_id,
            title=title,
            kind=kind,
            status=status,
            base_url=_resolve_base_url(base_url),
        )
        typer.echo(json.dumps(event, indent=2, default=str))
    except Exception as e:
        typer.echo(f"Error creating event: {e}", err=True)
        raise typer.Exit(1)


@app.command(name="delete")
def events_delete(
    event_id: str = typer.Argument(..., help="ID of the event to delete."),
    agent_id: Optional[str] = typer.Option(None, "--agent-id", help="Agent runtime ID owning the event (recommended)."),
    token: Optional[str] = typer.Option(None, "--token", help="Authentication token (Bearer token for API requests)."),
    base_url: Optional[str] = typer.Option(None, "--base-url", help="Datalayer run base URL."),
) -> None:
    """Delete an event by ID."""
    try:
        resolved_token = _resolve_token(token)
        resolved_base_url = _resolve_base_url(base_url)
        resolved_agent_id = agent_id or _resolve_event_agent_id(
            token=resolved_token,
            base_url=resolved_base_url,
            event_id=event_id,
        )
        delete_event(
            token=resolved_token,
            agent_id=resolved_agent_id,
            event_id=event_id,
            base_url=resolved_base_url,
        )
        typer.echo(f"Event {event_id} deleted.")
    except Exception as e:
        typer.echo(f"Error deleting event: {e}", err=True)
        raise typer.Exit(1)


@app.command(name="mark-read")
def events_mark_read(
    event_id: str = typer.Argument(..., help="ID of the event to mark as read."),
    agent_id: Optional[str] = typer.Option(None, "--agent-id", help="Agent runtime ID owning the event (recommended)."),
    token: Optional[str] = typer.Option(None, "--token", help="Authentication token (Bearer token for API requests)."),
    base_url: Optional[str] = typer.Option(None, "--base-url", help="Datalayer run base URL."),
) -> None:
    """Mark an event as read."""
    try:
        resolved_token = _resolve_token(token)
        resolved_base_url = _resolve_base_url(base_url)
        resolved_agent_id = agent_id or _resolve_event_agent_id(
            token=resolved_token,
            base_url=resolved_base_url,
            event_id=event_id,
        )
        mark_event_read(
            token=resolved_token,
            agent_id=resolved_agent_id,
            event_id=event_id,
            base_url=resolved_base_url,
        )
        typer.echo(f"Event {event_id} marked as read.")
    except Exception as e:
        typer.echo(f"Error marking event as read: {e}", err=True)
        raise typer.Exit(1)


@app.command(name="mark-unread")
def events_mark_unread(
    event_id: str = typer.Argument(..., help="ID of the event to mark as unread."),
    agent_id: Optional[str] = typer.Option(None, "--agent-id", help="Agent runtime ID owning the event (recommended)."),
    token: Optional[str] = typer.Option(None, "--token", help="Authentication token (Bearer token for API requests)."),
    base_url: Optional[str] = typer.Option(None, "--base-url", help="Datalayer run base URL."),
) -> None:
    """Mark an event as unread."""
    try:
        resolved_token = _resolve_token(token)
        resolved_base_url = _resolve_base_url(base_url)
        resolved_agent_id = agent_id or _resolve_event_agent_id(
            token=resolved_token,
            base_url=resolved_base_url,
            event_id=event_id,
        )
        mark_event_unread(
            token=resolved_token,
            agent_id=resolved_agent_id,
            event_id=event_id,
            base_url=resolved_base_url,
        )
        typer.echo(f"Event {event_id} marked as unread.")
    except Exception as e:
        typer.echo(f"Error marking event as unread: {e}", err=True)
        raise typer.Exit(1)