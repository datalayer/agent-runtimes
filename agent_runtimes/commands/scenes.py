# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Scenes: `loop scenes …` (LOOP A-14).

A scene is a scene spec (`agentspecs.scenes`, ``loop.scene/v1``): a team
staged — its cast with their personas, its setting, its script of beats,
and its rehearsal, the shape each beat's transcript must take.

- ``loop scenes ls`` lists the catalogue: each scene's face and name, its
  members (where each runs, what it reaches), what it needs set up, and
  whether it is *Live*: its last rehearsal on Datalayer passed
  (`agentspecs.scenes.scene_played`, the file `<id>/rehearsal.json` beside
  the specs); one that did not says so.
- ``loop scenes rehearse <scene>`` plays each beat's cue through the scene —
  the entry's application run the way `loop apps run` runs one, in this
  process (a member the scene puts in the browser played as the browser
  plays it), or with ``--cloud`` every member on a runtime served over A2A
  on a cloud runtime of its own, launched for its application so that it is
  given the secrets its connections declare (LOOP R-19), or at an address
  it is already served at (``--address member=URL``, or the variable the
  scene's ``deployment.addresses`` names: a deployment's stable address, a
  runtime kept with ``--keep``), asked with a key granted to its route
  (``--key``) — reads the transcript from what happened and compares it to
  the beat's expected lines, words and time. Each beat is **passed**,
  **failed** with what differed, or **not run** with why, in the Validate
  tab's words; the exit code is `loop apps validate`'s (1 when a beat failed,
  3 when one was not run). A member whose setup is incomplete, or whose
  runtime Datalayer refused or did not set up, makes the beats that need it
  *not run* with that sentence; nothing crashes. A scene with a recording
  and no live run says its recording stands. What a rehearsal on Datalayer
  found is kept as the catalogue scene's last (`write_played`), which is what
  *Live* reads — never a local run's, never a scene file's.
"""

from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
import logging
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple

import typer
from rich.console import Console

app = typer.Typer(
    name="scenes",
    help="Scenes: the catalogue, and a scene's rehearsal.",
    invoke_without_command=True,
    pretty_exceptions_show_locals=False,
)

console = Console(soft_wrap=True)
logger = logging.getLogger(__name__)

HERE = "on this machine"
CLOUD = "on Datalayer"

_MARKS = {"passed": "[green]✓[/green]", "failed": "[red]✗[/red]", "not_run": "·"}


def _require_scenes() -> Any:
    try:
        import agentspecs
        from agentspecs import scenes as module
    except ImportError as error:  # pragma: no cover - agentspecs is a dependency
        raise typer.BadParameter(
            "Scenes need agentspecs 0.0.61 or later; its scenes module is not installed."
        ) from error
    version = tuple(int(part) for part in agentspecs.__version__.split(".")[:3])
    if version < (0, 0, 61):
        raise typer.BadParameter(
            f"Scenes need agentspecs 0.0.61 or later; {agentspecs.__version__} is installed."
        )
    return module


def scene_of(name: str) -> Any:
    """A scene by its id in the catalogue, or from a file; refused in a sentence."""
    module = _require_scenes()
    path = Path(name)
    if path.suffix in (".yaml", ".yml") or path.exists():
        if not path.exists():
            raise typer.BadParameter(f"{name} is not a file.")
        try:
            return module.load_scene(path)
        except Exception as error:  # noqa: BLE001 - said in sentences
            raise typer.BadParameter(f"{name} is not a scene: {error}") from None
    scene = module.get_scene(name)
    if scene is None:
        known = ", ".join(sorted(module.SCENE_CATALOGUE))
        raise typer.BadParameter(
            f"No scene {name!r} in the catalogue; the scenes are {known}."
        )
    return scene


def played_of(scene: Any) -> Any:
    """What the scene's last rehearsal on Datalayer found, or None (LOOP A-14)."""
    module = _require_scenes()
    read = getattr(module, "scene_played", None)
    if read is None:
        return None
    try:
        return read(scene.id)
    except Exception as refused:  # noqa: BLE001 - a result that cannot be read is not a pass
        logger.warning("The last rehearsal of %s is not read: %s", scene.id, refused)
        return None


def verified_state(scene: Any) -> str:
    """What the scene's rehearsal says: *Live*, *Not Live*, *Recorded*, or *Not verified yet*.

    *Live* is read from the last rehearsal played on Datalayer (`played_of`),
    not from a sentence written by hand; one that did not pass is *Not Live*.
    Without one, what the scene's `verified` says: *Live* when a person says
    it was tried live, *Recorded* when a recording stands.
    """
    played = played_of(scene)
    if played is not None:
        return "Live" if played.passed else "Not Live"
    verified = scene.rehearsal.verified
    if verified.unverified:
        return "Not verified yet"
    if verified.live:
        return "Live"
    if verified.recorded or scene.rehearsal.recording is not None:
        return "Recorded"
    return "Not verified yet"


def played_says(played: Any) -> str:
    """The last rehearsal in one line: when, where, and its verdict."""
    day = str(played.at)[:10]
    return f"Rehearsed {played.where} on {day}: {played.says}"


def keep_played(module: Any, scene: Any, verdict: Any) -> Optional[Any]:
    """Keep a verdict as the scene's last rehearsal beside the specs; where it went, or None.

    None when the installed agentspecs keeps no rehearsal (before 0.0.67),
    or when the file cannot be written: said in the log, never a crash.
    """
    from agent_runtimes._version import __version__

    write = getattr(module, "write_played", None)
    played_type = getattr(module, "ScenePlayed", None)
    if write is None or played_type is None:
        return None
    played = played_type(
        at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        where=verdict.where,
        passed=bool(verdict.live),
        says=verdict.says,
        beats=[
            {
                "beat": beat.beat,
                "state": beat.state,
                "says": beat.says,
                "seconds": float(beat.seconds or 0.0),
            }
            for beat in verdict.beats
        ],
        runtime=__version__,
    )
    try:
        return write(scene.id, played)
    except OSError as refused:
        logger.warning("The rehearsal of %s was not kept: %s", scene.id, refused)
        return None


def member_lines(scene: Any) -> List[str]:
    """Each member in a line: its face and name, where it runs, whom it asks, what it reaches."""
    from agentspecs.apps import APP_CATALOGUE

    shown = {system.id: system.name for system in scene.setting.systems}
    lines: List[str] = []
    for member in scene.cast_of():
        app_id = member.app.split(":")[0] if member.app else ""
        application = APP_CATALOGUE.get(app_id) if app_id else None
        reaches = [
            shown.get(connection.server.split(":")[0])
            or connection.server.split(":")[0]
            for connection in (
                application.connections if application is not None else []
            )
        ]
        where = (
            "on a runtime"
            if member.runs_in and member.runs_in.value == "runtime"
            else "in the browser"
        )
        asks = [link.member for link in member.talks_to]
        said = f"{member.persona.face + ' ' if member.persona.face else ''}{member.persona.name or member.member} {where}"
        if asks:
            said += " → " + ", ".join(asks)
        if reaches:
            said += "; " + ", ".join(reaches) + " via MCP"
        lines.append(said)
    return lines


@app.callback()
def scenes_callback(ctx: typer.Context) -> None:
    if ctx.invoked_subcommand is None:
        typer.echo(ctx.get_help())


@app.command(name="ls")
def scenes_ls(
    as_json: bool = typer.Option(False, "--json", help="Print the catalogue as JSON."),
) -> None:
    """The scenes of the catalogue: faces, members, setup, and whether each is Live."""
    module = _require_scenes()
    scenes = module.list_scenes()
    if as_json:
        typer.echo(
            json.dumps(
                [
                    {
                        "id": scene.id,
                        "name": scene.name,
                        "emoji": scene.emoji,
                        "description": scene.description,
                        "entry": scene.entry_of(),
                        "members": member_lines(scene),
                        "setup": module.scene_setup(scene),
                        "state": verified_state(scene),
                        "played": (
                            played_of(scene).model_dump(mode="json")
                            if played_of(scene) is not None
                            else None
                        ),
                        "beats": [beat.id for beat in scene.script],
                        "recording": scene.rehearsal.recording.path
                        if scene.rehearsal.recording
                        else "",
                    }
                    for scene in scenes
                ],
                indent=2,
                ensure_ascii=False,
            )
        )
        return
    for scene in scenes:
        state = verified_state(scene)
        colour = {"Live": "green", "Recorded": "yellow"}.get(state, "yellow")
        console.print(
            f"{scene.emoji}  [bold]{scene.name}[/bold] ({scene.id})  [{colour}]{state}[/{colour}]",
            highlight=False,
        )
        if scene.description:
            console.print(f"   {scene.description}", highlight=False)
        for line in member_lines(scene):
            console.print(f"   {line}", highlight=False)
        beats = ", ".join(beat.id for beat in scene.script)
        console.print(f"   Beats: {beats or 'none'}", highlight=False)
        played = played_of(scene)
        if played is not None:
            console.print(f"   {played_says(played)}", highlight=False)
        for sentence in module.scene_setup(scene):
            console.print(f"   · To set up: {sentence}", highlight=False)


def _keys_of(keys: List[str], members: List[Any]) -> Dict[str, str]:
    """``--key member=KEY``, and ``DATALAYER_SCENE_KEY_<MEMBER>`` from the environment."""
    given: Dict[str, str] = {}
    for member in members:
        variable = "DATALAYER_SCENE_KEY_" + member.id.upper().replace("-", "_")
        if os.environ.get(variable):
            given[member.id] = os.environ[variable]
    for item in keys:
        if "=" not in item:
            raise typer.BadParameter(f"--key takes member=KEY, not {item!r}.")
        member_id, key = item.split("=", 1)
        given[member_id.strip()] = key.strip()
    return given


def _addresses_of(addresses: List[str], scene: Any) -> Dict[str, str]:
    """Where a member is already served over A2A: ``--address member=URL``, else the scene's variable.

    The scene's ``deployment.addresses`` names, for each member on a runtime,
    the variable its address is read from (``DATALAYER_DEMO_TEAM_ACCOUNTING_A2A_URL``):
    a deployment's stable address, or a runtime kept with ``--keep``. A member
    at an address is asked there and no runtime is launched for it.
    """
    given: Dict[str, str] = {}
    for member_id, variable in (scene.deployment.addresses or {}).items():
        if os.environ.get(variable):
            given[member_id] = os.environ[variable].strip()
    for item in addresses:
        if "=" not in item:
            raise typer.BadParameter(f"--address takes member=URL, not {item!r}.")
        member_id, url = item.split("=", 1)
        given[member_id.strip()] = url.strip()
    return given


def stage_here(scene: Any, *, agent: Optional[Callable[[Any], Any]] = None) -> Any:
    """The scene's stage in this process: every member played here, or saying why it cannot be."""
    from agent_runtimes.loop.scenes.stage import Stage, members_of, refused_here

    members, entry = members_of(scene)
    for member in members:
        if not member.reason:
            member.reason = refused_here(member, agent)
    return Stage(members, entry, agent=agent)


def stage_in_cloud(
    scene: Any,
    *,
    keys: Dict[str, str],
    environment: Optional[str],
    minutes: Optional[int],
    status: Callable[[str], None],
    addresses: Optional[Dict[str, str]] = None,
) -> Tuple[Any, List[Any]]:
    """The scene's stage with every runtime member served over A2A on a cloud runtime of its own.

    A member on a runtime is launched for its application (``app_spec``), so
    that the runtime is given the secrets its connections declare and no
    other (LOOP R-19), then configured with it and served over A2A. One at an
    ``addresses`` entry is asked there instead, and nothing is launched for
    it. A member the scene puts in the browser is played here, as the browser
    plays it. A launch Datalayer refuses, or does not set up in time, is the
    member's sentence, never a crash; what its runtime says is to set up is
    the member's notes. Returns the stage and the launches, to finish.
    """
    from agent_runtimes.client.agent_client import build_agent_runtimes_base_url
    from agent_runtimes.commands.apps import BOOTSTRAP_AGENT_SPEC_ID, configure_on
    from agent_runtimes.loop.launch import CloudRefused, NotSignedIn, launch_cloud
    from agent_runtimes.loop.scenes.stage import Stage, members_of, refused_here

    members, entry = members_of(
        scene,
        addresses={
            member_id: (url, keys.get(member_id, ""))
            for member_id, url in (addresses or {}).items()
        },
    )
    launches: List[Any] = []
    for member in members:
        if member.reason:
            continue
        if member.runs_in != "runtime":
            member.reason = refused_here(member)
            continue
        if member.address:
            if not member.key:
                member.reason = (
                    f"{member.name} is served at {member.address} and answers a key granted "
                    f"to its route: give it with --key {member.id}=<key> "
                    f"(or DATALAYER_SCENE_KEY_{member.id.upper().replace('-', '_')})."
                )
            continue
        try:
            launch = launch_cloud(
                BOOTSTRAP_AGENT_SPEC_ID,
                label=f"{member.face} {member.name}".strip(),
                environment=environment,
                minutes=minutes,
                status=status,
                app_spec=member.document,
            )
        except NotSignedIn:
            member.reason = "Not signed in to Datalayer: run `datalayer login`, or set DATALAYER_API_KEY."
            continue
        except (CloudRefused, RuntimeError) as refused:
            member.reason = str(refused)
            continue
        launches.append(launch)
        public_url = build_agent_runtimes_base_url(launch.ingress)
        try:
            configured = configure_on(
                launch.server_url, member.document, a2a_url=public_url
            )
        except (typer.BadParameter, RuntimeError) as refused:
            member.reason = getattr(refused, "message", None) or str(refused)
            continue
        # What the runtime says is to set up — the catalogue's own notes, an
        # agent or a server not offered by default — is kept for the verdict;
        # it is served all the same, as `loop apps run` serves it. A secret it
        # was not given is a refusal of the configure, said above.
        member.notes = [str(note) for note in configured.get("setup") or []]
        member.address = str((configured.get("a2a") or {}).get("url") or "")
        member.key = keys.get(member.id, "")
        if not member.key:
            member.reason = (
                f"{member.name} is served at {member.address} and answers a key granted "
                f"to its route: give it with --key {member.id}=<key> "
                f"(examples/sales-accounting-a2a/make_temp_key.py --runtime {launch.runtime_name}); "
                f"with --keep, rehearse again at it with --address {member.id}={member.address}."
            )
    return Stage(members, entry), launches


def say_beat(verdict: Any) -> None:
    """One beat's verdict, then its transcript, indented."""
    said = f" — {verdict.says}" if verdict.says else ""
    took = f" ({verdict.seconds:.0f} s)" if verdict.seconds else ""
    console.print(
        f"  {_MARKS[verdict.state]} {verdict.beat}: {verdict.word}{took}{said}",
        highlight=False,
    )
    for line in verdict.lines:
        console.print(f"      {line}", highlight=False)


@app.command(name="rehearse")
def scenes_rehearse(
    scene_name: str = typer.Argument(
        ..., metavar="SCENE", help="A scene of the catalogue by id, or a scene file."
    ),
    local: bool = typer.Option(
        False, "--local", help="Play it on this machine, in this process (the default)."
    ),
    cloud: bool = typer.Option(
        False,
        "--cloud",
        help="Play it on Datalayer: every runtime member on a cloud runtime, served over A2A.",
    ),
    beats: List[str] = typer.Option(
        None,
        "--beat",
        help="A beat to play, by id; every beat of the rehearsal when unsaid.",
    ),
    keys: List[str] = typer.Option(
        None,
        "--key",
        help="With --cloud: a key granted to a member's A2A route, as member=KEY (or DATALAYER_SCENE_KEY_<MEMBER>).",
    ),
    addresses: List[str] = typer.Option(
        None,
        "--address",
        help="With --cloud: where a member is already served over A2A, as member=URL (or the variable the scene's deployment names); no runtime is launched for it.",
    ),
    environment: str = typer.Option(
        None, "--environment", "-e", help="The Datalayer environment (with --cloud)."
    ),
    minutes: int = typer.Option(
        None,
        "--minutes",
        "-m",
        help="How long to reserve each cloud runtime (with --cloud).",
    ),
    keep: bool = typer.Option(
        False,
        "--keep",
        help="Leave the cloud runtimes running when the rehearsal ends.",
    ),
    as_json: bool = typer.Option(False, "--json", help="Print the verdict as JSON."),
) -> None:
    """Play each beat's cue through the scene and compare the transcript to what the rehearsal expects.

    Exit 1 when a beat failed, 3 when one was not run, 0 when every beat passed.
    """
    from agent_runtimes.commands.apps import _quiet
    from agent_runtimes.loop.scenes.rehearsal import rehearse

    if local and cloud:
        raise typer.BadParameter("--local or --cloud: one place to play it.")
    scene = scene_of(scene_name)
    known = {beat.beat for beat in scene.rehearsal.beats}
    for beat in beats or []:
        if beat not in known:
            raise typer.BadParameter(
                f"The rehearsal of {scene.id} has no beat {beat!r}; its beats are "
                + (", ".join(sorted(known)) or "none")
                + "."
            )
    module = _require_scenes()
    notes = [f"To set up: {sentence}" for sentence in module.scene_setup(scene)]
    launches: List[Any] = []
    where = CLOUD if cloud else HERE
    if not as_json:
        console.print(
            f"{scene.emoji}  [bold]{scene.name}[/bold] ({scene.id}), rehearsed {where}",
            highlight=False,
        )
        for note in notes:
            console.print(f"  · {note}", highlight=False)
    # With --json, stdout is the verdict and nothing else: the rest goes to stderr.
    aside: Callable[[str], None] = (
        (lambda message: typer.echo(message, err=True))
        if as_json
        else (lambda message: console.print(message, highlight=False))
    )
    try:
        if cloud:
            stage, launches = stage_in_cloud(
                scene,
                keys=_keys_of(
                    keys or [], [_Named(member.member) for member in scene.cast_of()]
                ),
                addresses=_addresses_of(addresses or [], scene),
                environment=environment,
                minutes=minutes,
                status=lambda message: aside(
                    message if as_json else f"[cyan]{message}[/cyan]"
                ),
            )
        else:
            stage = stage_here(scene)
        for member in stage.members.values():
            for note in getattr(member, "notes", None) or []:
                notes.append(f"{member.name}, on its runtime: {note}")
                if not as_json:
                    console.print(f"  · {notes[-1]}", highlight=False)
        with _quiet():
            verdict = asyncio.run(
                rehearse(
                    scene,
                    stage,
                    where=where,
                    beats=beats or None,
                    told=None if as_json else say_beat,
                )
            )
    finally:
        if launches:
            from agent_runtimes.loop.launch import finish_cloud

            for launch in launches:
                finish_cloud(launch, keep=keep, can_ask=False, say=aside)
    verdict.notes = notes + verdict.notes
    if cloud and not (beats or []) and module.get_scene(scene.id) is scene:
        # Every beat, on Datalayer, of a catalogue scene: kept as its last rehearsal (A-14).
        kept = keep_played(module, scene, verdict)
        if kept is not None:
            aside(f"Kept as the scene's last rehearsal: {kept}")
    if as_json:
        typer.echo(json.dumps(verdict.as_dict(), indent=2, ensure_ascii=False))
    else:
        for note in verdict.notes[len(notes) :]:
            console.print(f"  · {note}", highlight=False)
        colour = "green" if verdict.live else ("red" if verdict.failed else "yellow")
        console.print(f"  [{colour}]{verdict.says}[/{colour}]", highlight=False)
    if verdict.exit_code:
        raise typer.Exit(verdict.exit_code)


class _Named:
    """A member by id, for the keys read from the environment."""

    def __init__(self, member_id: str) -> None:
        self.id = member_id
