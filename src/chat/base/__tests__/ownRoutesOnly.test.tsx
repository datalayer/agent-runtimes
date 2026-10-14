/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A chat whose runtime answers only the application's own routes
 * (OwnRoutesOnly, PAP_DATALAYER's release gates, round 19) — a deployment's,
 * kept always on or launched by its hosted page, or the visitors' — opens
 * neither the monitoring stream (`/tool-approvals/ws`: an application's
 * session asks its approvals in the conversation, over its ui socket) nor
 * the sandbox's socket (`/configure/sandbox/ws`, the header's indicator).
 * Both are 404s there. Any other chat opens them as before.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@primer/react';
import { ChatBase } from '../ChatBase';
import type { ProtocolConfig } from '../../../types/protocol';

// The setup's stand-in lacks what the chat's notebook parts import.
vi.mock('@jupyter/ydoc', async importOriginal => await importOriginal());
// The setup's jupyter-react stand-in has no notebook tool definitions.
vi.mock('../../../tools/adapters/agent-runtimes/notebookHooks', () => ({
  useNotebookTools: () => [],
}));

// jsdom does not scroll.
Element.prototype.scrollTo = () => {};

const SERVER = 'http://127.0.0.1:1';

/** Every socket the chat opens, by its URL; none of them connects. */
let opened: string[] = [];
class RecordingSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = 0;
  onopen: unknown = null;
  onmessage: unknown = null;
  onclose: unknown = null;
  onerror: unknown = null;
  constructor(url: string) {
    opened.push(String(url));
  }
  send(): void {}
  close(): void {
    this.readyState = 3;
  }
  addEventListener(): void {}
  removeEventListener(): void {}
}

const realFetch = globalThis.fetch;
const realSocket = globalThis.WebSocket;
beforeEach(() => {
  opened = [];
  globalThis.WebSocket = RecordingSocket as unknown as typeof WebSocket;
  globalThis.fetch = (async () =>
    new Response('{}', { status: 404 })) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  globalThis.WebSocket = realSocket;
  document.body.innerHTML = '';
});

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });
  }
}

async function mount(extra: Partial<ProtocolConfig>) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ThemeProvider>
        <ChatBase
          protocol={{
            type: 'ag-ui',
            endpoint: `${SERVER}/api/v1/apps/agents/my-app/ag-ui/`,
            agentId: 'my-app',
            authToken: 'tok',
            configEndpoint: `${SERVER}/api/v1/configure`,
            enableConfigQuery: true,
            uiSocket: `${SERVER.replace(/^http/, 'ws')}/api/v1/apps/ui`,
            appSessions: `${SERVER}/api/v1/apps/sessions`,
            ...extra,
          }}
          useStore={false}
          showHeader
          thread={{ id: 'msg_visit', messages: [] }}
        />
      </ThemeProvider>,
    );
  });
  await settle();
  return () => act(async () => root.unmount());
}

const paths = () => opened.map(url => new URL(url).pathname);

describe('a chat held to the application’s own routes', () => {
  it('opens neither the monitoring stream nor the sandbox socket', async () => {
    const unmount = await mount({ ownRoutesOnly: true });
    expect(paths()).not.toContain('/api/v1/tool-approvals/ws');
    expect(paths()).not.toContain('/api/v1/configure/sandbox/ws');
    // Every socket it opens on the runtime is the application's own (the
    // platform's approvals, at ai-agents, are elsewhere).
    const onRuntime = opened
      .map(url => new URL(url))
      .filter(url => url.host === new URL(SERVER).host)
      .map(url => url.pathname);
    expect(onRuntime.length).toBeGreaterThan(0);
    for (const path of onRuntime) {
      expect(path).toMatch(/^\/api\/v1\/apps\//);
    }
    await unmount();
  });

  it('a Preview’s chat (its runtime answers every route) still opens both', async () => {
    const unmount = await mount({});
    expect(paths()).toContain('/api/v1/tool-approvals/ws');
    expect(paths()).toContain('/api/v1/configure/sandbox/ws');
    await unmount();
  });
});
