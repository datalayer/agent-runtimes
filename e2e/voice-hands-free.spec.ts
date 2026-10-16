/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Hands-free and barge-in (VO-12, VO-13): a question that asks for a long
 * answer (*Tell me the history of the Eiffel Tower, in ten sentences.*, said
 * by `datalayer-speech`), a second of silence before and sixteen after, so
 * that when Chrome's fake microphone plays it again the answer is being said.
 *
 *   E2E_STATE=<signed-in storage state> E2E_VOICE_APP=<app id> \
 *     npx playwright test -c e2e/playwright.config.ts voice-hands-free.spec.ts
 *
 * Pyodide and JupyterLite are refused, and the words are heard on
 * Datalayer's servers: the Studio's page stays inside the memory a test is
 * given (2.5 GB).
 */

import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { PROBES, landingUrl } from './global-setup';

const LONG_ANSWER = fileURLToPath(
  new URL('./fixtures/eiffel-tower-history.wav', import.meta.url),
);

const unreachable =
  process.env[PROBES.landing] ||
  (!process.env.E2E_STATE
    ? 'E2E_STATE names no signed-in storage state: the Preview needs a person.'
    : !process.env.E2E_VOICE_APP
      ? 'E2E_VOICE_APP names no application to preview.'
      : '');

test.use({
  storageState: process.env.E2E_STATE || undefined,
  permissions: ['microphone'],
  launchOptions: {
    executablePath: process.env.E2E_CHROME || '/usr/bin/google-chrome',
    args: [
      // Inside the memory a test is given: no GPU process, no extensions.
      '--disable-gpu',
      '--disable-extensions',
      '--disable-dev-shm-usage',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${LONG_ANSWER}`,
    ],
  },
});

test.describe('a conversation by voice (VO-12, VO-13)', () => {
  test.skip(Boolean(unreachable), unreachable);

  test('hands-free: the turn sent by itself after the silence, the answer said and its sentence marked, and the voice stopped when spoken over', async ({
    page,
    context,
  }) => {
    const runs: string[] = [];
    const syntheses: number[] = [];
    await context.route('**/api/**', route =>
      ['PUT', 'PATCH', 'DELETE'].includes(route.request().method())
        ? route.abort()
        : route.continue(),
    );
    // The notebook's Python in the browser is not needed to talk.
    await context.route(
      /pyodide|jupyterlite|lite-service-worker|\.whl(\?|$)/,
      route => route.abort(),
    );
    // Heard on Datalayer's servers as it is said (the person's *Detect the
    // language I speak*): the browser runs only the VAD, and the Studio's
    // page stays inside the memory a test is given — with the browser's own
    // model besides, it did not (OOM at 2.5 GB, 16 October 2026).
    await context.addInitScript(() =>
      window.localStorage.setItem(
        'datalayer-voice-settings',
        JSON.stringify({ detectLanguage: true }),
      ),
    );
    page.on('request', request => {
      if (
        request.method() === 'POST' &&
        /\/(chat|runs?|messages|ag-ui|assistant)\b/.test(request.url())
      ) {
        runs.push(request.url());
      }
    });
    page.on('response', response => {
      if (response.url().includes('/speech/syntheses')) {
        syntheses.push(response.status());
      }
    });
    await page.goto(
      `${landingUrl()}/studio/apps/${process.env.E2E_VOICE_APP}?section=face&try=1`,
    );
    const card = page.locator('#app-voice');
    await expect(card).toBeVisible({ timeout: 180_000 });
    if (
      !['on', 'true'].includes(
        (await card.getAttribute('data-app-voice')) ?? '',
      )
    ) {
      await card.locator('input[type=checkbox]').click();
    }
    // The page's own choice, never saved: hands-free, answers always said.
    await card.getByLabel('Talking to it').selectOption('hands_free');
    await page.locator('text=Compose >> visible=true').first().click();
    const toggle = page.locator('[data-hands-free-toggle]').first();
    await expect(toggle).toBeEnabled({ timeout: 120_000 });
    await toggle.click();
    const yes = page.locator('[data-hands-free-consent-yes]');
    if (await yes.isVisible().catch(() => false)) {
      await yes.click();
    }
    const state = page.locator('[data-hands-free-state]').first();
    await expect(state).toHaveAttribute('data-hands-free-state', 'listening', {
      timeout: 120_000,
    });
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
    await toggle.click();
    await expect(page.locator('[data-hands-free-state]')).toHaveCount(0);
    expect(syntheses.every(status => status === 200)).toBe(true);
    expect(runs.length).toBeLessThanOrEqual(5);
  });
});
