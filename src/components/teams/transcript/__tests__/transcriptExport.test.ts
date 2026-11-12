/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The transcript as a JSON file (SCENES S3-03): the Sales & Accounting
 * transcript with one refused call exports to the fixture the Python tests
 * read back (`agent_runtimes/tests/fixtures/scene_transcript_export.json`;
 * `UPDATE_GOLDEN=1` writes it again), reads back the same, and another
 * version is refused in a sentence.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  linesOfTranscriptJson,
  transcriptFileName,
  transcriptJson,
} from '../transcriptExport';
import { FIXTURES, OPEN_AND_FAILED, recorded } from './fixture';

const EXPORTED = Date.UTC(2026, 9, 29, 12, 0, 0);
const FIXTURE = resolve(FIXTURES, 'scene_transcript_export.json');

describe('the transcript as JSON', () => {
  it('exports the refused call as the fixture Python reads back', () => {
    const text = transcriptJson(recorded(OPEN_AND_FAILED).lines, {
      scene: 'sales-and-accounting',
      now: () => EXPORTED,
    });
    if (process.env.UPDATE_GOLDEN || !existsSync(FIXTURE)) {
      writeFileSync(FIXTURE, text);
    }
    expect(text).toBe(readFileSync(FIXTURE, 'utf8'));
    const file = JSON.parse(text) as {
      version: number;
      scene: string;
      exported: string;
      lines: unknown[];
    };
    expect(file.version).toBe(1);
    expect(file.scene).toBe('sales-and-accounting');
    expect(file.exported).toBe('2026-10-29T12:00:00.000Z');
    expect(file.lines).toHaveLength(4);
  });

  it('reads back what it wrote', () => {
    const { lines } = recorded(OPEN_AND_FAILED);
    expect(linesOfTranscriptJson(transcriptJson(lines))).toEqual(lines);
  });

  it('refuses what is not a transcript file, in a sentence', () => {
    expect(() => linesOfTranscriptJson('nope')).toThrow('not JSON');
    expect(() => linesOfTranscriptJson('[]')).toThrow('not an object');
    expect(() => linesOfTranscriptJson('{"version": 2, "lines": []}')).toThrow(
      'version 2; this reads version 1',
    );
    expect(() => linesOfTranscriptJson('{"version": 1}')).toThrow('no lines');
    expect(() =>
      linesOfTranscriptJson(
        '{"version": 1, "lines": [{"key": "a", "at": 0, "from": "You", "kind": "sang", "text": "la"}]}',
      ),
    ).toThrow('Line 1');
  });

  it('names the file after the scene', () => {
    expect(transcriptFileName('sales-and-accounting')).toBe(
      'sales-and-accounting-transcript.json',
    );
    expect(transcriptFileName('My scene!')).toBe('My-scene-transcript.json');
    expect(transcriptFileName()).toBe('transcript.json');
  });
});
