/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A message of an application's code changed after it was sent (LOOP P-15):
 * the session API's `loop.message` event, as the chat applies it.
 */

import { describe, expect, it } from 'vitest';
import {
  LOOP_MESSAGE,
  loopMessageChange,
  speakerOf,
  withLoopMessage,
} from '../loopMessage';

const items = [
  { id: 'm1', role: 'assistant', content: 'Searching…' },
  { id: 't1', type: 'tool-call', toolCallId: 't1' },
  { id: 'm2', role: 'assistant', content: 'Found 3.' },
];

describe('loop.message', () => {
  it('reads an author, a removal, and nothing else', () => {
    expect(
      loopMessageChange({
        type: LOOP_MESSAGE,
        data: { id: 'm2', author: 'Searcher' },
      }),
    ).toEqual({ id: 'm2', author: 'Searcher' });
    expect(
      loopMessageChange({
        type: LOOP_MESSAGE,
        data: { id: 'm1', removed: true },
      }),
    ).toEqual({ id: 'm1', removed: true });
    expect(loopMessageChange({ type: 'loop.ask', data: { id: 'm1' } })).toBe(
      null,
    );
    expect(loopMessageChange({ type: LOOP_MESSAGE, data: { id: 'm1' } })).toBe(
      null,
    );
    expect(loopMessageChange({ type: LOOP_MESSAGE, data: null })).toBe(null);
    expect(loopMessageChange(undefined)).toBe(null);
  });

  it('takes a message away, and leaves the rest', () => {
    expect(
      withLoopMessage(items, { id: 'm1', removed: true }).map(item => item.id),
    ).toEqual(['t1', 'm2']);
  });

  it('names the author of one message only', () => {
    const named = withLoopMessage(items, { id: 'm2', author: 'Searcher' });
    expect(named[2]).toEqual({ ...items[2], speaker: speakerOf('Searcher') });
    expect(speakerOf('Searcher').name).toBe('Searcher');
    expect(named[0]).toBe(items[0]);
    expect(named[1]).toBe(items[1]);
  });
});
