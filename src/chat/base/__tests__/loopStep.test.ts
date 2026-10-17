/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A step of an application's code (P-16): its `reactor.ui` display
 * (RU-3), as the chat draws it.
 */

import { describe, expect, it } from 'vitest';
import type { DisplayItem } from '../../../types/chat';
import type { Display } from '@datalayer/reactor/ui';
import { STEP_DISPLAY_TYPE, stepOfDisplay, withLoopStep } from '../loopStep';

/** A step's display, as the session API shows it. */
const display = ({
  id,
  ...data
}: Record<string, unknown> & { id: string }): Display => ({
  type: STEP_DISPLAY_TYPE,
  id,
  text: `step ${String(data.name)}`,
  data,
});

const stepOf = (data: Record<string, unknown> & { id: string }) =>
  stepOfDisplay(display(data));

describe('steps', () => {
  it('read a step display, and refuse anything else', () => {
    expect(() =>
      stepOfDisplay({
        type: 'application/x',
        id: 'a',
        text: 'a',
        data: { name: 'a' },
      }),
    ).toThrow(/not a step/);
    expect(() => stepOfDisplay(display({ id: 's' }))).toThrow(/not a step/);
    expect(
      stepOf({
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

  it('draws what a running step wrote so far, in place (P-31)', () => {
    let items: DisplayItem[] = [];
    for (const output of [null, 'SELECT', 'SELECT 1']) {
      items = withLoopStep(
        items,
        stepOf({ id: 'gen', name: 'gen_query', kind: 'tool', output }),
      );
    }
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      toolName: 'gen_query',
      status: 'executing',
      result: 'SELECT 1',
    });
  });

  it('draws a step as a row that runs, then ends in place, nested in its parent', () => {
    let items: DisplayItem[] = [];
    const step = (data: Record<string, unknown> & { id: string }) => {
      items = withLoopStep(items, stepOf(data));
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
