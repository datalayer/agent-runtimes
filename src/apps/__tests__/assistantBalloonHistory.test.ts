/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The floating assistant's balloon under *History*: it lists the chat's
 * conversation — each person's and assistant's message with words in it, in
 * order — not only the newest line.
 */

import { describe, expect, it } from 'vitest';
import { balloonHistoryOf } from '../plugins/assistant';

describe('balloonHistoryOf', () => {
  it('lists the messages in order, leaving tool calls and empty words out', () => {
    const items = balloonHistoryOf([
      { role: 'user', text: 'hi' },
      { role: 'assistant', text: 'Hi! What do you need?' },
      { role: 'tool', name: 'read_orders', args: {} },
      { role: 'user', text: 'hello' },
      { role: 'assistant', text: '  ' },
    ]);
    expect(
      items.map(item => [item.role, (item as { content: string }).content]),
    ).toEqual([
      ['user', 'hi'],
      ['assistant', 'Hi! What do you need?'],
      ['user', 'hello'],
    ]);
    expect(new Set(items.map(item => item.id)).size).toBe(3);
  });

  it('is empty for an empty conversation', () => {
    expect(balloonHistoryOf([])).toEqual([]);
  });
});
