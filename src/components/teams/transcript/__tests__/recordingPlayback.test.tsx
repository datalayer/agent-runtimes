/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A recording played back: its lines at the recorded pace (or faster, or
 * with the long pauses cut), one beat's lines alone, the stage at each
 * moment — the link asking, then answering, the call running then its result
 * coming back — and the label it plays under.
 */

// @vitest-environment jsdom
import * as React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@primer/react';
import type { SceneRecordingFile } from '../../../../types/scenes';
import { transcriptJson } from '../transcriptExport';
import {
  playbackOffsets,
  recordedLinesOf,
  recordedMomentAt,
  recordedStageAt,
  recordingLabel,
} from '../recordingPlayback';
import {
  useSceneRecording,
  type SceneRecordingPlayback,
} from '../useSceneRecording';
import { RecordingLabel } from '../RecordingLabel';
import { MEMBERS, SCRIPTED, recorded } from './fixture';

afterEach(cleanup);

/** The scripted scene as a recording: what the page exports, taken on a day, in one beat. */
function recording(): SceneRecordingFile {
  const { lines } = recorded(SCRIPTED);
  const file = JSON.parse(
    transcriptJson(lines, { scene: 'sales-and-accounting', now: () => 0 }),
  ) as SceneRecordingFile;
  return {
    ...file,
    taken: '2026-10-29',
    beats: [
      {
        beat: 'aged-receivables',
        cue: lines[0].text,
        state: 'passed',
        seconds: 5,
        first: 0,
        count: lines.length,
      },
    ],
  };
}

describe('recordingPlayback', () => {
  it('labels a recording with the day it was taken', () => {
    expect(recordingLabel('2026-10-29')).toBe(
      'Recording, taken 29 October 2026',
    );
    expect(recordingLabel('')).toBe('Recording');
    expect(recordingLabel('last week')).toBe('Recording, taken last week');
  });

  it('plays the lines at their recorded pace, faster, or with long pauses cut', () => {
    const lines = recordedLinesOf(recording());
    // The scripted scene: asked at 0 s, Sales asks Accounting at 1 s, Odoo at 2 s, answers at 4.5 s and 5 s.
    expect(playbackOffsets(lines)).toEqual([0, 1000, 2000, 4500, 5000]);
    expect(playbackOffsets(lines, { speed: 2 })).toEqual([
      0, 500, 1000, 2250, 2500,
    ]);
    expect(playbackOffsets(lines, { maxGapMs: 800 })).toEqual([
      0, 800, 1600, 2400, 2900,
    ]);
    expect(recordedLinesOf(recording(), 'aged-receivables')).toHaveLength(5);
    expect(recordedLinesOf(recording(), 'no-such-beat')).toEqual([]);
  });

  it('draws the stage as it was: the link asking, then answering, the call running, then its result', () => {
    const lines = recordedLinesOf(recording());
    const start = lines[0].at;
    const at = (ms: number) =>
      recordedStageAt(lines, start + ms, MEMBERS, 'sales');
    expect(at(500)).toEqual({ flows: {}, calls: [] });
    expect(at(1500).flows).toEqual({ accounting: 'asking' });
    const calling = at(2500);
    expect(calling.calls).toEqual([
      expect.objectContaining({
        member: 'accounting',
        connection: 'odoo-accounting',
        tool: 'odoo_accounting_aged_balance',
      }),
    ]);
    expect(calling.calls[0].ended).toBeUndefined();
    expect(at(4200).calls[0].ended).toBe(start + 4000);
    expect(at(4600).flows).toEqual({ accounting: 'answering' });
    expect(at(4600 + 5000)).toEqual({
      flows: { accounting: 'still' },
      calls: [],
    });
    // The moment a playback offset stands for: never past the next line.
    const offsets = playbackOffsets(lines, { maxGapMs: 800 });
    expect(recordedMomentAt(lines, offsets, 900)).toBe(start + 1100);
    expect(recordedMomentAt(lines, offsets, 1599)).toBe(start + 1799);
  });
});

function Probe({
  file,
  onPlayback,
}: {
  file: SceneRecordingFile;
  onPlayback: (played: SceneRecordingPlayback) => void;
}): React.JSX.Element {
  const played = useSceneRecording(file, {
    members: MEMBERS,
    entry: 'sales',
    tickMs: 100,
  });
  onPlayback(played);
  return (
    <ThemeProvider>
      <RecordingLabel taken={played.taken} note={played.note} />
      <span data-shown={played.lines.length} />
    </ThemeProvider>
  );
}

describe('useSceneRecording', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows each line when its time comes, with the graph’s flows, under its label', () => {
    let last: SceneRecordingPlayback | undefined;
    const { container } = render(
      <Probe file={recording()} onPlayback={played => (last = played)} />,
    );
    expect(
      container.querySelector('[data-scene-recording-label]')!.textContent,
    ).toBe('Recording, taken 29 October 2026');
    expect(last!.lines).toHaveLength(1);
    expect(last!.playing).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(last!.lines.map(line => line.from)).toEqual(['You', 'Sales']);
    expect(last!.flows).toEqual({ accounting: 'asking' });
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(last!.lines).toHaveLength(5);
    expect(last!.done).toBe(true);
    act(() => last!.restart());
    expect(last!.lines).toHaveLength(1);
    expect(last!.playing).toBe(true);
    act(() => last!.pause());
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(last!.lines).toHaveLength(1);
  });

  it('plays nothing without a recording', () => {
    let last: SceneRecordingPlayback | undefined;
    function Empty(): React.JSX.Element {
      last = useSceneRecording(undefined, { members: MEMBERS, entry: 'sales' });
      return <span />;
    }
    render(<Empty />);
    expect(last!.lines).toEqual([]);
    expect(last!.playing).toBe(false);
    expect(last!.label).toBe('Recording');
  });
});
