# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Scenes played from Python (LOOP A-14): the transcript, the stage, the rehearsal.

- `agent_runtimes.loop.scenes.transcript`: the transcript's grammar in
  Python, the twin of the page's ``sceneTranscript.ts``;
- `agent_runtimes.loop.scenes.stage`: a scene's members played — in this
  process, or over A2A where they are served — recorded as spans;
- `agent_runtimes.loop.scenes.rehearsal`: each beat compared to its
  expected shape, a verdict in the Validate tab's words.

`loop scenes` (`agent_runtimes.commands.scenes`) is the command.
"""

from agent_runtimes.loop.scenes.rehearsal import (
    BeatVerdict,
    RehearsalVerdict,
    rehearse,
    verdict_of,
)
from agent_runtimes.loop.scenes.stage import Played, Stage, StageMember, members_of
from agent_runtimes.loop.scenes.transcript import (
    PERSON,
    SceneConnection,
    SceneMember,
    TranscriptLine,
    line_text,
    transcript_of_record,
    transcript_of_spans,
    transcript_text,
)

__all__ = [
    "BeatVerdict",
    "PERSON",
    "Played",
    "RehearsalVerdict",
    "SceneConnection",
    "SceneMember",
    "Stage",
    "StageMember",
    "TranscriptLine",
    "line_text",
    "members_of",
    "rehearse",
    "transcript_of_record",
    "transcript_of_spans",
    "transcript_text",
    "verdict_of",
]
