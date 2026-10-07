# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A scene's rehearsal: each beat played and compared to its expected shape (LOOP A-14).

A scene spec's ``rehearsal`` says, per beat, the shape its transcript must
take (``lines``, in the transcript's own grammar: *You → Sales*, *Accounting
→ Odoo: odoo_accounting_\\**, *Accounting: a table*), the words its answer
must and must not hold, and the time it may take. The beat's cue is played
through the scene (`agent_runtimes.loop.scenes.stage`), its transcript read
from what happened, and the two compared here:

- the expected lines are found in the transcript **in order** (other lines
  may come between them); a line names who and whom by a member's id or
  the name it is shown under, a system by its id, its server or what it is
  shown as; a detail is matched as a pattern (``*``) or as words; *a table*,
  *a chart*, *words* name what the answer comes with;
- ``must_say`` and ``must_not_say`` are read on the entry's answer;
- ``within`` is read on the time the beat took.

Each beat gets a verdict in the words of the Validate tab (V-05, as `loop
apps validate --tests` says them): **passed**, **failed** with what
differed, or **not run** with why. The scene's verdict counts them, and
its exit code is `loop apps validate`'s: 1 when a beat failed, 3 when one
was not run, 0 when every beat passed.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from fnmatch import fnmatchcase
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

from agent_runtimes.loop.apps.own import FAILED, NOT_RUN, PASSED
from agent_runtimes.loop.scenes.stage import Played, kind_of_words
from agent_runtimes.loop.scenes.transcript import (
    ASKED,
    CALLED,
    PERSON,
    SAID,
    TranscriptLine,
    line_text,
)

#: The three states, as a verdict says them.
STATE_WORDS = {PASSED: "passed", FAILED: "failed", NOT_RUN: "not run"}

_DURATION = re.compile(r"^([1-9]\d*)(ms|s|m|h)$")
_UNIT_SECONDS = {"ms": 0.001, "s": 1.0, "m": 60.0, "h": 3600.0}


def seconds_of(duration: str) -> Optional[float]:
    """A duration as the spec writes it (``60s``, ``2m``, ``500ms``), in seconds; None when unsaid."""
    found = _DURATION.match(duration.strip())
    if not found:
        return None
    return int(found.group(1)) * _UNIT_SECONDS[found.group(2)]


def scene_names(scene: Any) -> Dict[str, str]:
    """Every name a line may use, lowercased, to the id it stands for (agentspecs' ``_names``)."""
    names: Dict[str, str] = {PERSON.lower(): PERSON}
    for member in scene.cast_of():
        names[member.member.lower()] = member.member
        if member.persona.name:
            names[member.persona.name.lower()] = member.member
    for system in scene.setting.systems:
        names[system.id.lower()] = system.id
        names[system.server.lower()] = system.id
        names[system.name.lower()] = system.id
    return names


def _same(name: str, other: str, names: Mapping[str, str]) -> bool:
    a, b = name.strip().lower(), other.strip().lower()
    return a == b or names.get(a, a) == names.get(b, b)


def _words_match(detail: str, text: str) -> bool:
    """A detail matches the words: as a pattern with ``*``, else as words they contain."""
    wanted, got = detail.strip().lower(), text.strip().lower()
    if not wanted:
        return True
    if any(mark in wanted for mark in "*?["):
        return fnmatchcase(got, wanted) or fnmatchcase(got, f"*{wanted}*")
    return wanted in got


@dataclass(frozen=True)
class Expected:
    """One expected line, parsed: who, whom (nobody for an answer), the detail."""

    who: str
    whom: str = ""
    detail: str = ""
    text: str = ""
    """The line as written."""

    @property
    def is_answer(self) -> bool:
        return not self.whom


def expected_of(lines: Sequence[str]) -> List[Expected]:
    """The rehearsal's lines, parsed by agentspecs' grammar."""
    from agentspecs.scenes import parse_line

    parsed: List[Expected] = []
    for text in lines:
        line = parse_line(text)
        parsed.append(Expected(line.who, line.whom, line.detail, text))
    return parsed


def line_fits(
    expected: Expected, line: TranscriptLine, names: Mapping[str, str]
) -> bool:
    """Whether a transcript line is the expected one."""
    if expected.is_answer:
        if line.kind != SAID or not _same(expected.who, line.who, names):
            return False
        kind = kind_of_words(expected.detail)
        if kind == "words":
            return bool(line.text.strip())
        if kind is not None:
            return kind in line.shows
        return _words_match(expected.detail, line.text)
    if line.kind not in (ASKED, CALLED):
        return False
    if not _same(expected.who, line.who, names) or not _same(
        expected.whom, line.to, names
    ):
        return False
    return _words_match(expected.detail, line.text)


def shape_differences(
    expected: Sequence[Expected],
    lines: Sequence[TranscriptLine],
    names: Mapping[str, str],
) -> List[str]:
    """What differs between the expected shape and the transcript, in sentences; none when it fits."""
    cursor = 0
    previous: Optional[Expected] = None
    for want in expected:
        found = None
        for index in range(cursor, len(lines)):
            if line_fits(want, lines[index], names):
                found = index
                break
        if found is None:
            after = f" after “{previous.text}”" if previous else ""
            rest = [line_text(line) for line in lines[cursor:]]
            went_on = (
                "; the transcript went on: "
                + "; ".join(f"“{text}”" for text in rest[:3])
                + ("…" if len(rest) > 3 else "")
                if rest
                else "; the transcript ended there"
            )
            return [f"Expected “{want.text}”{after}{went_on}."]
        cursor = found + 1
        previous = want
    return []


def answer_differences(
    answer: str, must_say: Sequence[str], must_not_say: Sequence[str]
) -> List[str]:
    """The words the answer lacks, and the words it should not hold."""
    said = answer.lower()
    differences: List[str] = []
    missing = [word for word in must_say if word.lower() not in said]
    if missing:
        differences.append(
            "It did not say " + ", ".join(f"“{word}”" for word in missing) + "."
        )
    present = [word for word in must_not_say if word.lower() in said]
    if present:
        differences.append(
            "It said " + ", ".join(f"“{word}”" for word in present) + "."
        )
    return differences


def time_difference(seconds: float, within: str) -> List[str]:
    allowed = seconds_of(within) if within else None
    if allowed is not None and seconds > allowed:
        return [f"It took {seconds:.0f} s; the beat allows {within}."]
    return []


@dataclass
class BeatVerdict:
    """One beat's verdict: its state, what it says, and the transcript it was read from."""

    beat: str
    cue: str
    state: str
    says: str = ""
    lines: List[str] = field(default_factory=list)
    seconds: float = 0.0

    @property
    def word(self) -> str:
        return STATE_WORDS[self.state]


def verdict_of(
    beat: Any,
    played: Played,
    names: Mapping[str, str],
) -> BeatVerdict:
    """A played beat compared to what its rehearsal expects."""
    lines = [line_text(line) for line in played.lines]
    if played.error:
        return BeatVerdict(
            beat.beat, played.cue, NOT_RUN, played.error, lines, played.seconds
        )
    differences = shape_differences(expected_of(beat.lines), played.lines, names)
    differences += answer_differences(played.answer, beat.must_say, beat.must_not_say)
    differences += time_difference(played.seconds, beat.within)
    if differences:
        return BeatVerdict(
            beat.beat, played.cue, FAILED, " ".join(differences), lines, played.seconds
        )
    return BeatVerdict(beat.beat, played.cue, PASSED, "", lines, played.seconds)


@dataclass
class RehearsalVerdict:
    """A scene's rehearsal: every beat's verdict, and what the scene says of itself."""

    scene: str
    name: str
    where: str
    """*on this machine* or *on Datalayer*."""
    beats: List[BeatVerdict] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)
    """What was said on the way: setup, a recording, what a member needs."""

    @property
    def passed(self) -> int:
        return sum(beat.state == PASSED for beat in self.beats)

    @property
    def failed(self) -> int:
        return sum(beat.state == FAILED for beat in self.beats)

    @property
    def not_run(self) -> int:
        return sum(beat.state == NOT_RUN for beat in self.beats)

    @property
    def live(self) -> bool:
        """A scene whose rehearsal passed, every beat, is *Live*."""
        return bool(self.beats) and self.passed == len(self.beats)

    @property
    def says(self) -> str:
        if not self.beats:
            return "Rehearsal: no beat to play."
        said = f"Rehearsal: {self.passed} of {len(self.beats)} beats passed."
        if self.failed:
            said += f" {self.failed} failed."
        if self.not_run:
            said += f" {self.not_run} not run."
        said += " The scene is Live." if self.live else " The scene is not Live."
        return said

    @property
    def exit_code(self) -> int:
        """`loop apps validate`'s: 1 when a beat failed, 3 when one was not run, else 0."""
        if self.failed:
            return 1
        if self.not_run or not self.beats:
            return 3
        return 0

    def as_dict(self) -> Dict[str, Any]:
        return {
            "scene": self.scene,
            "name": self.name,
            "where": self.where,
            "beats": [{**asdict(beat), "word": beat.word} for beat in self.beats],
            "notes": list(self.notes),
            "says": self.says,
            "live": self.live,
            "exit_code": self.exit_code,
        }


def members_needed(scene: Any, beat_id: str, entry: str) -> List[str]:
    """The members a beat needs: the entry, and whoever its moves name."""
    needed = [entry]
    cast = {member.member for member in scene.cast_of()}
    beat = scene.beat(beat_id)
    for move in beat.moves if beat is not None else []:
        for member_id in (move.who, move.asks):
            if member_id in cast and member_id not in needed:
                needed.append(member_id)
    return needed


def recording_note(scene: Any) -> str:
    """What a scene with a recording says when it was not played live."""
    recording = scene.rehearsal.recording
    if recording is None:
        return ""
    taken = f", taken {recording.taken}" if recording.taken else ""
    note = f": {recording.note}" if recording.note else ""
    return f"Not played live: its recording stands ({recording.path}{taken}){note}."


async def rehearse(
    scene: Any,
    stage: Any,
    *,
    where: str,
    beats: Optional[Sequence[str]] = None,
    told: Optional[Any] = None,
) -> RehearsalVerdict:
    """Play the rehearsal's beats through the stage and judge each.

    Parameters
    ----------
    scene : SceneSpec
        The scene, with its script and rehearsal.
    stage : Stage
        Its members, ready to play.
    where : str
        Where it plays, for the verdict: *on this machine*, *on Datalayer*.
    beats : sequence of str, optional
        The beats to play, by id; all when unsaid.
    told : callable, optional
        Told each beat's verdict as it comes.
    """
    names = scene_names(scene)
    verdict = RehearsalVerdict(scene=scene.id, name=scene.name, where=where)
    wanted = set(beats or [])
    for rehearsed in scene.rehearsal.beats:
        if wanted and rehearsed.beat not in wanted:
            continue
        beat = scene.beat(rehearsed.beat)
        cue = beat.cue.text if beat is not None else ""
        if beat is None or not cue.strip():
            judged = BeatVerdict(
                rehearsed.beat,
                cue,
                NOT_RUN,
                f"The beat {rehearsed.beat} has no cue to say."
                if beat is not None
                else f"The script has no beat {rehearsed.beat}.",
            )
        else:
            played = await stage.play(
                cue, members_needed(scene, rehearsed.beat, stage.entry)
            )
            judged = verdict_of(rehearsed, played, names)
        verdict.beats.append(judged)
        if told is not None:
            told(judged)
    if verdict.beats and verdict.not_run == len(verdict.beats):
        note = recording_note(scene)
        if note:
            verdict.notes.append(note)
    return verdict


__all__ = [
    "BeatVerdict",
    "Expected",
    "RehearsalVerdict",
    "STATE_WORDS",
    "answer_differences",
    "expected_of",
    "line_fits",
    "members_needed",
    "recording_note",
    "rehearse",
    "scene_names",
    "seconds_of",
    "shape_differences",
    "time_difference",
    "verdict_of",
]
