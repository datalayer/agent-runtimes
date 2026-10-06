/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A conversation the chat goes on with (LOOP D-13): an embedded
 * application's session, reattached after its page reloaded. Its messages
 * are drawn, the next message is sent on its thread with them, and the
 * runtime's snapshot — its agent's, every session's — never replaces them.
 * A new thread is told to its host when a message is first sent on it.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@primer/react';
import { ChatBase } from '../ChatBase';
import { agentRuntimeStore } from '../../../stores/agentRuntimeStore';
import type { ChatThread } from '../../../types/chat';

// The setup's stand-in lacks what the chat's notebook parts import.
vi.mock('@jupyter/ydoc', async importOriginal => await importOriginal());
// The setup's jupyter-react stand-in has no notebook tool definitions.
vi.mock('../../../tools/adapters/agent-runtimes/notebookHooks', () => ({
  useNotebookTools: () => [],
}));

// jsdom does not scroll.
Element.prototype.scrollTo = () => {};

const ANSWERED = [
  'data: ' +
    JSON.stringify({ type: 'RUN_STARTED', threadId: 't', runId: 'r1' }) +
    '\n\n',
  'data: ' +
    JSON.stringify({ type: 'RUN_FINISHED', threadId: 't', runId: 'r1' }) +
    '\n\n',
].join('');

/** A server that answers every run at once, and keeps what each was sent. */
function recordingServer(sent: Array<Record<string, any>>): typeof fetch {
  return (async (_url: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST') {
      sent.push(JSON.parse(String(init.body)));
      return new Response(ANSWERED, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
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

async function mountChat(thread: ChatThread, pendingPrompt?: string) {
  const sent: Array<Record<string, any>> = [];
  globalThis.fetch = recordingServer(sent);
  const agentId = `thread-agent-${++agents}`;
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
          {...(pendingPrompt ? { pendingPrompt } : {})}
        />
      </ThemeProvider>,
    );
  });
  await settle();
  return {
    agentId,
    container,
    sent,
    unmount: () => act(async () => root.unmount()),
  };
}

const KEPT: ChatThread['messages'] = [
  { id: 'u1', role: 'user', content: 'Where were we?', createdAt: new Date() },
  {
    id: 'a1',
    role: 'assistant',
    content: 'On the second chapter.',
    createdAt: new Date(),
  },
];

describe('a thread given to the chat', () => {
  it('draws what it holds', async () => {
    const chat = await mountChat({ id: 'msg_kept', messages: KEPT });
    expect(chat.container.textContent).toContain('Where were we?');
    expect(chat.container.textContent).toContain('On the second chapter.');
    await chat.unmount();
  });

  it('is not replaced by the runtime’s snapshot', async () => {
    const chat = await mountChat({ id: 'msg_kept', messages: KEPT });
    await act(async () => {
      agentRuntimeStore.setState({
        fullContext: {
          messages: [{ role: 'user', content: 'Another visitor asked this' }],
        },
      });
      agentRuntimeStore.getState().setWsState('connected');
    });
    await settle();
    expect(chat.container.textContent).toContain('On the second chapter.');
    expect(chat.container.textContent).not.toContain(
      'Another visitor asked this',
    );
    await act(async () => {
      agentRuntimeStore.getState().setWsState('closed');
      agentRuntimeStore.setState({ fullContext: null });
    });
    await chat.unmount();
  });

  it('is gone on with: the next message sent on its thread, with what it holds', async () => {
    const onStarted = vi.fn();
    const chat = await mountChat(
      { id: 'msg_kept', messages: KEPT, onStarted },
      'And then?',
    );
    expect(chat.sent).toHaveLength(1);
    expect(chat.sent[0].threadId).toBe('msg_kept');
    expect(
      chat.sent[0].messages.map((m: { content: string }) => m.content),
    ).toEqual(['Where were we?', 'On the second chapter.', 'And then?']);
    // Already kept by its host: not told again.
    expect(onStarted).not.toHaveBeenCalled();
    await chat.unmount();
  });

  it('when new, is told to its host as the first message is sent on it', async () => {
    const onStarted = vi.fn();
    const chat = await mountChat(
      { id: 'msg_new', messages: [], onStarted },
      'Hello',
    );
    expect(chat.sent[0].threadId).toBe('msg_new');
    expect(onStarted).toHaveBeenCalledTimes(1);
    expect(onStarted).toHaveBeenCalledWith('msg_new');
    await chat.unmount();
  });
});
