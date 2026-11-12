/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A scene's recording, played: when a stage cannot play live, its recording
 * (`SceneRecordingFile`, `SCENE_RECORDINGS` in `specs/sceneRecordings`)
 * plays at the pace it was recorded. The hook hands the page what to draw
 * at each moment — the lines said so far for `TranscriptViews`, the
 * `flows` and `calls` for `A2ATeamGraph`, and the label, *Recording, taken
 * <date>* — and the controls: play, pause, restart.
 *
 * ```tsx
 * const played = useSceneRecording(getSceneRecording(scene.id), { members, entry });
 * <RecordingLabel taken={played.taken} />
 * <A2ATeamGraph … flows={played.flows} calls={played.calls} />
 * <TranscriptViews lines={played.lines} members={members} />
 * ```
 *
 * A line of a recording has no span: the drill-down says so.
 *
 * @module components/teams/transcript/useSceneRecording
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SceneRecordingFile } from '../../../types/scenes';
import type {
  SceneTranscriptLine,
  SceneTranscriptMember,
} from '../sceneTranscriptRules';
import {
  playbackOffsets,
  recordedLinesOf,
  recordedMomentAt,
  recordedStageAt,
  recordingLabel,
  settledStage,
  settleMs,
  type RecordedStage,
} from './recordingPlayback';

/** How the recording is played. */
export type SceneRecordingOptions = {
  /** The members, by id and name, with their connections: for the graph's flows and calls. */
  members: readonly SceneTranscriptMember[];
  /** The member the audience talks to: the links the graph draws flowing start there. */
  entry: string;
  /** One beat's lines only, by its id; every line when unsaid. */
  beat?: string;
  /** Faster than recorded (2 is twice as fast); 1 when unsaid: the recorded pace. */
  speed?: number;
  /** The longest pause between two lines, in milliseconds; none when unsaid. */
  maxGapMs?: number;
  /** Start playing at once; true when unsaid. */
  autoPlay?: boolean;
  /** Start again from the first line once the last was shown, after `loopAfterMs`. */
  loop?: boolean;
  /** How long the last line stays before a loop starts again; 8 s when unsaid. */
  loopAfterMs?: number;
  /** How often the stage is drawn again while a message flows; 250 ms when unsaid. */
  tickMs?: number;
};

/** A recording at a moment of its playback. */
export type SceneRecordingPlayback = RecordedStage & {
  /** The lines said so far, in order. */
  lines: SceneTranscriptLine[];
  /** Every line of what is played: the beat's, or the whole recording's. */
  all: SceneTranscriptLine[];
  /** *Recording, taken 29 October 2026*. */
  label: string;
  /** When it was taken, as the recording says it. */
  taken: string;
  /** What the audience is told of it, when the recording says. */
  note?: string;
  playing: boolean;
  /** Every line was shown and the stage has played them out: it rests (`settledStage`). */
  done: boolean;
  play: () => void;
  pause: () => void;
  restart: () => void;
};

const now = (): number =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();

/** Plays a scene's recording at its recorded pace; nothing to play when there is none. */
export function useSceneRecording(
  recording: SceneRecordingFile | undefined,
  {
    members,
    entry,
    beat,
    speed = 1,
    maxGapMs,
    autoPlay = true,
    loop = false,
    loopAfterMs = 8000,
    tickMs = 250,
  }: SceneRecordingOptions,
): SceneRecordingPlayback {
  const all = useMemo(
    () => (recording ? recordedLinesOf(recording, beat) : []),
    [recording, beat],
  );
  const offsets = useMemo(
    () => playbackOffsets(all, { speed, maxGapMs }),
    [all, speed, maxGapMs],
  );
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(autoPlay && all.length > 0);
  // Where the clock started, minus what was played before a pause.
  const started = useRef<number>(now());
  const total = offsets.length ? offsets[offsets.length - 1] : 0;
  // Played once, the clock runs on until the stage has played its last answer
  // out; a loop's hold, `loopAfterMs`, does that.
  const end = loop ? total : total + settleMs(all, { speed });

  useEffect(() => {
    setElapsed(0);
    started.current = now();
    setPlaying(autoPlay && all.length > 0);
  }, [all, autoPlay]);

  useEffect(() => {
    if (!playing) {
      return undefined;
    }
    const timer = setInterval(() => {
      const at = now() - started.current;
      if (at >= end + (loop ? loopAfterMs : 0)) {
        if (loop) {
          started.current = now();
          setElapsed(0);
          return;
        }
        setElapsed(end);
        setPlaying(false);
        return;
      }
      setElapsed(at);
    }, tickMs);
    return () => clearInterval(timer);
  }, [playing, end, loop, loopAfterMs, tickMs]);

  const play = useCallback(() => {
    if (all.length === 0) {
      return;
    }
    started.current = now() - (elapsed >= end ? 0 : elapsed);
    if (elapsed >= end) {
      setElapsed(0);
    }
    setPlaying(true);
  }, [all.length, elapsed, end]);
  const pause = useCallback(() => setPlaying(false), []);
  const restart = useCallback(() => {
    started.current = now();
    setElapsed(0);
    setPlaying(all.length > 0);
  }, [all.length]);

  const shown = offsets.filter(offset => offset <= elapsed).length;
  const lines = useMemo(() => all.slice(0, shown), [all, shown]);
  const done = all.length > 0 && elapsed >= end && !playing;
  const stage = useMemo(() => {
    if (!all.length) {
      return { flows: {}, calls: [] };
    }
    const moment = recordedStageAt(
      all,
      recordedMomentAt(all, offsets, elapsed, speed),
      members,
      entry,
    );
    return done ? settledStage(moment) : moment;
  }, [all, offsets, elapsed, speed, members, entry, done]);
  const taken = recording?.taken ?? '';
  return {
    ...stage,
    lines,
    all,
    label: recordingLabel(taken),
    taken,
    ...(recording?.note ? { note: recording.note } : {}),
    playing,
    done,
    play,
    pause,
    restart,
  };
}
