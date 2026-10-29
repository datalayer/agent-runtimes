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


_TOP_KEY = re.compile(r"^[A-Za-z_][\w-]*:")
_REHEARSAL_KEY = re.compile(r"^  [A-Za-z_][\w-]*:")


def with_recording(text: str, path: str, *, taken: str, note: str = "") -> str:
    """The scene's YAML with ``rehearsal.recording`` naming the recording; the rest kept as written.

    The recording's block replaces the one there, or goes before
    ``verified`` (else at the end of ``rehearsal``); the file's comments and
    order stay as they are. A YAML with no ``rehearsal`` gains one.
    """
    block = [
        "  recording:",
        f"    path: {path}",
        f"    taken: {_quoted(taken)}",
        *([f"    note: {_quoted(note)}"] if note else []),
    ]
    lines = text.splitlines()
    start = next(
        (index for index, line in enumerate(lines) if line.rstrip() == "rehearsal:"),
        None,
    )
    if start is None:
        kept = text.rstrip("\n")
        return kept + "\n\nrehearsal:\n" + "\n".join(block) + "\n"
    end = next(
        (
            index
            for index in range(start + 1, len(lines))
            if _TOP_KEY.match(lines[index])
        ),
        len(lines),
    )
    # The blank lines and the top-level comments before the next key stay outside the block.
    while end > start + 1 and (
        not lines[end - 1].strip() or lines[end - 1].startswith("#")
    ):
        end -= 1
    keys = [
        index for index in range(start + 1, end) if _REHEARSAL_KEY.match(lines[index])
    ]
    found = next(
        (index for index in keys if lines[index].startswith("  recording:")), None
    )
    if found is not None:
        after = next((index for index in keys if index > found), end)
        return "\n".join(lines[:found] + block + lines[after:]) + "\n"
    verified = next(
        (index for index in keys if lines[index].startswith("  verified:")), None
    )
    at = verified if verified is not None else end
    return "\n".join(lines[:at] + block + lines[at:]) + "\n"


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
