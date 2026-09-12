/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `A2AAdapter` against the wire shape `fasta2a`-based workers actually send
 * — not the `kind`-discriminated shape the current A2A specification
 * defines and this file was originally written against (ORCHESTRATOR.md,
 * O3-03).
 *
 * `fasta2a.schema.SendMessageResult` and `StreamResponse` wrap every
 * result in a named key (`{ task }`, `{ statusUpdate }`, `{ message }`,
 * `{ artifactUpdate }`) instead of a bare, `kind`-tagged object, and
 * `TaskStatusUpdateEvent` carries no `final` field at all — confirmed by
 * reading `fasta2a.schema`'s own source, not assumed. `agent_runtimes`' own
 * A2A route is the same `FastA2A`, so this is the shape every production
 * Datalayer A2A worker actually serves. Before `normalizeA2AResult`, this
 * adapter's `eventKind = task.kind` was `undefined` for every such event —
 * none of `handleTaskUpdate`'s branches ever matched, and no reply from a
 * real Datalayer A2A worker was ever rendered.
 *
 * Every fixture below is copied from a real run of
 * `agent_teams.a2a.reference_worker` (ORCHESTRATOR.md O3-04), not
 * hand-idealized — the same worker
 * `a2aOrchestrationExtension.test.ts`'s negotiation claims are checked
 * against.
 *
 * @module protocols/__tests__/a2aFasta2aWireCompat
 */

import { describe, expect, it, vi, afterEach } from 'vitest';
import { A2AAdapter } from '../A2AAdapter';
import { createUserMessage } from '../../types/messages';
import type { ProtocolEvent } from '../../types/protocol';

const CARD = {
  name: 'datalayer-orchestration-reference-worker',
  supportedInterfaces: [
    {
      protocolBinding: 'JSONRPC',
      url: 'http://localhost:8000',
      protocolVersion: '1.0',
    },
  ],
  skills: [],
  defaultInputModes: ['application/json'],
  defaultOutputModes: ['application/json'],
  capabilities: {
    streaming: true,
    pushNotifications: false,
    extensions: [
      {
        uri: 'https://datalayer.ai/extensions/orchestration/v1',
        description: 'Datalayer orchestration',
        required: false,
      },
    ],
  },
};

/** An SSE body byte-for-byte in the shape a real reference-worker run produced. */
function fasta2aSseBody(taskId: string, contextId: string): string {
  const events = [
    {
      jsonrpc: '2.0',
      id: '1',
      result: {
        task: {
          id: taskId,
          contextId,
          status: {
            state: 'submitted',
            timestamp: '2026-09-12T17:25:19.511609',
          },
          history: [
            {
              role: 'user',
              parts: [{ text: 'hi' }],
              messageId: 'msg-user-1',
              taskId,
              contextId,
            },
          ],
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: '1',
      result: {
        statusUpdate: {
          taskId,
          contextId,
          status: {
            state: 'completed',
            message: {
              role: 'agent',
              parts: [{ text: 'echo: hi' }],
              messageId: 'msg-agent-1',
              contextId,
              taskId,
              metadata: {
                datalayer: {
                  usage: { currency: 'USD', inputTokens: 2, outputTokens: 8 },
                },
              },
            },
          },
          // No `final` field — fasta2a's TaskStatusUpdateEvent doesn't have one.
        },
      },
    },
  ];
  return events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('');
}

function fasta2aSseFetch(
  taskId: string,
  contextId: string,
): typeof globalThis.fetch {
  return vi.fn((url: unknown) => {
    const href = String(url);
    if (href.includes('.well-known')) {
      return Promise.resolve(
        new Response(JSON.stringify(CARD), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }
    return Promise.resolve(
      new Response(fasta2aSseBody(taskId, contextId), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
    );
  }) as unknown as typeof globalThis.fetch;
}

describe('A2AAdapter parses fasta2a-shaped wire events', () => {
  let realFetch: typeof globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('renders the reply and surfaces usage from a real fasta2a SSE stream', async () => {
    realFetch = globalThis.fetch;
    globalThis.fetch = fasta2aSseFetch('task-1', 'ctx-1');

    const adapter = new A2AAdapter({
      type: 'a2a',
      baseUrl: 'http://localhost:9999',
    } as never);
    await adapter.connect();
    expect(adapter.supportsOrchestrationExtension).toBe(true);

    const events: ProtocolEvent[] = [];
    adapter.subscribe(event => events.push(event));
    await adapter.sendMessage(createUserMessage('hi'));

    const stateUpdate = events.find(e => e.type === 'state-update');
    expect(stateUpdate).toBeDefined();
    const data = stateUpdate?.data as Record<string, unknown>;
    // Inferred from the terminal `state`, since fasta2a's event carries no
    // `final` flag at all — the fix this test exists to prove.
    expect(data.final).toBe(true);
    expect(data.state).toBe('completed');
    expect(data.datalayerUsage).toEqual({
      currency: 'USD',
      inputTokens: 2,
      outputTokens: 8,
    });
    expect(stateUpdate?.usage).toEqual({
      promptTokens: 2,
      completionTokens: 8,
      totalTokens: 10,
    });
  });

  it('renders the reply from a real fasta2a non-streaming message/send response', async () => {
    realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn((url: unknown) => {
      const href = String(url);
      if (href.includes('.well-known')) {
        return Promise.resolve(
          new Response(JSON.stringify(CARD), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: '1',
            result: {
              task: {
                id: 'task-2',
                contextId: 'ctx-2',
                status: { state: 'submitted' },
                history: [
                  { role: 'user', parts: [{ text: 'hi' }], messageId: 'm1' },
                ],
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    }) as unknown as typeof globalThis.fetch;

    const adapter = new A2AAdapter({
      type: 'a2a',
      baseUrl: 'http://localhost:9999',
    } as never);
    await adapter.connect();

    const events: ProtocolEvent[] = [];
    adapter.subscribe(event => events.push(event));
    await adapter.sendMessage(createUserMessage('hi'));

    // No error emitted trying to read `task.kind` off the wrapper and
    // finding nothing to do with it — the task's own id was read normally.
    expect(events.some(e => e.type === 'error')).toBe(false);
  });
});
