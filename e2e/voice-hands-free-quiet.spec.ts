/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Hands-free, the answer heard whole (VO-12): 8 seconds of quiet, then
 * *Reply with just one word: hello.* (said by Kokoro), then 3 more
 * (`quiet-then-hello.wav`). Hands-free opens the microphone anew when the
 * agent begins answering, and Chrome's fake device then plays its file from
 * the start: the short answer is said over the quiet and ends by itself —
 * listening again, paused with Esc and resumed, the person's *Pauses before
 * I am done* (Longer) kept. The quiet stays under the 10 seconds after
 * which the speech service ends a silent stream (the page then opens
 * another, `server-hearing.test.ts`), and the capture under its 20-second
 * turn. The spoken-over case is
 * `voice-hands-free.spec.ts`; both run as it says.
 */

import { expect, test } from '@playwright/test';
import { activate, hearing, inOrder, talkWith, unreachable } from './handsFree';

test.use(hearing('quiet-then-hello.wav'));

test.describe('a conversation by voice, the answer heard whole (VO-12)', () => {
  test.skip(Boolean(unreachable), unreachable);
  test('hands-free: listening again once the answer ends by itself, paused with Esc and resumed, the person’s longer pause kept', async ({
    page,
    context,
  }) => {
    // *Pauses before I am done*: Longer (VO-69), twice the usual silence.
    const { runs, syntheses, toggle, state, states, times, turnSilenceMs } =
      await talkWith(page, context, { pause: 2 });
    // The turn's silence the composer was given: twice the usual 500 ms.
    expect(await turnSilenceMs()).toBe(1000);
    await expect
      .poll(() => runs.length, { timeout: 120_000 })
      .toBeGreaterThan(0);
    await expect(state).toHaveAttribute('data-hands-free-state', 'speaking', {
      timeout: 120_000,
    });
    // The answer ends by itself, in the quiet: it listens again.
    await expect(state).toHaveAttribute('data-hands-free-state', 'listening', {
      timeout: 120_000,
    });
    await expect(page.locator('[data-interrupted]')).toHaveCount(0);
    const seen = await states();
    // Kept in the run's output: what the person saw, in order.
    console.log(`hands-free states: ${seen.join(' → ')}; runs ${runs.length}`);
    // The moments the latency budgets are measured between (VO-52).
    console.log(`voice times: ${JSON.stringify(await times())}`);
    // Never *Listening…* while the answer's voice is being made: speech then
    // is the person speaking over it (VO-13), not a new turn.
    expect(seen.join(' ')).not.toContain('thinking listening speaking');
    expect([
      seen,
      inOrder(seen, ['listening', 'thinking', 'speaking', 'listening']),
    ]).toEqual([seen, true]);
    expect(runs.length).toBe(1);
    // Esc pauses it; *Resume listening* listens again.
    await page.keyboard.press('Escape');
    await expect(state).toHaveAttribute('data-hands-free-state', 'paused');
    await activate(page.locator('[data-hands-free-resume]').first());
    await expect(state).toHaveAttribute('data-hands-free-state', 'listening');
    await activate(toggle);
    await expect(page.locator('[data-hands-free-state]')).toHaveCount(0);
    expect(syntheses.length).toBeGreaterThan(0);
    expect(syntheses.every(status => status === 200)).toBe(true);
  });
});
