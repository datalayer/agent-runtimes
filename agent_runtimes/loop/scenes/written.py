# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A scene and its stage, written in Python (LOOP P-30).

Beside ``loop.app(...)``, an application, a developer writes the rest of the
lifecycle in code::

    from agent_runtimes import loop

    scene = loop.scene("desk-and-sales", "Desk & Sales", emoji="🎬")
    scene.player("desk", app="support-desk", role="initiator", talks_to=["sales"])
    scene.player("sales", app="sales")

    beat = scene.beat("pipeline", say="How is the pipeline?", expect="Sales answers.")
    beat.asks("desk", "sales", what="the pipeline")
    beat.answers("sales", "words")
    beat.answers("desk", "words")
    beat.rehearse("You → Desk", "Desk → Sales", must_say=["pipeline"], within="3m")

    loop.stage(scene, runs_in={"desk": "browser", "sales": "runtime"})

What it writes is the scene spec — ``loop.scene/v1``, agentspecs'
`SceneSpec` — and nothing of its own: a stage is not a spec apart, it is the
parts of the scene that say where it plays (``stage``, ``audience``,
``deployment``, each player's ``runs_in``), as the Studio's spec editor
and its Canvas write them (S-09). So the scene is read, checked and refused
by agentspecs itself, in agentspecs' sentences (`parse_scene`,
`scene_problems`); ``loop scenes rehearse scene.py`` plays it,
``loop scenes build scene.py`` writes its YAML, and ``loop scenes push
scene.py`` keeps it in the person's Space, where the Studio opens it as any
scene of theirs.

A player is an application of the catalogue, by its id, as in a YAML scene.
"""

from __future__ import annotations

import sys
import types
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple, Union

#: How a scene is introduced at the top of the YAML ``loop scenes build`` writes.
BUILT_HEADER = "# Built from {file} by `loop scenes build`: the file is the source; edit it there.\n"


class SceneNotPlayable(ValueError):
    """A scene agentspecs refuses, with its sentences."""

    def __init__(self, problems: Sequence[str]) -> None:
        """Keep the sentences, said one after the other."""
        self.problems = list(problems)
        super().__init__(" ".join(self.problems))


def _given(**fields: Any) -> Dict[str, Any]:
    """The fields that say something: nothing at its default is written."""
    return {
        key: value
        for key, value in fields.items()
        if value is not None and value != "" and value != [] and value != {}
    }


class Beat:
    """A beat of the script, written move by move; returned by `Scene.beat`."""

    def __init__(self, scene: "Scene", data: Dict[str, Any]) -> None:
        """A beat of ``scene``, its data written into the scene's script."""
        self._scene = scene
        self._data = data

    @property
    def id(self) -> str:
        """Say its id."""
        return str(self._data["id"])

    def asks(
        self,
        who: str,
        whom: str,
        *,
        what: str = "",
        over: Optional[str] = None,
        tool: str = "",
        does: Optional[str] = None,
        answers: Optional[str] = None,
    ) -> "Beat":
        """``who`` asks ``whom``: another player, over ``a2a``, or a system, over ``mcp``.

        ``over`` is said for you: ``mcp`` when ``whom`` is a system of the
        setting, ``a2a`` otherwise.
        """
        if over is None:
            over = "mcp" if self._scene._is_system(whom) else "a2a"
        self._data.setdefault("moves", []).append(
            _given(
                who=who,
                asks=whom,
                over=over,
                what=what,
                tool=tool,
                does=does,
                answers=answers,
            )
        )
        return self

    def answers(self, who: str, kind: str, *, what: str = "") -> "Beat":
        """Answer the audience as ``who``, with ``kind``: words, a table, a chart."""
        self._data.setdefault("moves", []).append(
            _given(who=who, answers=kind, what=what)
        )
        return self

    def branch(self, decision: str, *, expect: str = "", then: str = "") -> "Beat":
        """What the beat does instead when ``decision`` holds."""
        self._data.setdefault("branch", []).append(
            _given(decision=decision, expect=expect, then=then)
        )
        return self

    def rehearse(
        self,
        *lines: str,
        must_say: Iterable[str] = (),
        must_not_say: Iterable[str] = (),
        within: str = "",
    ) -> "Beat":
        """The shape its transcript must take when rehearsed: lines, words, time."""
        self._scene._rehearsal_beats[self.id] = _given(
            beat=self.id,
            lines=list(lines),
            must_say=list(must_say),
            must_not_say=list(must_not_say),
            within=within,
        )
        return self


class Scene:
    """A scene written in Python: `loop.scene(...)`.

    Parameters
    ----------
    id : str
        Its id: the file a YAML scene is named for.
    name : str
        The name its tab shows.
    emoji : str, optional
        Its face, one emoji; the spec's when unsaid.
    description : str, optional
        What happens in it, in a sentence.
    team : str, optional
        The team of the catalogue it stages; its players are then the team's,
        and `Scene.player` says only their persona and brief.
    entry : str, optional
        The player the audience talks to.
    version : str, optional
        Its version.
    tags : sequence of str, optional
        Its tags.
    icon : str, optional
        Its icon.
    """

    def __init__(
        self,
        id: str,
        name: str,
        *,
        emoji: str = "",
        description: str = "",
        team: str = "",
        entry: str = "",
        version: str = "",
        tags: Sequence[str] = (),
        icon: str = "",
    ) -> None:
        """Hold what the scene says, in the order the spec says it."""
        self._head = _given(
            id=id,
            version=version,
            name=name,
            description=description,
            tags=list(tags),
            icon=icon,
            emoji=emoji,
            team=team,
            entry=entry,
        )
        self._cast: List[Dict[str, Any]] = []
        self._systems: List[Dict[str, Any]] = []
        self._setting: Dict[str, Any] = {}
        self._script: List[Dict[str, Any]] = []
        self._rehearsal_beats: Dict[str, Dict[str, Any]] = {}
        self._rehearsal: Dict[str, Any] = {}
        self._stage: Dict[str, Any] = {}
        self._audience: Dict[str, Any] = {}
        self._deployment: Dict[str, Any] = {}

    @property
    def id(self) -> str:
        """Say its id."""
        return str(self._head["id"])

    # --- who is on stage -----------------------------------------------------------

    def player(
        self,
        member: str,
        *,
        app: str = "",
        ref: str = "",
        server: str = "",
        role: Optional[str] = None,
        runs_in: Optional[str] = None,
        talks_to: Sequence[Union[str, Tuple[str, str]]] = (),
        name: str = "",
        face: str = "",
        line: str = "",
        brief: str = "",
    ) -> "Scene":
        """A player of the cast: what it is, whom it asks, and how it appears.

        ``talks_to`` names the players it asks, over ``a2a`` — or
        ``(member, over)``. On a scene that stages a ``team``, the team says
        what each player is: give its persona (``name``, ``face``, ``line``)
        and its ``brief`` only.
        """
        if any(player["member"] == member for player in self._cast):
            raise ValueError(f"The cast names '{member}' twice.")
        links = [
            {"member": link}
            if isinstance(link, str)
            else {"member": link[0], "over": link[1]}
            for link in talks_to
        ]
        self._cast.append(
            _given(
                member=member,
                app=app,
                ref=ref,
                server=server,
                role=role,
                runs_in=runs_in,
                talks_to=links,
                persona=_given(name=name, face=face, line=line),
                brief=brief,
            )
        )
        return self

    # --- the setting ---------------------------------------------------------------

    def system(self, server: str, *, shown_as: str = "", holds: str = "") -> "Scene":
        """A system on stage: an MCP server of the catalogue the players reach."""
        self._systems.append(_given(server=server, holds=holds, **{"as": shown_as}))
        return self

    def setting(
        self,
        *,
        frames: Sequence[str] = (),
        contents: Sequence[str] = (),
        period: str = "",
        language: str = "",
        assumes: str = "",
    ) -> "Scene":
        """The rest of the setting: Frames, data in play, period, language, what the audience is told."""
        self._setting.update(
            _given(
                frames=list(frames),
                contents=list(contents),
                period=period,
                language=language,
                assumes=assumes,
            )
        )
        return self

    def _is_system(self, name: str) -> bool:
        """Whether a name is a system of the setting: its server, its id, or what it is shown as."""
        wanted = name.strip().lower()
        for system in self._systems:
            server = str(system["server"])
            if wanted in (
                server.lower(),
                server.split(":")[0],
                str(system.get("as", "")).lower(),
            ):
                return True
        return False

    # --- the script ----------------------------------------------------------------

    def beat(
        self,
        id: str,
        *,
        expect: str,
        say: str = "",
        schedule: str = "",
        event: str = "",
        narration: str = "",
        shows: Sequence[str] = (),
        pace: Optional[str] = None,
    ) -> Beat:
        """A beat, after the ones written before it: its cue — ``say``, a
        ``schedule`` or an ``event`` — and what should happen. Its moves are
        written on the `Beat` it returns.
        """
        data = _given(
            id=id,
            cue=_given(say=say, schedule=schedule, event=event),
            narration=narration,
            expect=expect,
            shows=list(shows),
            pace=pace,
        )
        self._script.append(data)
        return Beat(self, data)

    def rehearsal(
        self, *, within: str = "", recording: Optional[Mapping[str, str]] = None
    ) -> "Scene":
        """The whole rehearsal: the time the scene may take, a recording beside the scenes."""
        self._rehearsal.update(_given(within=within, recording=dict(recording or {})))
        return self

    # --- what it amounts to --------------------------------------------------------

    @property
    def raw(self) -> Dict[str, Any]:
        """What was written, as the plain data of a scene spec, unchecked."""
        cast = [dict(player) for player in self._cast]
        data: Dict[str, Any] = {"schema": "loop.scene/v1", **self._head}
        if cast:
            data["cast"] = cast
        setting = dict(self._setting)
        if self._systems:
            setting = {"systems": list(self._systems), **setting}
        if setting:
            data["setting"] = setting
        if self._script:
            data["script"] = list(self._script)
        if self._stage:
            data["stage"] = dict(self._stage)
        if self._audience:
            data["audience"] = dict(self._audience)
        rehearsal = dict(self._rehearsal)
        if self._rehearsal_beats:
            # In the script's order, whatever the order they were written in.
            order = [beat["id"] for beat in self._script]
            beats = sorted(
                self._rehearsal_beats.values(),
                key=lambda beat: (
                    order.index(beat["beat"]) if beat["beat"] in order else len(order)
                ),
            )
            rehearsal = {"beats": beats, **rehearsal}
        if rehearsal:
            data["rehearsal"] = rehearsal
        if self._deployment:
            data["deployment"] = dict(self._deployment)
        return data

    @property
    def spec(self) -> Any:
        """The scene spec it amounts to, read and checked by agentspecs.

        Raises
        ------
        SceneNotPlayable
            With agentspecs' sentences, when it refuses the scene.
        """
        from agentspecs.scenes import SceneError, parse_scene, scene_problems

        try:
            spec = parse_scene(self.raw)
        except SceneError as refused:
            raise SceneNotPlayable([str(refused)]) from None
        problems = scene_problems(spec)
        if problems:
            raise SceneNotPlayable(problems)
        return spec

    @property
    def document(self) -> Dict[str, Any]:
        """The scene spec as its file holds it: `schema` first, nothing at its default."""
        from agentspecs.scenes import dump_scene

        return dump_scene(self.spec)

    def yaml(self, file: str = "scene.py") -> str:
        """The scene spec as YAML, said to be built from ``file``."""
        import yaml

        return BUILT_HEADER.format(file=file) + yaml.safe_dump(
            self.document, sort_keys=False, allow_unicode=True, width=88
        )


def scene(
    id: str,
    name: str,
    *,
    emoji: str = "",
    description: str = "",
    team: str = "",
    entry: str = "",
    version: str = "",
    tags: Sequence[str] = (),
    icon: str = "",
) -> Scene:
    """A scene, written in Python (LOOP P-30); see `Scene`."""
    return Scene(
        id,
        name,
        emoji=emoji,
        description=description,
        team=team,
        entry=entry,
        version=version,
        tags=tags,
        icon=icon,
    )


def stage(
    scene: Scene,
    *,
    runs_in: Optional[Mapping[str, str]] = None,
    positions: Optional[Mapping[str, Tuple[float, float]]] = None,
    opens_first: str = "",
    transcript: Optional[Mapping[str, Any]] = None,
    inspectors: Sequence[str] = (),
    rests_after: str = "",
    pace: Optional[str] = None,
    audience: Optional[str] = None,
    ceiling_per_ask: float = 0,
    asks_a_day: int = 0,
    account: str = "",
    page: str = "",
    addresses: Optional[Mapping[str, str]] = None,
) -> Scene:
    """Where a scene plays, written into it (LOOP P-30, S-09): its stage.

    A stage is not a spec of its own: it is the parts of the scene that say
    where each player runs (``runs_in``: ``browser`` or ``runtime``), where
    it stands on the page (``positions``, fractions of the box, ``(x, y)``)
    and whose balloon opens first, what the transcript shows, who may watch
    and ask (``audience``: ``visitors``, ``signed-in`` or ``nobody``) and
    what an ask may cost, and where it is deployed — under which
    ``account``, on which ``page``, and the variable each runtime player's
    A2A address is read from (``addresses``).

    Returns the scene, its stage written.
    """
    for member, place in (runs_in or {}).items():
        player = next(
            (given for given in scene._cast if given["member"] == member), None
        )
        if player is None:
            raise ValueError(
                f"The stage puts '{member}' {place}, and the scene has no player '{member}'."
            )
        player["runs_in"] = place
    scene._stage.update(
        _given(
            positions={
                member: {"x": float(x), "y": float(y)}
                for member, (x, y) in (positions or {}).items()
            },
            opens_first=opens_first,
            transcript=dict(transcript or {}),
            inspectors=list(inspectors),
            rests_after=rests_after,
            pace=pace,
        )
    )
    scene._audience.update(
        _given(
            who=audience,
            ceiling_per_ask=ceiling_per_ask or None,
            asks_a_day=asks_a_day or None,
        )
    )
    scene._deployment.update(
        _given(account=account, page=page, addresses=dict(addresses or {}))
    )
    return scene


def load_scene_source(source: Union[str, bytes], file: str) -> Scene:
    """The scene a Python source writes: exactly one `Scene` at its top.

    Raises
    ------
    ValueError
        When it writes none, or more than one; what the source raises as it
        runs, a `SyntaxError` among them, is raised as it is.
    """
    name = str(file or "scene.py")
    text = source if isinstance(source, bytes) else source.encode("utf-8")
    module_name = f"loop_scene_{abs(hash((name, text)))}"
    module = types.ModuleType(module_name)
    module.__file__ = name
    sys.modules[module_name] = module
    try:
        exec(compile(text, name, "exec"), module.__dict__)  # noqa: S102  # nosec B102
    finally:
        sys.modules.pop(module_name, None)
    found: List[Scene] = []
    for value in vars(module).values():
        if isinstance(value, Scene) and value not in found:
            found.append(value)
    if len(found) != 1:
        raise ValueError(
            f"{Path(name).name} writes {len(found)} scenes; it has to write one."
        )
    return found[0]


def load_scene_file(path: Union[str, Path]) -> Scene:
    """The scene a ``scene.py`` writes, compiled from its source each time."""
    file = Path(path).resolve()
    if not file.is_file():
        raise ValueError(f"{file} is not a Python file.")
    return load_scene_source(file.read_bytes(), str(file))


__all__ = [
    "BUILT_HEADER",
    "Beat",
    "Scene",
    "SceneNotPlayable",
    "load_scene_file",
    "load_scene_source",
    "scene",
    "stage",
]
