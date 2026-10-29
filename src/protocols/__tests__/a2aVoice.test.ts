/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A2A's voice, read by the page (VO-36): the runtime says the
 * agent's voice in its first working status message's `metadata.voice.settings`
 * and each `say_aloud` line in `metadata.voice.say`; the adapter hands each to
 * the chat as an activity, as AG-UI's custom events are, and the chat says the
 * line.
 *
 * @module protocols/__tests__/a2aVoice
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { A2AAdapter } from '../A2AAdapter';
import { createUserMessage } from '../../types/messages';
import type { ProtocolEvent } from '../../types/protocol';
import { lineToSay } from '../../voice/sayAloud';

const VOICE = { voice: 'kokoro-af-heart', language: 'en-US' };

const status = (state: string, message?: object) => ({
  jsonrpc: '2.0',
  id: '1',
  result: {
    kind: 'status-update',
    taskId: 't1',
    contextId: 'c1',
    status: { state, ...(message && { message }) },
    final: state === 'completed',
  },
});

const agentMessage = (text: string | null, metadata?: object) => ({
  role: 'agent',
  kind: 'message',
  messageId: 'm' + Math.random(),
  parts: text ? [{ kind: 'text', text }] : [],
  ...(metadata && { metadata }),
});

const sse = (events: object[]): string =>
  events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('');

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('A2A voice metadata', () => {
  it('is activities the chat reads: the voice, then the line to say', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          sse([
            status(
              'working',
              agentMessage(null, { voice: { settings: VOICE } }),
            ),
            status(
              'working',
              agentMessage('One moment.', {
                voice: { say: { text: 'One   moment.', ...VOICE } },
              }),
            ),
            status('working', agentMessage('A plain working message.')),
            status('completed', agentMessage('It is sunny.')),
          ]),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        ),
    ) as unknown as typeof fetch;
    const adapter = new A2AAdapter({
      type: 'a2a',
      baseUrl: 'http://127.0.0.1:1/api/v1/a2a/agents/a',
    } as never);
    const events: ProtocolEvent[] = [];
    adapter.subscribe(event => events.push(event));
    await adapter.sendMessage(createUserMessage('Weather?'));
    const activities = events
      .filter(event => event.type === 'activity')
      .map(event => event.activity!);
    expect(activities.map(activity => activity.type)).toEqual([
      'voice.settings',
      'voice.say',
    ]);
    expect(activities[0].data).toEqual(VOICE);
    expect(activities.map(lineToSay)).toEqual([undefined, 'One moment.']);
  });
});
