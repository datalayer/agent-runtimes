/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 *
 * @vitest-environment node
 */

/** A turn's state from its semantic events (DC-004). */

import { describe, expect, it } from 'vitest';
import type { SemanticEvent } from '../../semantic';
import { TurnState } from '../turnState';

const of = (...events: SemanticEvent[]) => {
  const state = new TurnState();
  for (const event of events) state.apply(event);
  return state;
};

describe('TurnState', () => {
  it('builds the answer and the status as the turn streams', () => {
    const state = of(
      { kind: 'progress', label: 'Reading' },
      { kind: 'tool', id: 'c1', name: 'search', status: 'running' },
      { kind: 'text', text: 'Option B ' },
    );
    expect(state.running).toBe(true);
    expect(state.status).toBe('Using search');
    state.apply({ kind: 'tool', id: 'c1', name: 'search', status: 'failed' });
    expect(state.status).toBe('Failed: search');
    expect([...state.tools.values()]).toEqual([
      { name: 'search', status: 'failed' },
    ]);
    state.apply({ kind: 'text', text: 'is safer.' });
    state.apply({ kind: 'completion', text: 'Option B is safer.' });
    // The streamed words are the answer: never repeated by the completion.
    expect(state.answer).toBe('Option B is safer.');
    expect(state.complete).toBe(true);
    expect(state.ended).toBe(true);
    expect(state.status).toBe('Complete');
  });

  it("takes a completion's text when nothing streamed (a replayed turn)", () => {
    expect(of({ kind: 'completion', text: 'Done.' }).answer).toBe('Done.');
  });

  it('ends on a question, a stop and an error, each its own way', () => {
    const asking = of({
      kind: 'ask',
      question: { kind: 'text', prompt: 'Which quarter?' },
    });
    expect([asking.ended, asking.complete, asking.ending]).toEqual([
      true,
      false,
      undefined,
    ]);
    expect(asking.asking?.prompt).toBe('Which quarter?');
    expect(of({ kind: 'stop' }).status).toBe('Stopped');
    const failed = of({ kind: 'error', message: 'The model is unavailable.' });
    expect([failed.ending, failed.error, failed.status]).toEqual([
      'error',
      'The model is unavailable.',
      'Could not finish',
    ]);
  });

  it('keeps approvals, files, tables and citations', () => {
    const state = of(
      { kind: 'approval', toolCallId: 'c3', toolName: 'send_email' },
      { kind: 'file', name: 'q3.csv', url: 'https://x.example/q3.csv' },
      { kind: 'table', columns: ['A', 'B'], rows: [['1', '2']] },
      { kind: 'citation', title: 'Notes', url: 'https://x.example/notes' },
    );
    expect(state.approvals).toEqual(['send_email']);
    expect(state.status).toBe('Waiting for approval to use send_email');
    expect(state.files).toEqual([
      { mediaType: undefined, name: 'q3.csv', url: 'https://x.example/q3.csv' },
    ]);
    expect(state.answer).toContain('| A | B |\n|---|---|\n| 1 | 2 |');
    expect(state.answer).toContain('[Notes](https://x.example/notes)');
  });
});
