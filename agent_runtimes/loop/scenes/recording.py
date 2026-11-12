# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A scene's recording: one passing rehearsal's transcript, kept to play when the scene cannot.

`loop scenes rehearse --transcript run.json` writes what a rehearsal played
as the transcript JSON a stage exports (version 1: ``{version, scene,
lines}``), with the beats each line belongs to and the verdict it came from
(`agent_runtimes.loop.scenes.rehearsal.transcript_of_rehearsal`). `loop
scenes record` takes such a file, and only one whose rehearsal passed every
beat of the scene, and keeps it beside the specs as ``<id>/recording.json``
(:func:`recording_of`, :func:`write_recording`), then names it in the scene's
YAML under ``rehearsal.recording`` (:func:`with_recording`): its path, when
it was taken, and what the audience is told.

A stage plays it at the pace it was recorded, under *Recording, taken
<date>*; the page's reader is ``transcriptExport.ts``'s, this package's is
`agent_runtimes.loop.scenes.transcript.lines_of_json`.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Mapping

import yaml

from agent_runtimes.loop.scenes.transcript import lines_of_json


class RecordingRefused(ValueError):
    """A transcript that is not a passing rehearsal of the scene, said in a sentence."""


def recording_of(
    transcript: Mapping[str, Any], scene: Any, *, taken: str, note: str = ""
) -> Dict[str, Any]:
    """The recording a rehearsal's transcript makes, or a sentence why it makes none.

    The transcript is version 1 (its lines are read as a stage reads them),
    of this scene, from a rehearsal that passed (``rehearsal.passed``) and
    played every beat the scene's rehearsal names. What is kept is the
    transcript itself, its ``taken`` date and ``note`` beside it.
    """
    try:
        lines = lines_of_json(dict(transcript))
    except ValueError as refused:
        raise RecordingRefused(str(refused)) from None
    if not lines:
        raise RecordingRefused(
            "The transcript holds no lines: there is nothing to play."
        )
    said_scene = str(transcript.get("scene") or "")
    if said_scene and said_scene != scene.id:
        raise RecordingRefused(
            f"The transcript is of the scene {said_scene!r}, not of {scene.id!r}."
        )
    rehearsal = transcript.get("rehearsal")
    if not isinstance(rehearsal, Mapping):
        raise RecordingRefused(
            "The transcript says no rehearsal: a recording is taken from one that passed "
            "(`loop scenes rehearse --cloud --transcript <file>`)."
        )
    if rehearsal.get("passed") is not True:
        said = str(rehearsal.get("says") or "it did not pass")
        raise RecordingRefused(f"The rehearsal did not pass: {said}")
    played = [
        str(beat.get("beat"))
        for beat in transcript.get("beats") or []
        if isinstance(beat, Mapping)
    ]
    wanted = [beat.beat for beat in scene.rehearsal.beats]
    missing = [beat for beat in wanted if beat not in played]
    if missing:
        raise RecordingRefused(
            "The rehearsal did not play every beat: "
            + ", ".join(missing)
            + (" is" if len(missing) == 1 else " are")
            + " missing."
        )
    document: Dict[str, Any] = {
        key: value for key, value in transcript.items() if key != "lines"
    }
    document["scene"] = scene.id
    document["taken"] = taken
    if note:
        document["note"] = note
    document["lines"] = list(transcript["lines"])
    return document


def recording_file(scene_id: str, directory: Path) -> Path:
    """Where a scene's recording is kept in a folder of scene specs: ``<id>/recording.json``."""
    return directory / scene_id.split(":")[0] / "recording.json"


def write_recording(document: Mapping[str, Any], directory: Path) -> Path:
    """Keep a recording beside the specs, and say where."""
    path = recording_file(str(document["scene"]), directory)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(document, indent=2, ensure_ascii=False) + "\n")
    return path


def _quoted(text: str) -> str:
    return json.dumps(text, ensure_ascii=False)


_REHEARSAL_LINE = re.compile(r"^rehearsal\s*:\s*(#.*)?$")


def _spec_of(text: str) -> Mapping[Any, Any]:
    """The scene's YAML, read; a sentence when it does not read as a mapping."""
    try:
        data = yaml.safe_load(text)
    except yaml.YAMLError as error:
        raise RecordingRefused(f"The scene's YAML does not read: {error}") from None
    if data is None:
        return {}
    if not isinstance(data, Mapping):
        raise RecordingRefused("The scene's YAML is not a mapping.")
    return data


def _rest_of(spec: Mapping[Any, Any]) -> Dict[Any, Any]:
    """The spec but for its recording: what naming the recording leaves as it was."""
    rehearsal = dict(spec.get("rehearsal") or {})
    rehearsal.pop("recording", None)
    return {**spec, "rehearsal": rehearsal}


def _block(indent: int, path: str, *, taken: str, note: str) -> List[str]:
    """The recording's lines, at the rehearsal's indent."""
    pad = " " * indent
    return [
        f"{pad}recording:",
        f"{pad * 2}path: {path}",
        f"{pad * 2}taken: {_quoted(taken)}",
        *([f"{pad * 2}note: {_quoted(note)}"] if note else []),
    ]


def _edited(text: str, path: str, *, taken: str, note: str) -> str:
    """The text with the recording's block written in, or none when the rehearsal is not a block."""
    lines = text.removesuffix("\n").split("\n")
    start = next(
        (
            index
            for index, line in enumerate(lines)
            if _REHEARSAL_LINE.match(line.rstrip())
        ),
        None,
    )
    if start is None:
        return ""
    # Where the block ends: at the next line at the left margin that is no comment.
    end = next(
        (
            index
            for index in range(start + 1, len(lines))
            if lines[index].strip() and lines[index][0] not in " \t#"
        ),
        len(lines),
    )
    # The blank lines and the top-level comments before the next key stay outside the block.
    while end > start + 1 and (
        not lines[end - 1].strip() or lines[end - 1].startswith("#")
    ):
        end -= 1
    first = next(
        (
            line
            for line in lines[start + 1 : end]
            if line.strip() and not line.lstrip().startswith("#")
        ),
        None,
    )
    indent = len(first) - len(first.lstrip(" ")) if first else 2
    key_line = re.compile(rf"^ {{{indent}}}[\"']?([A-Za-z_][\w-]*)[\"']?\s*:")
    keys = [
        (index, found.group(1))
        for index in range(start + 1, end)
        if (found := key_line.match(lines[index]))
    ]
    written = _block(indent, path, taken=taken, note=note)
    recording = next((index for index, key in keys if key == "recording"), None)
    if recording is not None:
        after = next((index for index, _ in keys if index > recording), end)
        # What is written above the next key is that key's.
        while after > recording + 1 and (
            not lines[after - 1].strip() or lines[after - 1].lstrip().startswith("#")
        ):
            after -= 1
        return "\n".join(lines[:recording] + written + lines[after:]) + "\n"
    at = next((index for index, key in keys if key == "verified"), end)
    return "\n".join(lines[:at] + written + lines[at:]) + "\n"


def with_recording(text: str, path: str, *, taken: str, note: str = "") -> str:
    """The scene's YAML with ``rehearsal.recording`` naming the recording; the rest kept as written.

    The recording's block replaces the one there, or goes before
    ``verified`` (else at the end of ``rehearsal``), at the rehearsal's own
    indent; the file's comments and order stay as they are. A YAML with no
    ``rehearsal`` gains one.

    The edit is of the text, to keep what a YAML writer would lose, and it is
    checked: what it writes must read as the same spec with this recording.
    A form it cannot edit that way (a ``rehearsal`` in flow style, or under
    an anchor) is refused, nothing written.
    """
    spec = _spec_of(text)
    said = spec.get("rehearsal")
    if said is not None and not isinstance(said, Mapping):
        raise RecordingRefused("The scene's rehearsal is not a mapping.")
    if "rehearsal" in spec:
        edited = _edited(text, path, taken=taken, note=note)
    else:
        block = _block(2, path, taken=taken, note=note)
        edited = text.rstrip("\n") + "\n\nrehearsal:\n" + "\n".join(block) + "\n"
    wanted = {"path": path, "taken": taken, **({"note": note} if note else {})}
    if edited:
        try:
            reread = _spec_of(edited)
        except RecordingRefused:
            reread = {}
        if (
            isinstance(reread.get("rehearsal"), Mapping)
            and reread["rehearsal"].get("recording") == wanted
            and _rest_of(reread) == _rest_of(spec)
        ):
            return edited
    raise RecordingRefused(
        "The scene's rehearsal cannot be edited where it is written: write it as "
        "a block of keys, one to a line, and record again."
    )


def recorded_lines(document: Mapping[str, Any]) -> List[Any]:
    """The lines of a recording, read as a stage reads them."""
    return lines_of_json(dict(document))


__all__ = [
    "RecordingRefused",
    "recorded_lines",
    "recording_file",
    "recording_of",
    "with_recording",
    "write_recording",
]
