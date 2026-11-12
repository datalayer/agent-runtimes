# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Sessions: `loop sessions …` (MH-17).

With nothing else, `loop sessions` is the picker: your sessions in two
groups, **On this machine** and **On Datalayer**, one to choose and resume
where it lives, pause, end, transfer, export, delete or start over
(`agent_runtimes.loop.picker`); without a terminal, or with `--json`, the
same two groups printed. A session on this machine is a folder of
``~/.datalayer/sessions`` named by its uid; one on Datalayer is in the
account's record. `transfer` moves one between the two under the same uid,
`delete` deletes one, on this machine or, signed in, on Datalayer.

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
from typing import Any, Dict, List, Optional, Tuple

import typer
from rich.console import Console

app = typer.Typer(
    name="sessions",
    help=(
        "Sessions. With nothing else: pick one of your sessions, on this machine and on Datalayer, "
        "to resume, pause, end, transfer, export, delete or start over. "
        "Else: list, show, resume, pause, swap, clone, export, import, end, transfer, delete."
    ),
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
            # What it is a session of: an application, or an agent run as such.
            f"{'agent' if session.get('kind') == 'agent' else 'app':<5}",
            str(session.get("agent") or ""),
            f"{turns} turn{'s' if turns != 1 else ''}",
            where,
            "archived" if session.get("archived") else "",
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


# --- the picker: every session, in its two places -------------------------------


def _token() -> str:
    """The person's Datalayer token, or ``""`` signed out."""
    from agent_runtimes.loop.launch import make_client

    try:
        _, token = make_client()
    except Exception:  # noqa: BLE001 - signed out: the sessions of this machine only
        return ""
    return str(token or "")


def every_session(token: str, **stubs: Any) -> List[Any]:
    """Every session of the person, of every state, newest first: those on
    this machine and, signed in, those on Datalayer."""
    from agent_runtimes.loop.paused import STATES, paused_sessions

    return paused_sessions(
        token=token,
        states=STATES,
        say=lambda line: errors.print(line, markup=False),
        **stubs,
    )


def _place_of(row: Any, token: str) -> Any:
    from agent_runtimes.loop.paused import ON_THIS_MACHINE
    from agent_runtimes.loop.transfer import OnDatalayer, ThisMachine

    return ThisMachine() if row.where == ON_THIS_MACHINE else OnDatalayer(token)


def resume_command(row: Any) -> List[str]:
    """What goes on with a session where it lives."""
    return ["--resume", row.uid]


def start_over_command(row: Any) -> List[str]:
    """What opens a new session of the same agent or application, where this one lives."""
    from agent_runtimes.loop.paused import ON_DATALAYER

    place = "--cloud" if row.where == ON_DATALAYER else "--local"
    if row.kind == "agent":
        return ["-a", row.agent, place]
    return ["apps", "run", row.app_uid] + (["--cloud"] if place == "--cloud" else [])


def _run_loop(arguments: List[str]) -> None:
    """Go on as `loop <arguments>`: this process becomes it."""
    console.print(f"loop {' '.join(arguments)}", markup=False, style="dim")
    os.execvp(sys.argv[0], [sys.argv[0], *arguments])


def export_to_file(row: Any, token: str, folder: Optional[Path] = None) -> str:
    """A session written as a session file in the folder, from where it is kept."""
    import asyncio

    from agent_runtimes.apps.record import session_from_entries
    from agent_runtimes.apps.session_files import format_named

    entries = asyncio.run(_place_of(row, token).entries(row.uid))
    described = session_from_entries(row.uid, [dict(entry) for entry in entries])
    if described is None:
        raise SessionsRefused(f"There is no session {row.uid} to export.")
    # A session file names its owner; this machine's own sessions, opened by
    # nobody signed in, are said `local`.
    owner = str((described.get("opened_by") or {}).get("uid") or "local")
    exported = format_named("").export(
        {**described, "opened_by": {"uid": owner}}, entries, exported_by=owner
    )
    out = (folder or Path.cwd()) / f"{row.uid}.session.jsonl"
    out.write_text("\n".join(exported.lines) + "\n")
    return (
        f"Exported {exported.turns} turn{'s' if exported.turns != 1 else ''}, {exported.entries} entries, "
        f"{exported.redactions} redaction{'s' if exported.redactions != 1 else ''} → {out}."
    )


def end_session(row: Any, token: str) -> str:
    """A paused session ended, in its record, where it is kept."""
    import asyncio

    asyncio.run(
        _place_of(row, token).append(
            row.uid,
            [
                {
                    "kind": "ended",
                    "summary": "Ended from the terminal",
                    "payload": {"state": "ended"},
                }
            ],
            {"app_uid": row.app_uid},
        )
    )
    return f"Ended {row.uid}: its record stays, and it is not resumed. Clone it to go on from it."


def delete_session(uid: str, token: str = "", where: str = "") -> str:
    """A session deleted for good where it is kept: a folder of this machine,
    or, signed in, the person's record on Datalayer (one session they opened;
    an open one is refused there, in its sentence). ``where`` names the place
    when it is known (the picker's row); otherwise this machine first."""
    import asyncio

    from agent_runtimes.apps.session_store import FileSessionStore, SessionStoreError
    from agent_runtimes.loop.paused import ON_DATALAYER, ON_THIS_MACHINE
    from agent_runtimes.loop.transfer import OnDatalayer

    store = FileSessionStore()
    if where != ON_DATALAYER and store.delete(uid):
        return f"Deleted {uid} from this machine ({store.root / uid})."
    if where == ON_THIS_MACHINE:
        raise SessionsRefused(
            f"There is no session {uid} on this machine ({store.root})."
        )
    if not token:
        raise SessionsRefused(
            f"There is no session {uid} on this machine ({store.root}). A session on Datalayer is "
            "deleted signed in: `datalayer login`."
        )
    try:
        asyncio.run(OnDatalayer(token).remove(uid))
    except SessionStoreError as refused:
        raise SessionsRefused(refused.reason) from None
    return f"Deleted {uid} from your Datalayer account's record."


#: The answers `delete_across` takes for each session.
DELETE_KEEP, DELETE_YES, DELETE_STOP = "keep", "delete", "stop"


def delete_across(
    rows: List[Any],
    token: str,
    ask: Any,
    say: Any,
    delete: Any = None,
) -> Tuple[int, int]:
    """Go through every session, asking of each whether to delete it.

    ``ask(row)`` answers ``DELETE_YES``, ``DELETE_KEEP`` or ``DELETE_STOP``
    (nothing more is asked); a refused delete (an open session on Datalayer, one
    nobody may delete) is said and the walk goes on. Returns how many were
    deleted and how many kept.
    """
    delete = delete or delete_session
    deleted = kept = 0
    for row in rows:
        answer = ask(row)
        if answer == DELETE_STOP:
            break
        if answer != DELETE_YES:
            kept += 1
            continue
        try:
            say(delete(row.uid, token, row.where))
            deleted += 1
        except SessionsRefused as refused:
            say(f"Not deleted: {refused}")
            kept += 1
    return deleted, kept


def transfer_session(
    uid: str, to: str, token: str, *, yes: bool, ask: Any = None
) -> Any:
    """A session moved to ``cloud`` or to ``local``, asked first unless ``yes``."""
    import asyncio

    from agent_runtimes.loop.transfer import TransferRefused, places, transfer

    try:
        source, destination = places(to, token)
        confirm = None
        if not yes:
            from agent_runtimes.loop.launch import interactive

            if ask is None and not interactive():
                raise TransferRefused(
                    "A transfer sends a session's conversation off this machine, or brings it here: "
                    "say `--yes` where nobody can be asked."
                )
            confirm = ask or _confirm
        return asyncio.run(
            transfer(uid, source=source, destination=destination, confirm=confirm)
        )
    except TransferRefused as refused:
        raise SessionsRefused(str(refused)) from None


def _confirm(question: str) -> bool:
    import questionary

    return bool(questionary.confirm(question, default=False).ask())


def perform(action: str, row: Any, token: str) -> str:
    """Do to a session what the picker was asked, and say what was done."""
    from agent_runtimes.loop.paused import ON_DATALAYER, ON_THIS_MACHINE

    if action == "export":
        return export_to_file(row, token)
    if action == "end":
        if not _confirm(
            f"End session {row.uid}? It is not resumed afterwards; its record stays."
        ):
            return "Not ended."
        return end_session(row, token)
    if action == "delete":
        place = "this machine" if row.where == ON_THIS_MACHINE else "Datalayer"
        if not _confirm(
            f"Delete session {row.uid} from {place}, for good? Its conversation and its record go with it."
        ):
            return "Not deleted."
        return delete_session(row.uid, token, row.where)
    if action == "transfer":
        to = ON_DATALAYER if row.where == ON_THIS_MACHINE else ON_THIS_MACHINE
        done = transfer_session(row.uid, to, token, yes=False)
        return f"{done.said} Enter resumes it there."
    raise SessionsRefused(f"There is no action {action!r}.")


def _quiet() -> None:
    """A reader's window: the requests behind an answer are not printed over it."""
    import logging

    logging.getLogger().setLevel(logging.ERROR)
    for name in ("httpx", "httpcore"):
        logging.getLogger(name).setLevel(logging.ERROR)


def run_picker(as_json: bool = False) -> None:
    """`loop sessions`: the picker in a terminal, the two groups printed otherwise."""
    from agent_runtimes.loop.launch import interactive
    from agent_runtimes.loop.picker import Picker, listing_json, listing_lines, pick

    _quiet()
    token = _token()
    said = ""
    while True:
        rows = every_session(token)
        if as_json:
            print(json.dumps(listing_json(rows, signed_in=bool(token)), indent=1))
            return
        if not interactive():
            from agent_runtimes.loop.paused import MANAGED

            for line in (*MANAGED, *listing_lines(rows, signed_in=bool(token))):
                console.print(line, markup=False)
            return
        chosen = pick(Picker(rows, signed_in=bool(token), said=said))
        if chosen is None:
            return
        action, row = chosen
        if action == "resume":
            _run_loop(resume_command(row))
        if action == "start_over":
            _run_loop(start_over_command(row))
        try:
            said = perform(action, row, token)
        except SessionsRefused as refused:
            said = str(refused)


@app.callback()
def sessions(
    ctx: typer.Context,
    as_json: bool = typer.Option(
        False, "--json", help="Print the two groups as JSON, and pick nothing."
    ),
) -> None:
    """Your sessions. With nothing else: the picker.

    Two groups, each session with its uid, state, kind, agent or application,
    turns, when it started and its title.

    On this machine: a session is a folder of ~/.datalayer/sessions, named by
    its uid, kept until you delete it, seen only here and resumed by a
    runtime on this machine.

    On Datalayer: a session is in your Datalayer account's record, seen on
    the web, in the desktop app and from any machine signed in, and resumed
    on a runtime Datalayer launches. Signed out, only the sessions on this
    machine are listed.

    A session keeps its uid for its whole life; `transfer` moves it between
    the two places under that uid. Arrow keys or a number choose, typing
    filters, Enter resumes; the keys for pause, end, transfer, export,
    delete and start over are said under the list. The verbs below act on a
    runtime's sessions (`--server`, `--cloud`).
    """
    if ctx.invoked_subcommand is None:
        run_picker(as_json)


@app.command(name="transfer")
def transfer_command(
    uid: str = typer.Argument(..., help="The session's uid."),
    to: str = typer.Option(
        ...,
        "--to",
        help="Where it goes: cloud (your Datalayer account) or local (this machine).",
    ),
    yes: bool = typer.Option(
        False, "--yes", "-y", help="Do not ask before the conversation is sent."
    ),
) -> None:
    """Move a paused session between this machine and Datalayer, under the same uid.

    Its conversation and its record are carried as a session file is written
    and read (credentials redacted; the files it was given are named, their
    contents not sent). It lives where it was sent, and is ended where it
    was, its record saying where it went. Refused in a sentence: signed out,
    an open or ended session, a deployment's, a seat of a team run, an agent
    that is not of the catalogue, a uid the other place keeps as another
    session.
    """
    _quiet()
    try:
        done = transfer_session(uid, to, _token(), yes=yes)
    except SessionsRefused as refused:
        _exit(refused)
        return
    console.print(done.said, markup=False)
    console.print(f"Go on with it: `loop --resume {uid}`.", markup=False)


@app.command(name="delete")
def delete_command(
    uid: str = typer.Argument(
        "",
        help="The session's uid. Without one, every session is gone through, each asked of in turn.",
    ),
    yes: bool = typer.Option(
        False, "--yes", "-y", help="Do not ask (one named session only)."
    ),
) -> None:
    """Delete a session for good: on this machine, else in your Datalayer account's record.

    One on Datalayer is deleted signed in, and only one you opened; an open
    one is refused: pause or end it first. Without a uid, every session (this
    machine's and, signed in, Datalayer's) is gone through, newest first, and
    you are asked of each: delete it, keep it, or stop.
    """
    if not uid:
        if yes:
            _exit(
                SessionsRefused(
                    "Name the session to delete without asking: `--yes` deletes one session, never all."
                )
            )
            return
        _delete_each()
        return
    try:
        if not yes and not _confirm(
            f"Delete session {uid} for good? Its conversation and its record go with it."
        ):
            console.print("Not deleted.")
            return
        console.print(delete_session(uid, _token()), markup=False)
    except SessionsRefused as refused:
        _exit(refused)


def _delete_each() -> None:
    """`loop sessions delete` with no uid: every session, asked of in turn."""
    import questionary

    from agent_runtimes.loop.paused import ON_THIS_MACHINE, paused_line

    token = _token()
    rows = every_session(token)
    if not rows:
        console.print("You have no session to delete.")
        return
    console.print(
        f"{len(rows)} session{'s' if len(rows) != 1 else ''}, newest first: for each, delete it, keep it, or stop.",
        markup=False,
    )

    def ask(row: Any) -> str:
        place = "this machine" if row.where == ON_THIS_MACHINE else "Datalayer"
        answer = questionary.select(
            f"{paused_line(row)} — {row.state}, on {place}",
            choices=[
                questionary.Choice("Keep it", DELETE_KEEP),
                questionary.Choice("Delete it for good", DELETE_YES),
                questionary.Choice("Stop", DELETE_STOP),
            ],
            default=DELETE_KEEP,
        ).ask()
        # Ctrl-C or Escape stops, deleting nothing more.
        return answer or DELETE_STOP

    deleted, kept = delete_across(
        rows, token, ask, lambda line: console.print(line, markup=False)
    )
    console.print(f"Deleted {deleted}, kept {kept}.", markup=False)


@app.command(name="list")
def list_sessions(
    app_id: str = typer.Option(
        "", "--app", help="One application's sessions, by its id."
    ),
    archived: bool = typer.Option(
        False, "--archived", help="The archived ones too; each is marked `archived`."
    ),
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
        if archived:
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


@app.command(name="pause")
def pause(
    uid: str = typer.Argument(..., help="The session's id."),
    server: Optional[str] = _server_option(),
    cloud: bool = _cloud_option(),
) -> None:
    """Pause a session its runtime holds: its conversation is given to its agent's memory first, when it has one."""
    from agent_runtimes.chat.commands.pause import remembered_line

    try:
        answer = _ask(_client(server, cloud), "POST", f"/{uid}/stop").json()
    except SessionsRefused as refused:
        _exit(refused)
        return
    turns = int(answer.get("turns") or 0)
    console.print(
        f"Paused {answer.get('uid')} ({answer.get('agent')}, {turns} turn{'s' if turns != 1 else ''}).",
        markup=False,
    )
    said = remembered_line(answer.get("remembered") or {})
    if said:
        console.print(said, markup=False)
    console.print(f"Resume it: loop sessions resume {answer.get('uid')}", markup=False)


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
