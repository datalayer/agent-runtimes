/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A recording played back: the transcript of a passing rehearsal
 * (`<id>/recording.json`, `SceneRecordingFile`), its lines shown at the pace
 * they were recorded, and the stage drawn as it was at each moment — which
 * A2A links carried a message, which tool calls ran.
 *
 * Pure: a recording and a moment of it in, the lines said by then and the
 * graph's `flows` and `calls` out. {@link useSceneRecording} drives it with
 * a clock; a test reads it at any moment.
 *
 * @module components/teams/transcript/recordingPlayback
 */

import type { SceneRecordingFile } from '../../../types/scenes';
import {
  ANSWER_SHOWN_MS,
  RESULT_SHOWN_MS,
  type A2ATeamCall,
  type A2ATeamFlow,
} from '../a2aTeamFlow';
import type {
  SceneTranscriptLine,
  SceneTranscriptMember,
} from '../sceneTranscriptRules';
import { exchangeOf } from './transcriptRows';

/** What a recording's label says: *Recording, taken 29 October 2026*. */
export function recordingLabel(
  taken: string | undefined,
  locale = 'en-GB',
): string {
  const day = (taken ?? '').trim();
  if (!day) {
    return 'Recording';
  }
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(day)
    ? new Date(`${day}T12:00:00Z`)
    : new Date(day);
  const shown = Number.isFinite(parsed.getTime())
    ? parsed.toLocaleDateString(locale, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : day;
  return `Recording, taken ${shown}`;
}

/**
 * The lines of a recording, as a stage draws them: every line, or one
 * beat's (by its id, as `beats` says which lines it played). None for a
 * beat the recording did not play.
 */
export function recordedLinesOf(
  recording: Pick<SceneRecordingFile, 'lines' | 'beats'>,
  beat?: string,
): SceneTranscriptLine[] {
  const lines = recording.lines.map(line => ({ ...line }));
  if (!beat) {
    return lines;
  }
  const found = recording.beats?.find(item => item.beat === beat);
  return found ? lines.slice(found.first, found.first + found.count) : [];
}

/**
 * When each line is shown, in milliseconds from the start of the playback:
 * the recorded pace, divided by `speed`, with no pause longer than
 * `maxGapMs` (a runtime starting between two beats is not worth watching).
 */
export function playbackOffsets(
  lines: readonly Pick<SceneTranscriptLine, 'at'>[],
  { speed = 1, maxGapMs }: { speed?: number; maxGapMs?: number } = {},
): number[] {
  const pace = speed > 0 ? speed : 1;
  const offsets: number[] = [];
  let offset = 0;
  lines.forEach((line, index) => {
    if (index > 0) {
      let gap = Math.max(0, line.at - lines[index - 1].at) / pace;
      if (maxGapMs !== undefined) {
        gap = Math.min(gap, maxGapMs);
      }
      offset += gap;
    }
    offsets.push(Math.round(offset));
  });
  return offsets;
}

/**
 * The moment of the recording a playback offset stands for, in recorded
 * milliseconds: the line shown last, plus the time since, at the same pace.
 */
export function recordedMomentAt(
  lines: readonly Pick<SceneTranscriptLine, 'at'>[],
  offsets: readonly number[],
  elapsed: number,
  speed = 1,
): number {
  if (lines.length === 0) {
    return 0;
  }
  let last = 0;
  for (let index = 0; index < offsets.length; index += 1) {
    if (offsets[index] <= elapsed) {
      last = index;
    }
  }
  const since = Math.max(0, elapsed - offsets[last]) * (speed > 0 ? speed : 1);
  const next = lines[last + 1]?.at;
  const moment = lines[last].at + since;
  return next === undefined ? moment : Math.min(moment, next);
}

/** What the stage shows at a moment of the recording: the links' flows and the calls running. */
export type RecordedStage = {
  /** Which way each peer's link carries a message, by the peer's id (`A2ATeamGraph`'s `flows`). */
  flows: Record<string, A2ATeamFlow>;
  /** The tool calls to the members' connections (`A2ATeamGraph`'s `calls`). */
  calls: A2ATeamCall[];
};

function memberIdOf(
  name: string | undefined,
  members: readonly SceneTranscriptMember[],
): string | undefined {
  if (!name) {
    return undefined;
  }
  return (
    members.find(member => member.name === name)?.id ??
    members.find(member => member.id === name)?.id
  );
}

/**
 * The stage at a moment of the recording (`at`, recorded milliseconds), from
 * the lines said by then: a link from the entry to a peer is `asking` while
 * the peer's answer has not come, `answering` for {@link ANSWER_SHOWN_MS}
 * after it; a call to a connection runs until it ended and shows its result
 * coming back for {@link RESULT_SHOWN_MS}.
 */
export function recordedStageAt(
  lines: readonly SceneTranscriptLine[],
  at: number,
  members: readonly SceneTranscriptMember[],
  entry: string,
): RecordedStage {
  const flows: Record<string, A2ATeamFlow> = {};
  const calls: A2ATeamCall[] = [];
  const answers = new Map<string, SceneTranscriptLine>();
  for (const line of lines) {
    if (line.kind === 'said') {
      answers.set(exchangeOf(line.key), line);
    }
  }
  for (const line of lines) {
    if (line.at > at) {
      continue;
    }
    if (line.kind === 'asked') {
      const asker = memberIdOf(line.from, members);
      const asked = memberIdOf(line.to, members);
      if (!asker || !asked || asker !== entry) {
        continue;
      }
      const answer = answers.get(exchangeOf(line.key));
      const answeredAt = answer?.at ?? line.ended;
      if (answeredAt === undefined || at < answeredAt) {
        flows[asked] = 'asking';
      } else if (at < answeredAt + ANSWER_SHOWN_MS) {
        flows[asked] = 'answering';
      } else if (!flows[asked]) {
        flows[asked] = 'still';
      }
      continue;
    }
    if (line.kind === 'called') {
      const member = members.find(
        item => item.name === line.from || item.id === line.from,
      );
      const connection = member?.connections?.find(
        item => item.label === line.to || item.id === line.to,
      );
      if (!member || !connection) {
        continue;
      }
      const ended =
        line.ended !== undefined && line.ended <= at ? line.ended : undefined;
      if (ended !== undefined && at >= ended + RESULT_SHOWN_MS) {
        continue;
      }
      calls.push({
        member: member.id,
        connection: connection.id,
        tool: line.text,
        id: line.key,
        started: line.at,
        ...(ended !== undefined ? { ended } : {}),
      });
    }
  }
  return { flows, calls };
}
