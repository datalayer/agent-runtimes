/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 *
 * BSD 3-Clause License
 */

/**
 * No bubble for an answer that says nothing between two steps (the user, 28
 * November 2026: an empty message after a Poppy tool's cards).
 */
import { describe, expect, it } from 'vitest';
import { isEmptyMessage } from '../messages/ChatMessageList';
import { marksOfToolCall } from '../marks';
import { POPPY_ICON } from '../tools/poppy';

const at = new Date(0);

describe('an empty message', () => {
  it('is one with no words', () => {
    expect(
      isEmptyMessage({
        id: '1',
        role: 'assistant',
        content: '  \n',
        createdAt: at,
      }),
    ).toBe(true);
    expect(
      isEmptyMessage({
        id: '2',
        role: 'assistant',
        content: [{ type: 'text', text: '' }],
        createdAt: at,
      } as never),
    ).toBe(true);
  });

  it('is never one with words, an image, a display, or one still written', () => {
    expect(
      isEmptyMessage({
        id: '3',
        role: 'assistant',
        content: 'Hello',
        createdAt: at,
      }),
    ).toBe(false);
    expect(
      isEmptyMessage({
        id: '4',
        role: 'assistant',
        content: [{ type: 'image', url: 'x' }],
        createdAt: at,
      } as never),
    ).toBe(false);
    expect(
      isEmptyMessage({
        id: '5',
        role: 'assistant',
        content: '',
        createdAt: at,
        displays: [{}],
      } as never),
    ).toBe(false);
    expect(
      isEmptyMessage({
        id: '6',
        role: 'assistant',
        content: '',
        createdAt: at,
        live: true,
      }),
    ).toBe(false);
  });
});

describe('Poppy’s mark', () => {
  it('draws the protocol’s icon beside a Poppy tool, before its gateway’s server could claim it', () => {
    const name = 'pap_online_shop_agent_datalayer_ai_pap_propose';
    const marks = marksOfToolCall(name, {}, [
      { id: 'pap_online_shop_agent_datalayer_ai', tools: [{ name }] },
    ]);
    expect(marks).toMatchObject({ kind: 'poppy', icon: POPPY_ICON });
    expect(marksOfToolCall('pap_read', {})).toMatchObject({
      kind: 'poppy',
      icon: POPPY_ICON,
    });
  });
});
