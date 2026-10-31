/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The transcript as rows (SCENES S2-01): a call's duration from its two
 * ends, an ask's from the question to the answer, a failed exchange marked,
 * sorting by time holding the open call last; the Markdown; the filter.
 */

import { describe, expect, it } from 'vitest';
import type { SceneTranscriptLine } from '../../sceneTranscriptRules';
import {
  byTime,
  durationText,
  filterLines,
  namesOf,
  transcriptMarkdown,
  transcriptRows,
} from '../transcriptRows';
import { OPEN_AND_FAILED, SCRIPTED, recorded } from './fixture';

describe('transcriptRows', () => {
  it('carries the duration of a call from its two ends, and of an ask to its answer', () => {
    const rows = transcriptRows(recorded(SCRIPTED).lines);
    expect(
      rows.map(row => [row.id, row.over, row.durationMs, row.state]),
    ).toEqual([
      ['s1:asked', undefined, 5000, 'done'],
      ['s3:asked', 'a2a', 3500, 'done'],
      ['s4:called', 'mcp', 2000, 'done'],
      ['s3:said', 'a2a', undefined, 'done'],
      ['s1:said', undefined, undefined, 'done'],
    ]);
    expect(rows.every(row => !row.exchangeFailed)).toBe(true);
  });

  it('marks a failed exchange: the refusal, and the ask it answers', () => {
    const rows = transcriptRows(recorded(OPEN_AND_FAILED).lines);
    expect(
      rows.map(row => [row.id, row.state, row.exchangeFailed, row.durationMs]),
    ).toEqual([
      ['f1:asked', 'done', false, undefined],
      ['f2:asked', 'done', true, 1000],
      ['f3:called', 'open', false, undefined],
      ['f2:said', 'failed', true, undefined],
    ]);
  });

  it('sorts by time with the open call last among its ties', () => {
    const rows = transcriptRows(recorded(OPEN_AND_FAILED).lines);
    // The open call shares its time with two closed lines: it comes after them.
    const shuffled = [rows[2], rows[3], rows[0], rows[1]];
    expect(byTime(shuffled).map(row => row.id)).toEqual([
      'f1:asked',
      'f2:asked',
      'f3:called',
      'f2:said',
    ]);
    expect(byTime(shuffled, 'DESC').map(row => row.id)).toEqual([
      'f2:said',
      'f3:called',
      'f2:asked',
      'f1:asked',
    ]);
  });

  it('says a duration in words', () => {
    expect(durationText(undefined)).toBe('');
    expect(durationText(12)).toBe('12 ms');
    expect(durationText(1200)).toBe('1.2 s');
    expect(durationText(2000)).toBe('2 s');
    expect(durationText(63_000)).toBe('1 min 3 s');
    expect(durationText(120_000)).toBe('2 min');
  });

  it('writes the rows as a Markdown table, bars and breaks escaped', () => {
    const lines: SceneTranscriptLine[] = [
      {
        key: 'a:asked',
        at: 0,
        from: 'You',
        to: 'Sales',
        kind: 'asked',
        text: 'One | two\nthree',
      },
    ];
    const markdown = transcriptMarkdown(transcriptRows(lines));
    const [head, rule, row] = markdown.split('\n');
    expect(head).toBe(
      '| Time | From | To | Over | Kind | Text | Duration | State |',
    );
    expect(rule).toBe('| --- | --- | --- | --- | --- | --- | --- | --- |');
    expect(row).toContain(
      '| You | Sales |  | asked | One \\| two three |  | done |',
    );
  });

  it('narrows the lines by member, by kind, to what failed, and puts what failed first', () => {
    const { lines } = recorded(OPEN_AND_FAILED);
    expect(namesOf(lines)).toEqual(['You', 'Sales', 'Accounting', 'Odoo']);
    expect(
      filterLines(lines, { members: ['Odoo'] }).map(line => line.key),
    ).toEqual(['f3:called']);
    expect(
      filterLines(lines, { kinds: ['asked'] }).map(line => line.key),
    ).toEqual(['f1:asked', 'f2:asked']);
    // Failed only keeps the whole exchange: the ask, and the refusal that answers it.
    expect(
      filterLines(lines, { failedOnly: true }).map(line => line.key),
    ).toEqual(['f2:asked', 'f2:said']);
    expect(
      filterLines(lines, { failedFirst: true }).map(line => line.key),
    ).toEqual(['f2:asked', 'f2:said', 'f1:asked', 'f3:called']);
    expect(filterLines(lines, { members: [], kinds: [] })).toEqual(lines);
  });
});
