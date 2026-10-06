/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A step of an application's code (LOOP P-16): the session API's `loop.step`
 * event, as the chat draws it.
 */

import { describe, expect, it } from 'vitest';
import type { DisplayItem } from '../../../types/chat';
import { loopStepOf, withLoopStep } from '../loopStep';

const event = (data: Record<string, unknown>) => ({ type: 'loop.step', data });

describe('loop.step', () => {
  it('reads a step, and nothing else', () => {
    expect(loopStepOf({ type: 'loop.message', data: { id: 'a' } })).toBeNull();
    expect(loopStepOf(event({ name: 'Searching' }))).toBeNull();
    expect(
      loopStepOf(
        event({
          id: 's1',
          name: 'Searching',
          kind: 'tool',
          parent_id: null,
          input: 'q',
          output: null,
          error: '',
          started_at: '2026-10-06T10:00:00+00:00',
          ended_at: null,
        }),
      ),
    ).toEqual({
      id: 's1',
      name: 'Searching',
      kind: 'tool',
      parentId: null,
      input: 'q',
      output: null,
      error: '',
      ended: false,
    });
  });

  it('draws a step as a row that runs, then ends in place, nested in its parent', () => {
    let items: DisplayItem[] = [];
    const step = (data: Record<string, unknown>) => {
      const read = loopStepOf(event(data));
      if (!read) throw new Error('not a step');
      items = withLoopStep(items, read);
    };
    step({ id: 'outer', name: 'Researching', kind: 'run', input: 'q' });
    step({ id: 'inner', name: 'Searching', kind: 'tool', parent_id: 'outer' });
    step({
      id: 'inner',
      name: 'Searching',
      kind: 'tool',
      parent_id: 'outer',
      output: [1, 2, 3],
      ended_at: '2026-10-06T10:00:01+00:00',
    });
    step({
      id: 'outer',
      name: 'Researching',
      kind: 'run',
      input: 'q',
      error: 'no network',
      ended_at: '2026-10-06T10:00:02+00:00',
    });
    expect(items).toEqual([
      {
        id: 'step-outer',
        type: 'tool-call',
        toolCallId: 'step-outer',
        toolName: 'Researching',
        args: { kind: 'run', input: 'q' },
        status: 'error',
        error: 'no network',
        summary: 'run step',
      },
      {
        id: 'step-inner',
        type: 'tool-call',
        toolCallId: 'step-inner',
        toolName: 'Searching',
        args: { kind: 'tool' },
        result: [1, 2, 3],
        status: 'complete',
        summary: 'tool step, inside Researching',
      },
    ]);
  });
});
