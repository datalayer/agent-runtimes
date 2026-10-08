/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Feedback from the people who use an application (LOOP V-18): offered only
 * where its record keeps it, sent to the runtime under the conversation's
 * thread, and a refusal said in the runtime's own sentence.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { APP_CATALOGUE } from '../../specs/apps';
import { LoopPromptPanel } from '../core';
import {
  FEEDBACK_COMMENT_LIMIT,
  FEEDBACK_WORDS,
  feedbackEndpoint,
  feedbackProblems,
  keepsFeedback,
  sendFeedback,
} from '../apps/feedback';
import { defineAppFeedbackPlugin } from '../apps/AppFeedback';
import { createTurnFeed } from '../plugins/chat/turnState';

const answered = (status: number, body: unknown) =>
  vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  );

describe('feedback on an application’s answers', () => {
  it('is offered only where the application’s record keeps it', () => {
    expect(keepsFeedback(APP_CATALOGUE['customer-interview'])).toBe(true);
    expect(keepsFeedback(APP_CATALOGUE['data-quality'])).toBe(false);
  });

  it('is sent to the runtime, under the conversation’s thread, with the token', async () => {
    const fetcher = answered(200, { kept: true, summary: 'Liked it: Clear.' });
    const says = await sendFeedback(
      { session: 'thread-1', liked: true, comment: '  Clear. ' },
      { agentBaseUrl: 'https://pod.example/', token: 't0k', fetcher },
    );
    expect(says).toBe('Liked it: Clear.');
    const [url, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://pod.example/api/v1/apps/feedback');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer t0k' });
    expect(JSON.parse(String(init.body))).toEqual({
      session: 'thread-1',
      liked: true,
      comment: 'Clear.',
    });
  });

  it('says the runtime’s refusal, and refuses what cannot be sent before sending it', async () => {
    const refused = answered(409, {
      detail: 'Desk keeps no feedback: its record does not name it.',
    });
    await expect(
      sendFeedback(
        { session: 'thread-1', liked: false, comment: '' },
        { agentBaseUrl: 'http://localhost:8765', fetcher: refused },
      ),
    ).rejects.toThrow(
      'The feedback was not kept: Desk keeps no feedback: its record does not name it.',
    );
    const never = answered(200, {});
    await expect(
      sendFeedback(
        {
          session: '',
          liked: true,
          comment: 'x'.repeat(FEEDBACK_COMMENT_LIMIT + 1),
        },
        { agentBaseUrl: 'http://localhost:8765', fetcher: never },
      ),
    ).rejects.toThrow(FEEDBACK_WORDS.noSession);
    expect(never).not.toHaveBeenCalled();
    expect(
      feedbackProblems({
        session: 's',
        liked: true,
        comment: 'x'.repeat(FEEDBACK_COMMENT_LIMIT + 1),
      }),
    ).toEqual([FEEDBACK_WORDS.tooLong]);
    expect(feedbackEndpoint('http://a//')).toBe(
      'http://a/api/v1/apps/feedback',
    );
  });

  it('names its thumbs, on the buttons themselves, and says which is pressed (P-24)', () => {
    expect(FEEDBACK_WORDS.liked).toBe('This answer was useful');
    expect(FEEDBACK_WORDS.disliked).toBe('This answer was not useful');
    const strip = readFileSync(
      join(__dirname, '..', 'apps', 'AppFeedback.tsx'),
      'utf8',
    );
    expect(strip).toMatch(
      /aria-label=\{FEEDBACK_WORDS\.liked\}\s+aria-pressed=\{choice === true\}\s+unsafeDisableTooltip/,
    );
    expect(strip).toMatch(
      /aria-label=\{FEEDBACK_WORDS\.disliked\}\s+aria-pressed=\{choice === false\}\s+unsafeDisableTooltip/,
    );
    // Sent to the runtime that answered, never to a stand-in server.
    expect(strip).toContain(
      'agentServerOf(workspace.sandbox, workspace.serverUrl)',
    );
    expect(strip).not.toContain('workspace.serverUrl ||');
  });

  it('is a strip above the prompt, one plugin per application', () => {
    const plugin = defineAppFeedbackPlugin(APP_CATALOGUE['customer-interview']);
    const panels = (plugin.contributes ?? []).filter(
      (item: { point?: unknown }) => item.point === LoopPromptPanel,
    ) as Array<{ value: Record<string, unknown> }>;
    expect(panels).toHaveLength(1);
    expect(panels[0].value).toMatchObject({
      id: 'app-feedback',
      placement: 'above',
    });
  });

  it('knows the conversation a turn went to, from the chat', () => {
    const feed = createTurnFeed();
    feed.begin('hello', 'thread-9');
    expect(feed.turn.value.thread).toBe('thread-9');
    feed.begin('again');
    expect(feed.turn.value.thread).toBeUndefined();
  });
});
