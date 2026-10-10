/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The transcript's grammar is one (LOOP A-06, A-14): the lines the page
 * reads from the Agent Inspector's spans (`sceneTranscript.ts`, the
 * reference) are the lines `loop scenes rehearse` reads in Python
 * (`agent_runtimes/loop/scenes/transcript.py`, its twin). Both are held to
 * the one fixture, `agent_runtimes/tests/fixtures/scene_transcript.json`:
 * each case's spans and the lines they give.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { OtelSpan } from '@datalayer/core/lib/otel/types';
import {
  lineText,
  transcriptOfRecord,
  transcriptOfSpans,
  type SceneTranscriptMember,
} from '../sceneTranscript';
import type { RecordEntry } from '../../../apps/apps/records';

type Fixture = {
  members: SceneTranscriptMember[];
  cases: {
    name: string;
    spans: OtelSpan[];
    lines: string[];
    kinds?: string[];
    offsets?: number[];
    open?: boolean[];
    failed?: boolean[];
    never?: string[];
  }[];
  record: {
    member: SceneTranscriptMember;
    entries: RecordEntry[];
    lines: string[];
    first_at: string;
    without_conversations: { entries: number[]; lines: string[] };
  };
};

const FIXTURE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../agent_runtimes/tests/fixtures/scene_transcript.json',
);

const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Fixture;

describe('the transcript fixture, shared with the Python twin', () => {
  for (const scene of fixture.cases) {
    it(scene.name, () => {
      const lines = transcriptOfSpans(scene.spans, fixture.members);
      expect(lines.map(lineText)).toEqual(scene.lines);
      if (scene.kinds) {
        expect(lines.map(line => line.kind)).toEqual(scene.kinds);
      }
      if (scene.offsets) {
        expect(lines.map(line => line.at - lines[0].at)).toEqual(scene.offsets);
      }
      if (scene.open) {
        expect(lines.map(line => Boolean(line.open))).toEqual(scene.open);
      }
      if (scene.failed) {
        expect(lines.map(line => Boolean(line.failed))).toEqual(scene.failed);
      }
      for (const never of scene.never ?? []) {
        expect(lines.some(line => line.text === never)).toBe(false);
      }
    });
  }

  it('reads a finished run the same way', () => {
    const { record } = fixture;
    const lines = transcriptOfRecord(record.entries, record.member);
    expect(lines.map(lineText)).toEqual(record.lines);
    expect(lines[0].at).toBe(Date.parse(record.first_at));
    const entries = record.without_conversations.entries.map(
      index => record.entries[index],
    );
    expect(transcriptOfRecord(entries, record.member).map(lineText)).toEqual(
      record.without_conversations.lines,
    );
  });
});
