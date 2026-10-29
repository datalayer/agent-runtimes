# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""`loop scenes record`: a passing rehearsal's transcript kept as the scene's recording.

What a rehearsal played is written as the transcript JSON a stage exports
(version 1) with its beats and its verdict; `record` keeps it beside the
specs as ``<id>/recording.json`` and names it in the scene's YAML, and
refuses a transcript that did not pass, misses a beat or is another
scene's. No live call: the verdicts are built by hand.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any, Dict

import pytest
import yaml
from typer.testing import CliRunner

scenes = pytest.importorskip("agentspecs.scenes")

from agent_runtimes.apps.own import FAILED, PASSED  # noqa: E402
from agent_runtimes.commands import scenes as scenes_command  # noqa: E402
from agent_runtimes.loop.scenes.recording import (  # noqa: E402
    RecordingRefused,
    recorded_lines,
    recording_of,
    with_recording,
)
from agent_runtimes.loop.scenes.rehearsal import (  # noqa: E402
    BeatVerdict,
    RehearsalVerdict,
    transcript_of_rehearsal,
)
from agent_runtimes.loop.scenes.transcript import (  # noqa: E402
    ASKED,
    PERSON,
    SAID,
    TranscriptLine,
    lines_of_json,
)

runner = CliRunner()


def _verdict(scene: Any, *, state: str = PASSED, beats: int = 0) -> RehearsalVerdict:
    """Every beat of the scene's rehearsal played, two lines each, a second apart."""
    verdict = RehearsalVerdict(scene=scene.id, name=scene.name, where="on Datalayer")
    played = scene.rehearsal.beats[: beats or None]
    for index, beat in enumerate(played):
        at = 1_790_000_000_000 + index * 60_000
        verdict.beats.append(
            BeatVerdict(
                beat.beat,
                f"cue {index}",
                state,
                "",
                [],
                12.5,
                [
                    TranscriptLine(
                        key=f"s{index}:asked",
                        at=at,
                        who=PERSON,
                        to="Sales",
                        kind=ASKED,
                        text=f"cue {index}",
                    ),
                    TranscriptLine(
                        key=f"s{index}:said",
                        at=at + 9_000,
                        who="Sales",
                        kind=SAID,
                        text="Done.",
                    ),
                ],
            )
        )
    return verdict


@pytest.fixture
def scene() -> Any:
    return scenes.get_scene("sales-and-accounting")


@pytest.fixture
def specs(tmp_path: Path) -> Path:
    """A folder of scene specs holding Sales & Accounting as the installed agentspecs has it."""
    folder = tmp_path / "scenes"
    folder.mkdir()
    shutil.copy(Path(scenes.__file__).parent / "sales-and-accounting.yaml", folder)
    return folder


def test_a_rehearsal_is_written_as_the_transcript_a_stage_exports(scene: Any) -> None:
    written = transcript_of_rehearsal(
        _verdict(scene), at="2026-10-30T02:00:00+00:00", exported="now"
    )
    assert written["version"] == 1 and written["scene"] == "sales-and-accounting"
    assert written["rehearsal"] == {
        "at": "2026-10-30T02:00:00+00:00",
        "where": "on Datalayer",
        "passed": True,
        "says": "Rehearsal: 4 of 4 beats passed. The scene is Live.",
    }
    assert [
        (beat["beat"], beat["first"], beat["count"]) for beat in written["beats"]
    ] == [
        ("open-invoices", 0, 2),
        ("aged-receivables", 2, 2),
        ("largest-balance", 4, 2),
        ("payment-reminders", 6, 2),
    ]
    # The page's reader and this one read it back as the lines that were played.
    lines = lines_of_json(json.dumps(written))
    assert [line.who for line in lines[:2]] == [PERSON, "Sales"] and len(lines) == 8
    assert written["lines"][0] == {
        "key": "s0:asked",
        "at": 1_790_000_000_000,
        "from": "You",
        "to": "Sales",
        "kind": "asked",
        "text": "cue 0",
    }
    # The verdict as JSON says no transcript: its lines are the text.
    assert "transcript" not in _verdict(scene).as_dict()["beats"][0]


def test_only_a_passing_rehearsal_of_every_beat_of_the_scene_is_recorded(
    scene: Any,
) -> None:
    passing = transcript_of_rehearsal(_verdict(scene), at="2026-10-30T02:00:00+00:00")
    document = recording_of(
        passing, scene, taken="2026-10-30", note="Recorded on Datalayer."
    )
    assert (
        document["taken"] == "2026-10-30"
        and document["note"] == "Recorded on Datalayer."
    )
    assert len(recorded_lines(document)) == 8 and document["beats"] == passing["beats"]
    failing = transcript_of_rehearsal(_verdict(scene, state=FAILED), at="now")
    with pytest.raises(
        RecordingRefused, match="The rehearsal did not pass: Rehearsal: 0 of 4"
    ):
        recording_of(failing, scene, taken="2026-10-30")
    with pytest.raises(
        RecordingRefused,
        match="aged-receivables, largest-balance, payment-reminders are missing",
    ):
        recording_of(
            transcript_of_rehearsal(_verdict(scene, beats=1), at="now"),
            scene,
            taken="d",
        )
    with pytest.raises(
        RecordingRefused,
        match="of the scene 'month-end-close', not of 'sales-and-accounting'",
    ):
        recording_of({**passing, "scene": "month-end-close"}, scene, taken="d")
    with pytest.raises(RecordingRefused, match="says no rehearsal"):
        recording_of(
            {key: value for key, value in passing.items() if key != "rehearsal"},
            scene,
            taken="d",
        )
    with pytest.raises(RecordingRefused, match="version 2"):
        recording_of({**passing, "version": 2}, scene, taken="d")


def test_the_spec_names_its_recording_and_keeps_its_comments() -> None:
    text = (
        "id: s\n\nrehearsal:\n  # Measured on r1.\n  within: 10m\n  beats:\n    - beat: a\n"
        "  verified:\n    live: []\n\ndeployment:\n  account: demo\n"
    )
    once = with_recording(
        text, "s/recording.json", taken="2026-10-30", note="Recorded."
    )
    assert "  # Measured on r1." in once
    assert once.index("  recording:") < once.index("  verified:")
    data = yaml.safe_load(once)
    assert data["rehearsal"]["recording"] == {
        "path": "s/recording.json",
        "taken": "2026-10-30",
        "note": "Recorded.",
    }
    assert data["deployment"] == {"account": "demo"}
    # Again: the block is replaced, not repeated.
    twice = with_recording(once, "s/recording.json", taken="2026-11-02")
    assert twice.count("  recording:") == 1
    assert yaml.safe_load(twice)["rehearsal"]["recording"] == {
        "path": "s/recording.json",
        "taken": "2026-11-02",
    }
    # A spec with no rehearsal gains one; one with no verified ends its rehearsal with it.
    assert (
        yaml.safe_load(with_recording("id: s\n", "s/recording.json", taken="d"))[
            "rehearsal"
        ]["recording"]["taken"]
        == "d"
    )
    bare = with_recording(
        "rehearsal:\n  within: 1m\n\naudience:\n  who: nobody\n", "s/r.json", taken="d"
    )
    assert yaml.safe_load(bare) == {
        "rehearsal": {"within": "1m", "recording": {"path": "s/r.json", "taken": "d"}},
        "audience": {"who": "nobody"},
    }


def test_record_keeps_the_recording_beside_the_specs_and_names_it(
    scene: Any, specs: Path, tmp_path: Path
) -> None:
    run = tmp_path / "run.json"
    run.write_text(
        json.dumps(
            transcript_of_rehearsal(_verdict(scene), at="2026-10-30T02:00:00+00:00")
        )
    )
    result = runner.invoke(
        scenes_command.app,
        [
            "record",
            "sales-and-accounting",
            "--from",
            str(run),
            "--specs-dir",
            str(specs),
            "--note",
            "Recorded on Datalayer.",
        ],
    )
    assert result.exit_code == 0, result.output
    assert "its recording, taken 2026-10-30, is kept in" in result.output
    kept = json.loads((specs / "sales-and-accounting" / "recording.json").read_text())
    assert (
        kept["version"] == 1
        and kept["taken"] == "2026-10-30"
        and len(kept["lines"]) == 8
    )
    spec: Dict[str, Any] = yaml.safe_load(
        (specs / "sales-and-accounting.yaml").read_text()
    )
    assert spec["rehearsal"]["recording"] == {
        "path": "sales-and-accounting/recording.json",
        "taken": "2026-10-30",
        "note": "Recorded on Datalayer.",
    }
    # The spec still reads, its recording beside it.
    assert scenes.load_scene(
        specs / "sales-and-accounting.yaml"
    ).rehearsal.recording.path == ("sales-and-accounting/recording.json")


def test_record_refuses_a_rehearsal_that_did_not_pass(
    scene: Any, specs: Path, tmp_path: Path
) -> None:
    before = yaml.safe_load((specs / "sales-and-accounting.yaml").read_text())[
        "rehearsal"
    ]
    recording = specs / "sales-and-accounting" / "recording.json"
    run = tmp_path / "run.json"
    run.write_text(
        json.dumps(transcript_of_rehearsal(_verdict(scene, state=FAILED), at="now"))
    )
    result = runner.invoke(
        scenes_command.app,
        [
            "record",
            "sales-and-accounting",
            "--from",
            str(run),
            "--specs-dir",
            str(specs),
        ],
    )
    assert result.exit_code == 1
    assert "The rehearsal did not pass" in result.output
    # Nothing written: the scene's rehearsal, recorded or not, is as it was.
    assert not recording.exists()
    assert (
        yaml.safe_load((specs / "sales-and-accounting.yaml").read_text())["rehearsal"]
        == before
    )
