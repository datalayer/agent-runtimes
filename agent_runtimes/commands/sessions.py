# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Sessions: `loop sessions …` (MH-17).

A session is one conversation of one person with one application's agent,
kept in the application's record: one id a person lists, resumes, swaps,
clones, exports and ends — on the web, here, from the phone later. The verbs
act on a runtime that runs the application, through its session API
(``/api/v1/apps/sessions``): ``--server`` names it (``AGENT_RUNTIMES_URL``,
else the local server on port 8000); ``--cloud`` signs the calls with the
token ``datalayer login`` left (or ``DATALAYER_API_KEY``), for a runtime on
Datalayer. The session id is the same in both, because the record is one.

Progress goes to standard error, the answers to standard output, as
``loop --prompt`` does; every refusal is the runtime's sentence, and the
command exits 1 on it.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

import typer
from rich.console import Console

app = typer.Typer(
    name="sessions",
    help="Sessions: list, show, resume, swap, clone, export, import, end.",
    invoke_without_command=True,
    pretty_exceptions_show_locals=False,
)
console = Console(soft_wrap=True)
errors = Console(stderr=True, soft_wrap=True)

#: Where the local runtime answers when nothing names one.
DEFAULT_SERVER = "http://localhost:8000"

#: The old verbs, retired (decision 17): each answers with this sentence.
RETIRED = {
    "threads": "`loop apps threads` is retired: list your conversations with `loop sessions list [--app <id>]`.",
    "feedback": "`loop apps feedback` is retired: read what people said of a conversation with `loop sessions feedback <uid>`.",
}


class SessionsRefused(RuntimeError):
    """What the runtime refused, in its sentence."""


def _server_option() -> Any:
    return typer.Option(
        None,
        "--server",
        "-s",
        help="The runtime that runs the application (AGENT_RUNTIMES_URL, else the local server).",
    )


def _cloud_option() -> Any:
    return typer.Option(
        False,
        "--cloud",
        help="Sign the calls with your Datalayer token, for a runtime on Datalayer.",
    )


def _client(server: Optional[str], cloud: bool) -> Any:
    """An HTTP client of the runtime's session API, signed when asked.

    A test installs its own through :func:`use_client`.
    """
    if _clients["make"] is not None:
        return _clients["make"](server, cloud)
    import httpx

    base = (server or os.environ.get("AGENT_RUNTIMES_URL") or DEFAULT_SERVER).rstrip(
        "/"
    )
    headers: Dict[str, str] = {}
    if cloud:
        from agent_runtimes.loop.launch import NotSignedIn, make_client

        try:
            _, token = make_client()
        except NotSignedIn as refused:
            raise SessionsRefused(
                f"{refused} Sign in with `datalayer login`."
            ) from None
        headers["Authorization"] = f"Bearer {token}"
    elif os.environ.get("DATALAYER_API_KEY"):
        headers["Authorization"] = f"Bearer {os.environ['DATALAYER_API_KEY']}"
    return httpx.Client(base_url=base, headers=headers, timeout=120.0)


_clients: Dict[str, Any] = {"make": None}


def use_client(make: Any) -> None:
    """What makes the runtime's client — ``(server, cloud) -> client`` — for a test; ``None`` for httpx."""
    _clients["make"] = make


def _refusal_of(response: Any) -> str:
    try:
        detail = response.json().get("detail")
    except ValueError:
        detail = None
    if isinstance(detail, dict):
        detail = "; ".join(str(p) for p in detail.get("problems") or [detail])
    return str(
        detail or response.text or f"The runtime answered {response.status_code}."
    )


def _ask(client: Any, method: str, path: str, **kwargs: Any) -> Any:
    response = client.request(method, f"/api/v1/apps/sessions{path}", **kwargs)
    if response.status_code >= 300:
        raise SessionsRefused(_refusal_of(response))
    return response


def _exit(refused: Exception) -> None:
    errors.print(f"[red]✗[/red] {refused}", markup=True)
    raise typer.Exit(1)


def session_line(session: Dict[str, Any]) -> str:
    """One session as `loop sessions list` prints it (§5 of the session model)."""
    turns = int(session.get("turns") or 0)
    runs_on = session.get("runs_on") or {}
    where = (
        f"on runtime {runs_on.get('uid')}"
        if runs_on and runs_on.get("kind") == "runtime"
        else f"on run {runs_on.get('execution_id')}"
        if runs_on and runs_on.get("kind") == "team_run"
        else "not running"
    )
    lineage = session.get("lineage") or {}
    said = ""
    if lineage.get("forked_from"):
        said = f"cloned from {lineage['forked_from']['uid']} at turn {lineage['forked_from']['at_turn']}"
    elif lineage.get("imported_from"):
        said = f"imported from {str(lineage['imported_from'].get('digest') or '')[:19]}"
    title = str(session.get("title") or "")
    return "  ".join(
        part
        for part in (
            str(session.get("uid") or ""),
            f"{session.get('state', ''):<6}",
            str(session.get("agent") or ""),
            f"{turns} turn{'s' if turns != 1 else ''}",
            where,
            said,
            f"— {title}" if title else "",
        )
        if part
    )


def show_lines(session: Dict[str, Any]) -> List[str]:
    """A session, field by field, as `loop sessions show` prints it."""
    lines = [
        f"uid        {session.get('uid')}",
        f"title      {session.get('title') or '(none)'}",
        f"state      {session.get('state')}  turn {session.get('turn', 'idle')}  held {'yes' if session.get('held') else 'no'}",
        f"agent      {session.get('agent')}"
        + (f"  harness {session['harness']}" if session.get("harness") else ""),
        f"app        {(session.get('app') or {}).get('id')}  version {(session.get('instance') or session.get('app') or {}).get('version')}",
        f"turns      {session.get('turns')}",
        f"runs on    {json.dumps(session.get('runs_on')) if session.get('runs_on') else 'nothing'}",
        f"lineage    {json.dumps(session.get('lineage'))}",
        f"archived   {'yes' if session.get('archived') else 'no'}",
        f"started    {session.get('started_at')}",
    ]
    row = session.get("harness_session")
    if row:
        lines.append(
            f"harness    session {row.get('acp_session_id')} of {row.get('harness')}, "
            f"vendor id {row.get('native_session_id') or 'absent (' + str(row.get('native_session')) + ')'}"
        )
    return lines


@app.callback()
def sessions() -> None:
    """Your sessions on a runtime: list, show, resume, swap, clone, export, import, end."""


@app.command(name="list")
def list_sessions(
    app_id: str = typer.Option(
        "", "--app", help="One application's sessions, by its id."
    ),
    all_sessions: bool = typer.Option(False, "--all", help="The archived ones too."),
    state: str = typer.Option("", "--state", help="open, paused or ended."),
    limit: int = typer.Option(50, "--limit", min=1, max=200),
    server: Optional[str] = _server_option(),
    cloud: bool = _cloud_option(),
) -> None:
    """List your sessions, held and recorded, newest first."""
    try:
        client = _client(server, cloud)
        params: Dict[str, Any] = {"limit": limit}
        if app_id:
            params["app"] = app_id
        if all_sessions:
            params["archived"] = "true"
        if state:
            params["state"] = state
        answer = _ask(client, "GET", "", params=params).json()
    except SessionsRefused as refused:
        _exit(refused)
        return
    if not answer.get("sessions"):
        console.print(
            "No session yet." if not app_id else f"No session of {app_id} yet."
        )
        return
    for session in answer["sessions"]:
        console.print(session_line(session), markup=False)
    if answer.get("has_more"):
        errors.print(f"More: `loop sessions list --limit {limit * 2}`.")


@app.command(name="show")
def show(
    uid: str = typer.Argument(..., help="The session's id."),
    server: Optional[str] = _server_option(),
    cloud: bool = _cloud_option(),
) -> None:
    """What a session is: its state, agent, turns, lineage, where it runs, its harness row."""
    try:
        session = _ask(_client(server, cloud), "GET", f"/{uid}").json()
    except SessionsRefused as refused:
        _exit(refused)
        return
    for line in show_lines(session):
        console.print(line, markup=False)


def _stream_events(response: Any) -> List[Dict[str, Any]]:
    events: List[Dict[str, Any]] = []
    for block in response.text.split("\n\n"):
        data = "".join(
            line[len("data:") :].strip()
            for line in block.splitlines()
            if line.startswith("data:")
        )
        if data:
            try:
                events.append(json.loads(data))
            except ValueError:
                continue
    return events


@app.command(name="resume")
def resume(
    uid: str = typer.Argument(..., help="The session's id."),
    agent: str = typer.Option(
        "",
        "--agent",
        help="The application's agent on the runtime, for a session it no longer holds.",
    ),
    server: Optional[str] = _server_option(),
    cloud: bool = _cloud_option(),
) -> None:
    """Resume a paused session — held, or from its record on a runtime of its application."""
    try:
        client = _client(server, cloud)
        response = _ask(client, "POST", f"/{uid}/resume", json={"agent": agent})
        session = _ask(client, "GET", f"/{uid}").json()
    except SessionsRefused as refused:
        _exit(refused)
        return
    events = _stream_events(response)
    replayed = sum(
        1
        for e in events
        if e.get("type") == "MESSAGES_SNAPSHOT"
        for m in e.get("messages") or []
        if m.get("role") == "user"
    )
    said = [
        str(e.get("delta") or "")
        for e in events
        if e.get("type") == "TEXT_MESSAGE_CONTENT"
    ]
    where = (
        f"on runtime {session['runs_on']['uid']}" if session.get("runs_on") else "here"
    )
    console.print(
        f"Resuming {uid} {where} ({session.get('agent')}): {replayed} turn{'s' if replayed != 1 else ''} replayed."
        + (f" {''.join(said).strip()}" if said else ""),
        markup=False,
    )


@app.command(name="swap")
def swap(
    uid: str = typer.Argument(..., help="The session's id."),
    agent: str = typer.Option(..., "--agent", help="The agentspec to go on with."),
    server: Optional[str] = _server_option(),
    cloud: bool = _cloud_option(),
) -> None:
    """Swap the session's agent in place; the new agent is told in a sentence."""
    try:
        answer = _ask(
            _client(server, cloud), "POST", f"/{uid}/agent", json={"agent": agent}
        ).json()
    except SessionsRefused as refused:
        _exit(refused)
        return
    dropped = answer.get("dropped") or {}
    always = int(dropped.get("allow_always") or 0)
    console.print(
        f'{answer.get("agent")} is told: "{answer.get("said")}"', markup=False
    )
    if always:
        console.print(
            f"{always} allow-always answer{'s' if always != 1 else ''} dropped.",
            markup=False,
        )
    console.print(
        f"Swapped. {answer.get('agent')} answers from turn {int((answer.get('carried') or {}).get('turns') or 0) + 1}.",
        markup=False,
    )


@app.command(name="clone")
def clone(
    uid: str = typer.Argument(..., help="The session's id."),
    at: Optional[int] = typer.Option(
        None, "--at", help="The turn to cut at; the last one unsaid."
    ),
    agent: str = typer.Option("", "--agent", help="Another agentspec for the clone."),
    title: str = typer.Option("", "--title", help="The clone's title."),
    server: Optional[str] = _server_option(),
    cloud: bool = _cloud_option(),
) -> None:
    """Clone a session from a turn: a new session, paused, the same or another agent."""
    try:
        answer = _ask(
            _client(server, cloud),
            "POST",
            f"/{uid}/clone",
            json={"up_to_turn": at, "agent": agent or None, "title": title},
        ).json()
    except SessionsRefused as refused:
        _exit(refused)
        return
    console.print(
        f"Cloned as {answer['uid']} (paused, {answer['turns']} turn{'s' if answer['turns'] != 1 else ''}"
        + (f", on {answer['agent']}" if agent else "")
        + f"). Resume it: loop sessions resume {answer['uid']}",
        markup=False,
    )
    if answer.get("said"):
        console.print(
            f'{answer["agent"]} will be told: "{answer["said"]}"', markup=False
        )


@app.command(name="export")
def export(
    uid: str = typer.Argument(..., help="The session's id."),
    output: Optional[Path] = typer.Option(
        None, "--output", "-o", help="The file; <uid>.session.jsonl beside you unsaid."
    ),
    format_id: str = typer.Option(
        "", "--format", help="The file format; datalayer-session/1 unsaid."
    ),
    server: Optional[str] = _server_option(),
    cloud: bool = _cloud_option(),
) -> None:
    """Export a session as a file: the session line, every entry, redacted."""
    try:
        response = _ask(
            _client(server, cloud),
            "GET",
            f"/{uid}/export",
            params={"format": format_id} if format_id else None,
        )
    except SessionsRefused as refused:
        _exit(refused)
        return
    path = output or Path(f"{uid}.session.jsonl")
    path.write_text(response.text, encoding="utf-8")
    head = json.loads(response.text.split("\n", 1)[0])
    console.print(
        f"Exported {head['turns']} turn{'s' if head['turns'] != 1 else ''}, {head['entries']} entries, "
        f"{head['redactions']} redaction{'s' if head['redactions'] != 1 else ''} → {path} "
        f"({response.headers.get('x-session-digest', '')}).",
        markup=False,
    )


@app.command(name="import")
def import_(
    file: Path = typer.Argument(..., help="A .session.jsonl file."),
    agent: str = typer.Option(
        "",
        "--agent",
        help="The agent to import onto, when the file's is not on the runtime.",
    ),
    format_id: str = typer.Option(
        "", "--format", help="The file format; datalayer-session/1 unsaid."
    ),
    server: Optional[str] = _server_option(),
    cloud: bool = _cloud_option(),
) -> None:
    """Import a session file: a new session, paused, you its author."""
    if not file.is_file():
        _exit(SessionsRefused(f"There is no file {file}."))
        return
    try:
        params: Dict[str, str] = {}
        if agent:
            params["agent"] = agent
        if format_id:
            params["format"] = format_id
        answer = _ask(
            _client(server, cloud),
            "POST",
            "/import",
            params=params or None,
            content=file.read_bytes(),
            headers={"Content-Type": "application/x-ndjson"},
        ).json()
    except SessionsRefused as refused:
        _exit(refused)
        return
    versions = answer.get("versions") or {}
    console.print(
        f"Imported as {answer['uid']} (paused, {answer['turns']} turn{'s' if answer['turns'] != 1 else ''}, "
        f"{answer['redactions']} redaction{'s' if answer['redactions'] != 1 else ''}"
        + (
            f"; the file is version {versions['file']} of the application, this is {versions['current']}"
            if versions and versions.get("file") != versions.get("current")
            else ""
        )
        + f"). Resume it: loop sessions resume {answer['uid']}",
        markup=False,
    )


@app.command(name="end")
def end(
    uid: str = typer.Argument(..., help="The session's id."),
    server: Optional[str] = _server_option(),
    cloud: bool = _cloud_option(),
) -> None:
    """End a session for good; its record stays."""
    try:
        answer = _ask(_client(server, cloud), "POST", f"/{uid}/end").json()
    except SessionsRefused as refused:
        _exit(refused)
        return
    console.print(f"Ended {answer.get('uid')}.", markup=False)


@app.command(name="feedback")
def feedback(
    uid: str = typer.Argument(..., help="The session's id."),
    server: Optional[str] = _server_option(),
    cloud: bool = _cloud_option(),
) -> None:
    """What people said of a session's answers: each thumb and comment, oldest first."""
    try:
        entries = _ask(_client(server, cloud), "GET", f"/{uid}/export").text
    except SessionsRefused as refused:
        _exit(refused)
        return
    said = []
    for line in entries.split("\n")[1:]:
        if not line.strip():
            continue
        entry = json.loads(line)
        if entry.get("kind") == "feedback":
            payload = entry.get("payload") or {}
            said.append(
                f"{entry.get('at', '')}  {payload.get('thumb', '')}  {payload.get('comment', '') or entry.get('summary', '')}"
            )
    if not said:
        console.print(f"Nothing was said of {uid}'s answers.")
        return
    for line in said:
        console.print(line, markup=False)


def retired(verb: str) -> str:
    """The sentence a retired `loop apps` verb answers with."""
    return RETIRED[verb]


__all__ = [
    "DEFAULT_SERVER",
    "RETIRED",
    "SessionsRefused",
    "app",
    "retired",
    "session_line",
    "show_lines",
    "use_client",
]


if __name__ == "__main__":  # pragma: no cover
    sys.exit(app())
