/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Threads (LOOP P-24): a thread opened from a person's history is read from
 * the runtime — held there, else resumed from its record — and feedback
 * names the answer it is about.
 */

import { describe, expect, it, vi } from 'vitest';
import { answerIdOf, sendFeedback } from '../apps/feedback';
import { openThread, snapshotOfStream, THREAD_WORDS } from '../apps/threads';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const stream = (...events: unknown[]) =>
  new Response(
    events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  );

const SAID = [
  { id: 'm1', role: 'user', content: 'How do I export?' },
  { id: 'm2', role: 'assistant', content: 'From the File menu.' },
];

describe('a thread opened from the history', () => {
  it('is read from the runtime that holds it', async () => {
    const fetcher = vi.fn(async () =>
      json(200, { uid: 's-1', messages: SAID }),
    );
    const messages = await openThread({
      agentBaseUrl: 'https://pod.example/',
      agentId: 'desk',
      uid: 's-1',
      token: 't0k',
      fetcher,
    });
    expect(messages.map(m => [m.id, m.role, m.content])).toEqual([
      ['m1', 'user', 'How do I export?'],
      ['m2', 'assistant', 'From the File menu.'],
    ]);
    const [url, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://pod.example/api/v1/apps/sessions/s-1/messages');
    expect(init.headers).toEqual({ Authorization: 'Bearer t0k' });
  });

  it('is resumed from its record when the runtime no longer holds it', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        json(404, { detail: 'No session s-1 is held here.' }),
      )
      .mockResolvedValueOnce(
        stream(
          { type: 'CUSTOM', name: 'loop.session', value: { uid: 's-1' } },
          { type: 'MESSAGES_SNAPSHOT', messages: SAID },
          { type: 'RUN_FINISHED' },
        ),
      );
    const messages = await openThread({
      agentBaseUrl: 'https://pod.example',
      agentId: 'desk',
      uid: 's-1',
      fetcher,
    });
    expect(messages).toHaveLength(2);
    const [url, init] = fetcher.mock.calls[1] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://pod.example/api/v1/apps/sessions/s-1/resume');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ agent: 'desk' });
  });

  it('says why it could not be opened', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json(404, {}))
      .mockResolvedValueOnce(
        json(409, { detail: 'Desk keeps no conversations in its record.' }),
      );
    await expect(
      openThread({
        agentBaseUrl: 'https://pod.example',
        agentId: 'desk',
        uid: 's-1',
        fetcher,
      }),
    ).rejects.toThrow('Desk keeps no conversations in its record.');
    expect(THREAD_WORDS.notOpened('no.')).toMatch(/this is a new one: no\.$/);
  });

  it('reads the last snapshot of a stream, and nothing from one without', () => {
    expect(
      snapshotOfStream('data: {"type":"RUN_STARTED"}\n\n'),
    ).toBeUndefined();
    expect(
      snapshotOfStream(
        'data: {"type":"MESSAGES_SNAPSHOT","messages":[1]}\n\ndata: not json\n\n',
      ),
    ).toEqual([1]);
  });
});

describe('feedback on an answer', () => {
  it('names the answer by its place in the conversation', async () => {
    expect(answerIdOf(0)).toBeUndefined();
    expect(answerIdOf(3)).toBe('answer-3');
    const fetcher = vi.fn(async () =>
      json(200, { kept: true, summary: 'Did not like it', heard: true }),
    );
    await sendFeedback(
      { session: 's-1', liked: false, comment: '', message: 'answer-3' },
      { agentBaseUrl: 'https://pod.example', fetcher },
    );
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      session: 's-1',
      liked: false,
      comment: '',
      message: 'answer-3',
    });
  });
});
