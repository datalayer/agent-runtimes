/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The standalone `<Chat>` on a session (VSCODE VS-24): the thread a host
 * gives is drawn — read from its runtime by uid when asked —, the thread's
 * `⋯` menu is drawn from the `loop.session.action` registry when a Reactor
 * is registered and the host lends the menu its ways, and a running tool
 * call's display reaches the host as it streams (`onToolCallUpdate`).
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildReactorFromPlugins,
  contribution,
  definePlugin,
} from '@datalayer/reactor';
import { registerReactor } from '@datalayer/reactor/react';
import { Chat } from '../Chat';
import {
  LoopSessionAction,
  type SessionActionContribution,
} from '../../apps/core';
import type { ChatProps } from '../Chat';
import type { ToolCallUpdateContext } from '../../types/chat';

// The setup's stand-in lacks what the chat's notebook parts import.
vi.mock('@jupyter/ydoc', async importOriginal => await importOriginal());
// The setup's jupyter-react stand-in has no notebook tool definitions.
vi.mock('../../tools/adapters/agent-runtimes/notebookHooks', () => ({
  useNotebookTools: () => [],
}));

// jsdom does not scroll.
Element.prototype.scrollTo = () => {};

const BASE = 'http://127.0.0.1:1';
const AGENT = 'desk';

function sse(events: object[]): string {
  return events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('');
}

const TERMINAL = (output: string) => ({
  type: 'application/vnd.datalayer.shield.terminal+json',
  version: 1,
  id: 'c3-terminal',
  text: 'Ran `make`: running',
  data: {
    terminal_id: 'term_1',
    command: 'make',
    output,
    exit_code: null,
    released: false,
  },
  actions: [],
});

/** A run whose tool call says its terminal twice while it runs. */
const STREAMED_RUN = sse([
  { type: 'RUN_STARTED', threadId: 's1', runId: 'r1' },
  { type: 'TOOL_CALL_START', toolCallId: 'c3', toolCallName: 'Run `make`' },
  { type: 'TOOL_CALL_END', toolCallId: 'c3' },
  {
    type: 'CUSTOM',
    name: 'datalayer.harness.tool_call',
    value: {
      id: 'c3',
      name: 'Run `make`',
      status: 'in_progress',
      _meta: { 'reactor.ui/display': TERMINAL('one\n') },
    },
  },
  {
    type: 'CUSTOM',
    name: 'datalayer.harness.tool_call',
    value: {
      id: 'c3',
      name: 'Run `make`',
      status: 'in_progress',
      _meta: { 'reactor.ui/display': TERMINAL('one\ntwo\n') },
    },
  },
  { type: 'RUN_FINISHED', threadId: 's1', runId: 'r1' },
]);

const SESSION_ROW = {
  uid: 's1',
  state: 'open',
  turn: 'idle',
  held: true,
  agent: AGENT,
  harness: 'claude-code',
  turns: 2,
  title: 'The refactor',
  archived: false,
  lineage: { forked_from: null, imported_from: null },
  runs_on: { kind: 'runtime', uid: '01m5' },
};

const HELD_MESSAGES = {
  messages: [
    { id: 'u1', role: 'user', content: 'Where were we?' },
    { id: 'a1', role: 'assistant', content: 'On the second chapter.' },
  ],
};

/** The runtime: the session's messages and row, every run answered with `run`. */
function runtime(run: string, asked: string[]): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const path = new URL(url).pathname;
    asked.push(`${init?.method ?? 'GET'} ${path}`);
    if (init?.method === 'POST' && path.endsWith('/ag-ui/')) {
      return new Response(run, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    }
    if (path === '/api/v1/apps/sessions/s1/messages') {
      return Response.json(HELD_MESSAGES);
    }
    if (path === '/api/v1/apps/sessions/s1') {
      return Response.json(SESSION_ROW);
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  registerReactor(null as never);
  document.body.innerHTML = '';
});

async function settle(rounds = 20): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });
  }
}

async function mountChat(props: Partial<ChatProps>, run = sse([])) {
  const asked: string[] = [];
  globalThis.fetch = runtime(run, asked);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <Chat
        protocol={{
          type: 'ag-ui',
          endpoint: `${BASE}/api/v1/apps/agents/${AGENT}/ag-ui/`,
          agentId: AGENT,
        }}
        baseUrl={BASE}
        agentId={AGENT}
        {...props}
      />,
    );
  });
  await settle();
  return {
    container,
    asked,
    unmount: () => act(async () => root.unmount()),
  };
}

/** A Reactor holding one `loop.session.action` entry. */
async function reactorWith(entry: SessionActionContribution): Promise<void> {
  const plugin = definePlugin({
    name: '@datalayer/test-plugin-session-entry',
    displayName: 'A session entry',
    description: 'One entry for the thread menu.',
    contributes: [
      contribution(LoopSessionAction, entry, { id: entry.id, order: 10 }),
    ],
  });
  const reactor = buildReactorFromPlugins([plugin as never]);
  await reactor.start();
  registerReactor(reactor);
}

describe('the standalone Chat on a session (VS-24)', () => {
  it('draws the thread it is given', async () => {
    const chat = await mountChat({
      thread: {
        id: 's1',
        messages: [
          {
            id: 'u1',
            role: 'user',
            content: 'Where were we?',
            createdAt: new Date(),
          },
          {
            id: 'a1',
            role: 'assistant',
            content: 'On the second chapter.',
            createdAt: new Date(),
          },
        ],
      },
    });
    expect(chat.container.textContent).toContain('Where were we?');
    expect(chat.container.textContent).toContain('On the second chapter.');
    await chat.unmount();
  });

  it('opens a thread from its runtime by uid, and draws what it holds', async () => {
    const chat = await mountChat({
      thread: { id: 's1', messages: [], fromRuntime: true },
    });
    expect(chat.asked).toContain('GET /api/v1/apps/sessions/s1/messages');
    expect(chat.container.textContent).toContain('On the second chapter.');
    await chat.unmount();
  });

  it('draws the thread’s menu from the registry when a Reactor is registered and the host lends it', async () => {
    const run = vi.fn();
    await reactorWith({
      id: 'test-entry',
      label: 'Say hello',
      when: session => session.uid === 's1',
      run: (_session, context) => {
        run();
        context.say('Hello was said.');
      },
    });
    const onSaid = vi.fn();
    const chat = await mountChat({
      thread: { id: 's1', messages: [] },
      sessionActions: { onSaid },
    });
    const menu = chat.container.querySelector(
      '[data-testid="session-actions"]',
    ) as HTMLButtonElement | null;
    expect(menu).not.toBeNull();
    await act(async () => {
      menu!.click();
    });
    await settle();
    expect(chat.asked).toContain('GET /api/v1/apps/sessions/s1');
    const entry = document.querySelector(
      '[data-session-action="test-entry"]',
    ) as HTMLElement | null;
    expect(entry?.textContent).toContain('Say hello');
    await act(async () => {
      entry!.click();
    });
    await settle();
    expect(run).toHaveBeenCalledTimes(1);
    expect(onSaid).toHaveBeenCalledWith('Hello was said.');
    expect(chat.container.textContent).toContain('Hello was said.');
    await chat.unmount();
  });

  it('draws no menu without a Reactor, or when the host lends none', async () => {
    const without = await mountChat({
      thread: { id: 's1', messages: [] },
      sessionActions: {},
    });
    expect(
      without.container.querySelector('[data-testid="session-actions"]'),
    ).toBeNull();
    await without.unmount();
    await reactorWith({
      id: 'test-entry',
      label: 'Say hello',
      when: () => true,
      run: () => undefined,
    });
    const unlent = await mountChat({ thread: { id: 's1', messages: [] } });
    expect(
      unlent.container.querySelector('[data-testid="session-actions"]'),
    ).toBeNull();
    await unlent.unmount();
  });

  it('hands a running tool call’s display to the host as it streams', async () => {
    const updates: ToolCallUpdateContext[] = [];
    const chat = await mountChat(
      {
        thread: { id: 's1', messages: [] },
        pendingPrompt: 'make it',
        onToolCallUpdate: context => updates.push(context),
      },
      STREAMED_RUN,
    );
    await settle();
    expect(updates.map(update => update.toolCallId)).toEqual(['c3', 'c3']);
    expect(updates[0].toolName).toBe('Run `make`');
    expect(updates.map(update => update.display)).toMatchObject([
      { kind: 'terminal', terminalId: 'term_1', output: 'one\n' },
      { kind: 'terminal', terminalId: 'term_1', output: 'one\ntwo\n' },
    ]);
    await chat.unmount();
  });
});
