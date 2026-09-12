/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The browser A2A adapter negotiates the Datalayer orchestration extension
 * against a reference worker, and degrades cleanly when it is absent
 * (ORCHESTRATOR.md, O3-03).
 *
 * The claim under test is the negotiation rule the extension's own
 * specification states: "an orchestrator sends extension fields only to a
 * worker that advertised it." So every test here starts from an agent
 * card — the one artifact this adapter actually reads before deciding
 * anything — and checks what the adapter does with a request and a
 * response relative to what that card said.
 *
 * @module protocols/__tests__/a2aOrchestrationExtension
 */

import { describe, expect, it, vi, afterEach } from 'vitest';
import { ORCHESTRATION_EXTENSION_URI } from '@datalayer/agent-teams';
import { A2AAdapter } from '../A2AAdapter';
import { createUserMessage } from '../../types/messages';

const CARD_WITH_EXTENSION = {
  name: 'reference-worker',
  url: 'http://localhost:9999',
  capabilities: {
    extensions: [
      { uri: ORCHESTRATION_EXTENSION_URI, description: 'orchestration' },
    ],
  },
};

const CARD_WITHOUT_EXTENSION = {
  name: 'plain-worker',
  url: 'http://localhost:9999',
  capabilities: { extensions: [] },
};

/** A `fetch` that answers the well-known card, then records every request it sees. */
function fetchAnswering(card: unknown): {
  requests: Array<{ url: string; headers: Record<string, string> }>;
  fetch: typeof globalThis.fetch;
} {
  const requests: Array<{ url: string; headers: Record<string, string> }> = [];
  const fetch = vi.fn((url: unknown, init?: RequestInit) => {
    const href = String(url);
    const headers = Object.fromEntries(
      new Headers(init?.headers as HeadersInit).entries(),
    );
    requests.push({ url: href, headers });
    if (href.includes('.well-known/agent-card.json')) {
      return Promise.resolve(
        new Response(JSON.stringify(card), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }
    // The message/stream POST: a plain JSON completion is enough here —
    // these tests are about what was *sent*, not the reply.
    return Promise.resolve(
      new Response(JSON.stringify({ result: { kind: 'task', id: 't1' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
  return { requests, fetch: fetch as unknown as typeof globalThis.fetch };
}

describe('A2AAdapter negotiates the orchestration extension', () => {
  let realFetch: typeof globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('activates the extension header once a worker advertises it', async () => {
    realFetch = globalThis.fetch;
    const { requests, fetch } = fetchAnswering(CARD_WITH_EXTENSION);
    globalThis.fetch = fetch;

    const adapter = new A2AAdapter({
      type: 'a2a',
      baseUrl: 'http://localhost:9999',
    } as never);
    await adapter.connect();
    expect(adapter.supportsOrchestrationExtension).toBe(true);

    await adapter.sendMessage(createUserMessage('hello'));

    const post = requests.find(r => !r.url.includes('.well-known'));
    expect(post?.headers['a2a-extensions']).toBe(ORCHESTRATION_EXTENSION_URI);
  });

  it('degrades cleanly — no header at all — when the worker never advertised it', async () => {
    realFetch = globalThis.fetch;
    const { requests, fetch } = fetchAnswering(CARD_WITHOUT_EXTENSION);
    globalThis.fetch = fetch;

    const adapter = new A2AAdapter({
      type: 'a2a',
      baseUrl: 'http://localhost:9999',
    } as never);
    await adapter.connect();
    expect(adapter.supportsOrchestrationExtension).toBe(false);

    await adapter.sendMessage(createUserMessage('hello'));

    const post = requests.find(r => !r.url.includes('.well-known'));
    expect(post?.headers['a2a-extensions']).toBeUndefined();
  });

  it('degrades cleanly when the card cannot be fetched at all', async () => {
    realFetch = globalThis.fetch;
    const fetch = vi.fn(() => Promise.reject(new Error('network down')));
    globalThis.fetch = fetch as unknown as typeof globalThis.fetch;

    const adapter = new A2AAdapter({
      type: 'a2a',
      baseUrl: 'http://localhost:9999',
    } as never);
    await adapter.connect();

    expect(adapter.supportsOrchestrationExtension).toBe(false);
  });
});
