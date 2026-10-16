/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Hands-free and barge-in (VO-12, VO-13), on two fixtures Chrome's fake
 * microphone plays over and over, one a file (`launchOptions` are a file's):
 *
 * - `eiffel-tower-history.wav` — a question that asks for a long answer
 *   (*Tell me the history of the Eiffel Tower, in ten sentences.*, said by
 *   `datalayer-speech`), a second of silence before and sixteen after, so
 *   that when it plays again the answer is being said: barge-in.
 * - `quiet-then-hello.wav` — 8 seconds of quiet, then *Reply with just
 *   one word: hello.*, so that the answer ends by itself: listening again,
 *   then paused with Esc and resumed, with the person's longer pause
 *   (`voice-hands-free-quiet.spec.ts`).
 *
 * Every state the composer shows is recorded as it changes, so that a state
 * shown for a moment (*Thinking…*) is seen too.
 *
 *   E2E_STATE=<signed-in storage state> E2E_VOICE_APP=<app id> \
 *     npx playwright test -c e2e/playwright.config.ts voice-hands-free.spec.ts
 *
 * Pyodide and JupyterLite are refused, and the words are heard on
 * Datalayer's servers: the Studio's page stays inside the memory a test is
 * given (2.5 GB).
 */

import { expect, test } from '@playwright/test';
import { hearing, inOrder, talkWith, unreachable } from './handsFree';

test.use(hearing('eiffel-tower-history.wav'));

test.describe('a conversation by voice, spoken over (VO-12, VO-13)', () => {
  test.skip(Boolean(unreachable), unreachable);
  test('hands-free: the turn sent by itself after the silence, Thinking then Speaking with its sentence marked, and the voice stopped when spoken over', async ({
    page,
    context,
  }) => {
    const { runs, syntheses, toggle, state, states } = await talkWith(
      page,
      context,
      {},
    );
    // The question is said, then silence: the turn goes by itself (VO-12).
    await expect
      .poll(() => runs.length, { timeout: 120_000 })
      .toBeGreaterThan(0);
    // The answer is said as it is written (hands-free implies always), and
    // the sentence being said is marked in the conversation (VO-65).
    await expect(state).toHaveAttribute('data-hands-free-state', 'speaking', {
      timeout: 120_000,
    });
    expect(syntheses.length).toBeGreaterThan(0);
    const saying = page.locator('[data-voice-saying]').first();
    await expect(saying).toHaveAttribute('aria-current', 'true');
    // The question plays again while the answer is said: barge-in stops the
    // voice, and the answer is marked interrupted (VO-13).
    await expect(page.locator('[data-interrupted]').first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(state).not.toHaveAttribute(
      'data-hands-free-state',
      'speaking',
    );
    await expect(page.locator('[data-voice-saying]')).toHaveCount(0);
    // Listening, thinking while it answers, speaking, then spoken over.
    const seen = await states();
    // Kept in the run's output: what the person saw, in order.
    console.log(`hands-free states: ${seen.join(' → ')}; runs ${runs.length}`);
    // Never *Listening…* while the answer's voice is being made: speech then
    // is the person speaking over it (VO-13), not a new turn.
    expect(seen.join(' ')).not.toContain('thinking listening speaking');
    expect([seen, inOrder(seen, ['listening', 'thinking', 'speaking'])]).toEqual(
      [seen, true],
    );
    await toggle.click();
    await expect(page.locator('[data-hands-free-state]')).toHaveCount(0);
    expect(syntheses.every(status => status === 200)).toBe(true);
    expect(runs.length).toBeLessThanOrEqual(5);
  });
});
