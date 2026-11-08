# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""``loop tool-approvals``: list, approve and reject the tool calls waiting on you.

An agent whose tool call needs a person's approval asks ai-agents, and the run
waits until that person decides. These commands read and decide those
approvals with your own token, the way the approvals page of datalayer.ai
does: ai-agents tells the waiting run first, so it goes on (or is refused) as
soon as you decide.

An id may be given whole, or as the start of one: a prefix names the one
pending approval that starts with it, and is refused when it names none or
several.
"""

from __future__ import annotations

import json
import os
from typing import Any, Optional

import httpx
import typer
from rich.console import Console
from rich.table import Table

app = typer.Typer(
    name="tool-approvals",
    help="List, approve and reject the tool calls waiting on your approval.",
    invoke_without_command=True,
    pretty_exceptions_show_locals=False,
)

console = Console()

API_PATH = "/api/ai-agents/v1/tool-approvals"


class ApprovalsError(Exception):
    """An approval could not be read or decided; the message says why."""


def _resolve_token(token: Optional[str]) -> str:
    if token:
        return token
    env_token = os.environ.get("DATALAYER_API_KEY")
    if env_token:
        return env_token
    try:
        from agent_runtimes.client import AgentClient

        return AgentClient()._get_api_key() or ""
    except Exception:
        return ""


def _resolve_base_url(ai_agents_url: Optional[str]) -> str:
    from datalayer_core.utils.urls import DatalayerURLs

    urls = DatalayerURLs.from_environment(ai_agents_url=ai_agents_url)
    return str(urls.ai_agents_url).rstrip("/")


class ApprovalsClient:
    """ai-agents' tool approvals, as the person the token names."""

    def __init__(
        self,
        base_url: str,
        token: str,
        *,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        if not token:
            raise ApprovalsError(
                "Not signed in: pass --api-key, set DATALAYER_API_KEY, or run 'datalayer login'."
            )
        self._client = httpx.Client(
            base_url=base_url,
            headers={"Authorization": f"Bearer {token}"},
            timeout=30.0,
            transport=transport,
        )

    def _request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        try:
            response = self._client.request(method, f"{API_PATH}{path}", **kwargs)
        except httpx.HTTPError as exc:
            raise ApprovalsError(f"ai-agents did not answer: {exc}") from exc
        if response.status_code >= 400:
            try:
                detail = response.json().get("detail")
            except Exception:
                detail = None
            raise ApprovalsError(
                f"ai-agents answered {response.status_code}: {detail or response.text[:200]}"
            )
        return response.json()

    def list(
        self,
        *,
        status: Optional[str] = "pending",
        agent_id: Optional[str] = None,
        tool_name: Optional[str] = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {"limit": limit}
        if status:
            params["status"] = status
        if agent_id:
            params["agent_id"] = agent_id
        if tool_name:
            params["tool_name"] = tool_name
        return list(self._request("GET", "", params=params).get("approvals") or [])

    def get(self, approval_id: str) -> dict[str, Any]:
        """One approval, decided or not."""
        data = self._request("GET", f"/{approval_id}")
        return dict(data.get("approval") or data)

    def resolve_id(self, ref: str) -> str:
        """The whole id of the pending approval *ref* names (itself or its start)."""
        ref = ref.strip()
        if not ref:
            raise ApprovalsError("Name an approval by its id.")
        pending = self.list(status="pending", limit=200)
        ids = [str(a.get("id", "")) for a in pending]
        if ref in ids:
            return ref
        matches = [i for i in ids if i.startswith(ref)]
        if len(matches) == 1:
            return matches[0]
        if len(matches) > 1:
            raise ApprovalsError(
                f"'{ref}' starts {len(matches)} pending approvals: give more of its id."
            )
        # Not pending (or not a prefix): ai-agents says what it is.
        return ref

    def decide(
        self, approval_id: str, *, approve: bool, note: Optional[str]
    ) -> dict[str, Any]:
        verb = "approve" if approve else "reject"
        body = {"note": note} if note else {}
        return dict(
            self._request("POST", f"/{approval_id}/{verb}", json=body).get("approval")
            or {}
        )


def _args_summary(args: Any, width: int = 60) -> str:
    if not args:
        return ""
    text = (
        json.dumps(args, sort_keys=True, ensure_ascii=False)
        if not isinstance(args, str)
        else args
    )
    return text if len(text) <= width else text[: width - 1] + "…"


def _render(approvals: list[dict[str, Any]], *, out: Console) -> None:
    if not approvals:
        out.print("No tool approvals.")
        return
    table = Table(show_header=True, header_style="bold")
    for column in ("Id", "Status", "Tool", "Agent", "Runtime", "Asked", "Arguments"):
        table.add_column(column, overflow="fold")
    for a in approvals:
        table.add_row(
            str(a.get("id", "")),
            str(a.get("status", "")),
            str(a.get("tool_name", "")),
            str(a.get("agent_id", "")),
            str(a.get("runtime_name", "")),
            str(a.get("created_at", ""))[:19],
            _args_summary(a.get("tool_args")),
        )
    out.print(table)


def _client(api_key: Optional[str], ai_agents_url: Optional[str]) -> ApprovalsClient:
    return ApprovalsClient(_resolve_base_url(ai_agents_url), _resolve_token(api_key))


API_KEY_OPTION = typer.Option(
    None,
    "--api-key",
    help="Your Datalayer token (default: DATALAYER_API_KEY, then your login).",
)
AI_AGENTS_URL_OPTION = typer.Option(
    None,
    "--ai-agents-url",
    help="ai-agents' address (default: DATALAYER_AI_AGENTS_URL).",
)


@app.callback()
def tool_approvals_callback(ctx: typer.Context) -> None:
    """List, approve and reject the tool calls waiting on your approval."""
    if ctx.invoked_subcommand is None:
        typer.echo(ctx.get_help())


@app.command(name="ls", hidden=True)
@app.command(name="list")
def tool_approvals_list(
    status: str = typer.Option(
        "pending",
        "--status",
        "-s",
        help="pending (default), approved, rejected, expired, or all.",
    ),
    agent_id: Optional[str] = typer.Option(
        None, "--agent", "-a", help="Only this agent's."
    ),
    tool_name: Optional[str] = typer.Option(
        None, "--tool", "-t", help="Only this tool's."
    ),
    limit: int = typer.Option(50, "--limit", "-n", min=1, max=200),
    as_json: bool = typer.Option(False, "--json", help="Print the records as JSON."),
    api_key: Optional[str] = API_KEY_OPTION,
    ai_agents_url: Optional[str] = AI_AGENTS_URL_OPTION,
) -> None:
    """List the tool approvals waiting on you (or, with --status, decided ones)."""
    try:
        approvals = _client(api_key, ai_agents_url).list(
            status=None if status == "all" else status,
            agent_id=agent_id,
            tool_name=tool_name,
            limit=limit,
        )
    except ApprovalsError as exc:
        console.print(f"[red]{exc}[/red]")
        raise typer.Exit(1) from exc
    if as_json:
        typer.echo(json.dumps(approvals, indent=2, default=str))
        return
    _render(approvals, out=console)


def _decide(
    ref: str,
    *,
    approve: bool,
    note: Optional[str],
    api_key: Optional[str],
    ai_agents_url: Optional[str],
) -> None:
    try:
        client = _client(api_key, ai_agents_url)
        approval_id = client.resolve_id(ref)
        record = client.decide(approval_id, approve=approve, note=note)
    except ApprovalsError as exc:
        console.print(f"[red]{exc}[/red]")
        raise typer.Exit(1) from exc
    console.print(
        f"{'Approved' if approve else 'Rejected'} {record.get('tool_name') or 'the tool call'}"
        f" ({approval_id}) for {record.get('agent_id') or 'the agent'}."
    )


@app.command(name="approve")
def tool_approvals_approve(
    approval_id: str = typer.Argument(
        ..., help="The approval's id, or the start of it."
    ),
    note: Optional[str] = typer.Option(
        None, "--note", help="A note kept with the decision."
    ),
    api_key: Optional[str] = API_KEY_OPTION,
    ai_agents_url: Optional[str] = AI_AGENTS_URL_OPTION,
) -> None:
    """Approve a pending tool call: the waiting run goes on."""
    _decide(
        approval_id,
        approve=True,
        note=note,
        api_key=api_key,
        ai_agents_url=ai_agents_url,
    )


@app.command(name="reject")
def tool_approvals_reject(
    approval_id: str = typer.Argument(
        ..., help="The approval's id, or the start of it."
    ),
    note: Optional[str] = typer.Option(
        None, "--note", help="A note kept with the decision (the agent is told it)."
    ),
    api_key: Optional[str] = API_KEY_OPTION,
    ai_agents_url: Optional[str] = AI_AGENTS_URL_OPTION,
) -> None:
    """Reject a pending tool call: the waiting run is refused it."""
    _decide(
        approval_id,
        approve=False,
        note=note,
        api_key=api_key,
        ai_agents_url=ai_agents_url,
    )
