/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Which conversation a page tool's call or a panel belongs to: the
 * workspace's surface and its thread, read by the chat when it calls the
 * tool and by the panel from the same workspace.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  conversationKeyOf,
  conversationScopedId,
  perConversation,
  withConversation,
} from '../pageTools/conversationScope';

describe('the conversation’s key', () => {
  it('is the workspace’s surface and its thread, the conversation it continues before', () => {
    expect(conversationKeyOf({ surfaceId: 's', thread: 't' })).toBe('s:t');
    expect(conversationKeyOf({ surfaceId: 's', conversationId: 'c' })).toBe(
      's:c',
    );
    expect(
      conversationKeyOf({ surfaceId: 's', thread: 't', conversationId: 'c' }),
    ).toBe('s:t');
    expect(conversationKeyOf(undefined)).toBe('');
    expect(conversationScopedId('page-notebook', '')).toBe('page-notebook');
    expect(conversationScopedId('page-notebook', 's:t')).toBe(
      'page-notebook:s:t',
    );
  });

  it('reaches each call as it stands when called, and picks that conversation’s tool', async () => {
    let thread = 'a';
    const built = vi.fn((conversation: string) => [
      {
        name: 'read',
        description: 'read',
        handler: async () => conversation,
      },
    ]);
    const tools = withConversation(
      perConversation(
        [{ name: 'read', description: 'read', handler: async () => '' }],
        built,
      ),
      () => conversationKeyOf({ surfaceId: 'surface', thread }),
    );
    expect(await tools[0].handler!({})).toBe('surface:a');
    thread = 'b';
    expect(await tools[0].handler!({})).toBe('surface:b');
    expect(await tools[0].handler!({})).toBe('surface:b');
    expect(built).toHaveBeenCalledTimes(2);
  });
});
