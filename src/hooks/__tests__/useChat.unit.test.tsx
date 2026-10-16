/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `useChat` holds its conversation as `reduceConversation`'s (M-030):
 * an adapter's events, the page's tool results and an inference provider's
 * deltas are read by the shared reducer, and the store's messages are drawn
 * from it.
 *
 * @module hooks/__tests__/useChat
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useChatStore } from '../../stores';
import type { ProtocolEvent } from '../../types/protocol';
import { useChat } from '../useChat';

type Handler = (event: ProtocolEvent) => void;

/** An adapter that answers each message with the events given. */
function adapterSaying(...turns: Partial<ProtocolEvent>[][]) {
  const handlers = new Set<Handler>();
  const sent: unknown[] = [];
  return {
    sent,
    subscribe(handler: Handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    async sendMessage(message: unknown, options: unknown) {
      sent.push({ message, options });
      for (const event of turns.shift() ?? []) {
        handlers.forEach(handler =>
          handler({ timestamp: new Date(), ...event } as ProtocolEvent),
        );
      }
    },
    disconnect() {},
  };
}

afterEach(() => {
  act(() => {
    const store = useChatStore.getState();
    store.setProtocolAdapter(null);
    store.setInferenceProvider(null);
    store.setToolExecutor(null);
    store.clearMessages();
  });
});

describe('useChat on the shared conversation reducer', () => {
  it('draws the person’s prompt and the streamed answer, sanitised', async () => {
    const adapter = adapterSaying([
      {
        type: 'message',
        message: {
          id: 'a-1',
          role: 'assistant',
          content: 'Hel',
          createdAt: new Date(),
        },
      },
      {
        type: 'message',
        message: {
          id: 'a-1',
          role: 'assistant',
          content: 'Hello<calls>x</calls>',
          createdAt: new Date(),
        },
      },
      { type: 'done' },
    ]);
    act(() => useChatStore.getState().setProtocolAdapter(adapter as never));
    const { result } = renderHook(() => useChat());
    await act(() => result.current.sendMessage('Hi'));
    expect(result.current.messages.map(m => [m.role, m.content])).toEqual([
      ['user', 'Hi'],
      ['assistant', 'Hello'],
    ]);
    expect(result.current.error).toBeNull();
  });

  it('says an event it cannot read as the chat’s error', async () => {
    const adapter = adapterSaying([
      {
        type: 'message',
        message: {
          id: 'x',
          role: 'system',
          content: 'no',
          createdAt: new Date(),
        },
      },
    ]);
    act(() => useChatStore.getState().setProtocolAdapter(adapter as never));
    const { result } = renderHook(() => useChat());
    await act(() => result.current.sendMessage('Hi'));
    expect(result.current.error?.message).toMatch(
      /only the person or the assistant/,
    );
  });

  it('runs the page’s tool and continues the run with its result', async () => {
    const adapter = adapterSaying(
      [
        {
          type: 'tool-call',
          toolCall: {
            toolCallId: 'c-1',
            toolName: 'now',
            args: {},
            argsComplete: true,
          },
        },
        { type: 'done' },
      ],
      [
        {
          type: 'message',
          message: {
            id: 'a-2',
            role: 'assistant',
            content: 'It is noon.',
            createdAt: new Date(),
          },
        },
        { type: 'done' },
      ],
    );
    act(() => {
      const store = useChatStore.getState();
      store.setProtocolAdapter(adapter as never);
      store.setToolExecutor({
        execute: async () => ({ success: true, result: 'noon' }),
      } as never);
    });
    const { result } = renderHook(() => useChat());
    await act(() => result.current.sendMessage('What time is it?'));
    expect(adapter.sent).toHaveLength(2);
    expect(result.current.messages.map(m => m.content)).toEqual([
      'What time is it?',
      'It is noon.',
    ]);
  });
});
