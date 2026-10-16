/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Vercel AI's voice data parts, read by the page (VO-36): the
 * runtime streams `data-voice.settings` after the start and `data-voice.say`
 * beside `say_aloud`'s output; the adapter hands each to the chat as an
 * activity, as AG-UI's custom events are, and the chat says the line.
 *
 * @module protocols/__tests__/vercelVoiceParts
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { VercelAIAdapter } from '../VercelAIAdapter';
import { createUserMessage } from '../../types/messages';
import type { ProtocolEvent } from '../../types/protocol';
import { lineToSay } from '../../voice/sayAloud';

const sse = (events: object[]): string =>
  events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') +
  'data: [DONE]\n\n';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('Vercel AI voice parts', () => {
  it('are activities the chat reads: the line to say, and the voice it is said in', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          sse([
            { type: 'start', messageId: 'm1' },
            {
              type: 'data-voice.settings',
              data: { voice: 'kokoro-af-heart', language: 'en-US' },
            },
            {
              type: 'data-voice.say',
              data: {
                text: 'One   moment, I am looking that up.',
                voice: 'kokoro-af-heart',
                language: 'en-US',
              },
            },
            { type: 'text-start', id: 't1' },
            { type: 'text-delta', id: 't1', delta: 'It is sunny.' },
            { type: 'text-end', id: 't1' },
            { type: 'finish', finishReason: 'stop' },
          ]),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        ),
    ) as unknown as typeof fetch;
    const adapter = new VercelAIAdapter({
      protocol: 'vercel-ai',
      baseUrl: 'http://127.0.0.1:1/api/v1/vercel-ai/a',
    });
    const events: ProtocolEvent[] = [];
    adapter.subscribe(event => events.push(event));
    await adapter.sendMessage(createUserMessage('Weather?'));
    const activities = events
      .filter(event => event.type === 'activity')
      .map(event => event.activity!);
    expect(activities.map(activity => activity.type)).toEqual([
      'data-voice.settings',
      'data-voice.say',
    ]);
    expect(activities.map(lineToSay)).toEqual([
      undefined,
      'One moment, I am looking that up.',
    ]);
    // The written answer is still the answer.
    expect(
      events.some(
        event =>
          event.type === 'message' &&
          JSON.stringify(event).includes('It is sunny.'),
      ),
    ).toBe(true);
  });
});
