/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What a turn puts in the conversation stays there.
 *
 * A whole answer that arrives in one network chunk is shown whole.
 * Seen in Chrome: an agent that wrote its answer word by word was shown word
 * by word, and one whose answer reached the browser in a single chunk was
 * shown as its first word ("Hello") — in the conversation and in the floating
 * assistant's balloon. The adapters parsed every event of the chunk; the chat
 * queued one state update per delta in the same task, the turn's end cleared
 * the current-message ref, and the updaters, reading the ref only when React
 * ran them, found no message to write to. The real chat, the real adapters
 * and the stream as the server sends it, both protocols.
 *
 * A tool call waiting for approval keeps its card when the agent-runtime
 * socket drops and retries. Each change of the socket's state re-ran the
 * history effect, which put back the conversation's saved copy — messages
 * only, no tool calls — over what was shown: the approval card vanished on
 * the first retry, about two seconds after it appeared.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@primer/react';
import { ChatBase } from '../ChatBase';
import { agentRuntimeStore } from '../../../stores/agentRuntimeStore';

// The setup's stand-in lacks what the chat's notebook parts import.
vi.mock('@jupyter/ydoc', async importOriginal => await importOriginal());
// The setup's jupyter-react stand-in has no notebook tool definitions.
vi.mock('../../../tools/adapters/agent-runtimes/notebookHooks', () => ({
  useNotebookTools: () => [],
}));

// jsdom does not scroll.
Element.prototype.scrollTo = () => {};

const ANSWER = 'Hello from the assistant. It goes on a little more.';
const WORDS = ANSWER.split(/(?<= )/);

function sse(events: object[], done = false): string {
  return (
    events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') +
    (done ? 'data: [DONE]\n\n' : '')
  );
}

const VERCEL = sse(
  [
    { type: 'start', messageId: 'm1' },
    { type: 'start-step' },
    { type: 'text-start', id: 't1' },
    ...WORDS.map(w => ({ type: 'text-delta', id: 't1', delta: w })),
    { type: 'text-end', id: 't1' },
    { type: 'finish-step' },
    { type: 'finish' },
  ],
  true,
);

const AGUI = sse([
  { type: 'RUN_STARTED', threadId: 'th', runId: 'r1' },
  { type: 'TEXT_MESSAGE_START', messageId: 'm1', role: 'assistant' },
  ...WORDS.map(w => ({
    type: 'TEXT_MESSAGE_CONTENT',
    messageId: 'm1',
    delta: w,
  })),
  { type: 'TEXT_MESSAGE_END', messageId: 'm1' },
  { type: 'RUN_FINISHED', threadId: 'th', runId: 'r1' },
]);

/** A server whose whole answer is one chunk; nothing else answers. */
function oneChunkServer(body: string): typeof fetch {
  return (async (_url: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST') {
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(body));
            controller.close();
          },
        }),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      );
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  document.body.innerHTML = '';
});

let agents = 0;

async function settle(): Promise<void> {
  // The turn is sent on a microtask and its stream read over a few more.
  for (let i = 0; i < 20; i++) {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });
  }
}

/** The chat, asked "hi" once, its server answering `body` in one chunk. */
async function mountChat(
  type: 'vercel-ai' | 'ag-ui',
  body: string,
): Promise<{ container: HTMLElement; unmount: () => Promise<void> }> {
  globalThis.fetch = oneChunkServer(body);
  // An agent of its own each time: the chat remembers prompts it has sent
  // and conversations it has shown, by agent.
  const agentId = `agent-${++agents}`;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ThemeProvider>
        <ChatBase
          protocol={{
            type,
            endpoint: `http://127.0.0.1:1/api/v1/${type}/${agentId}`,
            agentId,
          }}
          useStore={false}
          pendingPrompt="hi"
        />
      </ThemeProvider>,
    );
  });
  await settle();
  return { container, unmount: () => act(async () => root.unmount()) };
}

async function askOnce(
  type: 'vercel-ai' | 'ag-ui',
  body: string,
): Promise<string> {
  const { container, unmount } = await mountChat(type, body);
  const text = container.textContent ?? '';
  await unmount();
  return text;
}

describe('an answer that arrives in one chunk', () => {
  it('is shown whole over Vercel AI', async () => {
    expect(await askOnce('vercel-ai', VERCEL)).toContain(ANSWER);
  });

  it('is shown whole over AG-UI', async () => {
    expect(await askOnce('ag-ui', AGUI)).toContain(ANSWER);
  });
});

describe('a tool call waiting for approval', () => {
  it('keeps its card while the agent-runtime socket retries', async () => {
    const body = sse(
      [
        { type: 'start', messageId: 'm1' },
        { type: 'start-step' },
        { type: 'tool-input-start', toolCallId: 'c1', toolName: 'delete_file' },
        {
          type: 'tool-input-available',
          toolCallId: 'c1',
          toolName: 'delete_file',
          input: { path: 'a.txt' },
        },
        { type: 'tool-approval-request', toolCallId: 'c1', approvalId: 'ap1' },
        { type: 'finish-step' },
        { type: 'finish', finishReason: 'tool-calls' },
      ],
      true,
    );
    const { container, unmount } = await mountChat('vercel-ai', body);
    expect(container.textContent).toContain('Awaiting Approval');
    // The socket fails, waits, tries again, fails again.
    for (const state of ['closed', 'connecting', 'closed'] as const) {
      await act(async () => agentRuntimeStore.getState().setWsState(state));
      await settle();
    }
    expect(container.textContent).toContain('Awaiting Approval');
    await unmount();
  });
});
