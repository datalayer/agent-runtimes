/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A page tool's call in the chat: what the tool did is the tool's, what the
 * continuation met is the turn's.
 *
 * A visitor's eleventh run was refused (429, "You have taken today's 10
 * turns without an account"), and the chat put that refusal on the page
 * tool whose result started it: its card said it failed, and offered "Sign
 * in to use set_shop_header", though the tool had run. The tool's outcome is
 * now its own, kept before its result is sent; a refused continuation is the
 * turn's error. A tool that throws still answers, as the tool message's
 * AG-UI `error`. A thread nobody named is a session uid, never a message id.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@primer/react';
import { ChatBase } from '../ChatBase';
import type { FrontendToolDefinition } from '../../../types/tools';

// The setup's stand-in lacks what the chat's notebook parts import.
vi.mock('@jupyter/ydoc', async importOriginal => await importOriginal());
// The setup's jupyter-react stand-in has no notebook tool definitions.
vi.mock('../../../tools/adapters/agent-runtimes/notebookHooks', () => ({
  useNotebookTools: () => [],
}));

// jsdom does not scroll.
Element.prototype.scrollTo = () => {};

const ULID = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

const TURNS_TAKEN =
  "You have taken today's 10 turns without an account: sign in to keep going, or come back tomorrow.";

function sse(events: Record<string, unknown>[]): string {
  return events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('');
}

/** The run that asks the page for its header tool. */
const ASKS = sse([
  { type: 'RUN_STARTED', threadId: 't', runId: 'r1' },
  {
    type: 'TOOL_CALL_START',
    toolCallId: 'call-1',
    // The model calls it by the public name the chat hands it.
    toolCallName: 'setShopHeader',
  },
  {
    type: 'TOOL_CALL_ARGS',
    toolCallId: 'call-1',
    delta: '{"basket":{"value":2,"label":"$39.98"}}',
  },
  { type: 'TOOL_CALL_END', toolCallId: 'call-1' },
  { type: 'RUN_FINISHED', threadId: 't', runId: 'r1' },
]);

const ANSWERED = sse([
  { type: 'RUN_STARTED', threadId: 't', runId: 'r2' },
  { type: 'RUN_FINISHED', threadId: 't', runId: 'r2' },
]);

/** A server answering each run in turn, and keeping what each was sent. */
function server(
  answers: Array<() => Response>,
  sent: Array<Record<string, any>>,
): typeof fetch {
  return (async (_url: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST') {
      sent.push(JSON.parse(String(init.body)));
      const next = answers.shift();
      return next
        ? next()
        : new Response(ANSWERED, {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          });
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
}

const stream = (body: string) => () =>
  new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  document.body.innerHTML = '';
});

async function settle(): Promise<void> {
  for (let i = 0; i < 30; i++) {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });
  }
}

let agents = 0;

async function mountChat(
  handler: FrontendToolDefinition['handler'],
  answers: Array<() => Response>,
) {
  const sent: Array<Record<string, any>> = [];
  globalThis.fetch = server(answers, sent);
  const agentId = `page-tool-agent-${++agents}`;
  const header: FrontendToolDefinition = {
    name: 'set_shop_header',
    description: 'Set the basket in the title bar.',
    parameters: { type: 'object', properties: { basket: { type: 'object' } } },
    handler,
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
          frontendTools={[header]}
          pendingPrompt="Put a pan and a knife in a basket."
        />
      </ThemeProvider>,
    );
  });
  await settle();
  return { container, sent, unmount: () => act(async () => root.unmount()) };
}

const statusOf = (container: HTMLElement): string | null =>
  container
    .querySelector('[data-tool-call="setShopHeader"]')
    ?.getAttribute('data-tool-call-status') ?? null;

describe("a page tool's call in the chat", () => {
  it('keeps what the tool did when its continuation is refused', async () => {
    const chat = await mountChat(
      async () => ({ set: ['basket'] }),
      [
        stream(ASKS),
        () =>
          new Response(JSON.stringify({ detail: TURNS_TAKEN }), {
            status: 429,
            headers: { 'content-type': 'application/json' },
          }),
      ],
    );
    expect(chat.sent).toHaveLength(2);
    expect(statusOf(chat.container)).toBe('complete');
    await chat.unmount();
  });

  it('answers a tool that throws, as the tool message error', async () => {
    const chat = await mountChat(async () => {
      throw new Error('Nothing to set.');
    }, [stream(ASKS)]);
    expect(chat.sent).toHaveLength(2);
    const tools = chat.sent[1].messages.filter(
      (message: { role: string }) => message.role === 'tool',
    );
    expect(tools).toHaveLength(1);
    expect(tools[0].error).toBe('setShopHeader failed: Nothing to set.');
    expect(statusOf(chat.container)).toBe('error');
    await chat.unmount();
  });

  it('names a thread nobody named with a session uid', async () => {
    const chat = await mountChat(
      async () => ({ set: ['basket'] }),
      [stream(ASKS)],
    );
    expect(chat.sent[0].threadId).toMatch(ULID);
    expect(chat.sent[1].threadId).toBe(chat.sent[0].threadId);
    await chat.unmount();
  });
});
