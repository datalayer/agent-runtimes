/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The chat's conversation is the shared reducer's (MOBILE M-030): the real
 * chat, the real AG-UI adapter. A turn stopped mid-call says the call
 * stopped and takes nothing more of the stream; a conversation read again
 * draws its tool cards with their results, and an answer without the call
 * markup a model leaked into it.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@primer/react';
import { ChatBase } from '../ChatBase';
import type { ResumedThread } from '../../../types/chat';

// The setup's stand-in lacks what the chat's notebook parts import.
vi.mock('@jupyter/ydoc', async importOriginal => await importOriginal());
// The setup's jupyter-react stand-in has no notebook tool definitions.
vi.mock('../../../tools/adapters/agent-runtimes/notebookHooks', () => ({
  useNotebookTools: () => [],
}));

// jsdom does not scroll.
Element.prototype.scrollTo = () => {};

const frame = (event: object) => `data: ${JSON.stringify(event)}\n\n`;

/** A server whose run calls a tool, then says one more word only after the turn was stopped. */
function stalledServer(): { fetch: typeof fetch; more: () => void } {
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  const encode = (text: string) => new TextEncoder().encode(text);
  return {
    fetch: (async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method !== 'POST') {
        return new Response('{}', { status: 404 });
      }
      return new Response(
        new ReadableStream<Uint8Array>({
          start(open) {
            controller = open;
            open.enqueue(
              encode(
                frame({ type: 'RUN_STARTED', threadId: 't', runId: 'r' }) +
                  frame({
                    type: 'TOOL_CALL_START',
                    toolCallId: 'c1',
                    toolCallName: 'slow_search',
                  }),
              ),
            );
          },
        }),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      );
    }) as typeof fetch,
    more: () => {
      try {
        controller?.enqueue(
          encode(
            frame({
              type: 'TEXT_MESSAGE_START',
              messageId: 'late',
              role: 'assistant',
            }) +
              frame({
                type: 'TEXT_MESSAGE_CONTENT',
                messageId: 'late',
                delta: 'Too late.',
              }),
          ),
        );
      } catch {
        // Aborted by the stop: nothing more can come.
      }
    },
  };
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  document.body.innerHTML = '';
});

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });
  }
}

let agents = 0;

describe('the chat’s conversation', () => {
  it('says a call stopped mid-turn, and takes nothing more of the stream', async () => {
    const server = stalledServer();
    globalThis.fetch = server.fetch;
    const agentId = `conversation-agent-${++agents}`;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    let handle: { stop: () => void } | null = null;
    await act(async () => {
      root.render(
        <ThemeProvider>
          <ChatBase
            protocol={{
              type: 'ag-ui',
              endpoint: `http://127.0.0.1:1/api/v1/ag-ui/${agentId}`,
              agentId,
            }}
            useStore={false}
            pendingPrompt="find it"
            onSendReady={given => {
              handle = given;
            }}
          />
        </ThemeProvider>,
      );
    });
    await settle();
    expect(container.textContent).toContain('Slow Search');
    expect(container.textContent).toContain('Executing...');
    await act(async () => handle?.stop());
    server.more();
    await settle();
    expect(container.textContent).not.toContain('Executing...');
    expect(container.textContent).not.toContain('Too late.');
    await act(async () => root.unmount());
  });

  it('draws a conversation read again with its tool cards and their results', async () => {
    globalThis.fetch = (async () =>
      new Response('{}', { status: 404 })) as typeof fetch;
    const agentId = `conversation-agent-${++agents}`;
    const thread: ResumedThread = {
      id: `thread-${agentId}`,
      messages: [
        {
          id: 'u1',
          role: 'user',
          content: 'Count them',
          createdAt: new Date(),
        },
        {
          id: 'a1',
          role: 'assistant',
          content: 'Counting.<calls><invoke name="x"></invoke></calls>',
          createdAt: new Date(),
          toolCalls: [
            {
              type: 'tool-call',
              toolCallId: 'c1',
              toolName: 'count_rows',
              args: { table: 'orders' },
              status: 'completed',
            },
          ],
        },
        {
          id: 'r1',
          role: 'tool',
          content: '{"rows": 42}',
          createdAt: new Date(),
          metadata: { toolCallId: 'c1' },
        },
        {
          id: 'a2',
          role: 'assistant',
          content: '42 rows.',
          createdAt: new Date(),
        },
      ],
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ThemeProvider>
          <ChatBase
            protocol={{
              type: 'ag-ui',
              endpoint: `http://127.0.0.1:1/api/v1/apps/agents/${agentId}/ag-ui/`,
              agentId,
            }}
            useStore={false}
            thread={thread}
          />
        </ThemeProvider>,
      );
    });
    await settle();
    const text = container.textContent ?? '';
    expect(text).toContain('Count them');
    expect(text).toContain('Counting.');
    expect(text).not.toContain('<calls>');
    expect(text).toContain('Count Rows');
    expect(text).toContain('42 rows.');
    expect(text).not.toContain('Executing...');
    await act(async () => root.unmount());
  });
});
