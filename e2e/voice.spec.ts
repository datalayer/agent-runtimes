/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Voice, in the browser, driven (VO-53): Chrome plays a fixture into
 * its microphone (`--use-file-for-fake-audio-capture`), and the composer of
 * an application's Preview on the landing hears it — the browser's models
 * read from Datalayer's CDN with its own CORS header (VO-49), the words
 * written in the box as they are heard and greyed until final (VO-11), the
 * microphone stopping by itself after the silence (VO-10), nothing sent; the
 * person's voice menu beside it (VO-30). With *Detect the language I speak*
 * chosen, the same words are heard on Datalayer's servers instead (VO-34,
 * VO-14): asked apart, the recording sent to the speech service, the
 * language found there. Hands-free and barge-in are
 * `voice-hands-free.spec.ts`, on a fixture of their own.
 *
 *   E2E_STATE=<signed-in storage state> E2E_VOICE_APP=<app id> \
 *     npx playwright test -c e2e/playwright.config.ts voice.spec.ts
 *
 * The fixture (`fixtures/weather-in-paris.wav`, 16 kHz mono) is *What is the
 * weather like in Paris today?* said by `datalayer-speech` (Kokoro, Apache
 * 2.0), a second of silence before and six after. Writes are refused in the
 * browser: the Preview's voice is turned on for the page only.
 *
 * Without a signed-in state or an application, or without the landing, the
 * cases skip with a sentence.
 */

import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { PROBES, landingUrl } from './global-setup';

const FIXTURE = fileURLToPath(
  new URL('./fixtures/weather-in-paris.wav', import.meta.url),
);
const MODELS = 'https://models-speech.datalayer.tech';

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
      `--use-file-for-fake-audio-capture=${FIXTURE}`,
    ],
  },
});

test.describe('voice in the composer (VO-53)', () => {
  test.skip(Boolean(unreachable), unreachable);

  test('hears the fixture, greys the words until final, stops by itself and sends nothing', async ({
    page,
    context,
  }) => {
    const sent: string[] = [];
    const models: { status: number; cors: string | undefined }[] = [];
    // Nothing of the application is changed: its voice is turned on here only.
    await context.route('**/api/**', route =>
      ['PUT', 'PATCH', 'DELETE'].includes(route.request().method())
        ? route.abort()
        : route.continue(),
    );
    // The notebook's Python in the browser is not needed to talk, and the
    // Studio's page stays inside the memory a test is given.
    await context.route(
      /pyodide|jupyterlite|lite-service-worker|\.whl(\?|$)/,
      route => route.abort(),
    );
    page.on('request', request => {
      if (
        request.method() === 'POST' &&
        /\/(chat|runs?|messages)\b/.test(request.url())
      ) {
        sent.push(request.url());
      }
    });
    page.on('response', response => {
      if (response.url().startsWith(MODELS)) {
        models.push({
          status: response.status(),
          cors: response.headers()['access-control-allow-origin'],
        });
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
    await page.locator('text=Compose >> visible=true').first().click();
    const mic = page.locator('[data-voice-mic]').first();
    await expect(mic).toBeEnabled({ timeout: 120_000 });
    // The person's menu is beside it (VO-30).
    await expect(page.locator('[data-voice-menu]').first()).toBeVisible();

    await mic.click();
    const yes = page.locator('[data-voice-consent-yes]');
    if (await yes.isVisible().catch(() => false)) {
      await yes.click();
    }
    const box = page.locator('[contenteditable=true]').first();
    // Greyed while heard (VO-11).
    await expect(page.locator('[data-voice-interim]')).toHaveCount(1, {
      timeout: 120_000,
    });
    await expect(box).toHaveCSS('font-style', 'italic');
    // Stopped by the silence, the sentence final and plain, unsent.
    await expect(page.locator('[data-voice-input="idle"]')).toHaveCount(1, {
      timeout: 60_000,
    });
    await expect(box).toHaveText(/weather like in/i);
    await expect(page.locator('[data-voice-interim]')).toHaveCount(0);
    await expect(box).toHaveCSS('font-style', 'normal');
    expect(sent).toEqual([]);
    // The models came from Datalayer's CDN, readable from this origin (VO-49).
    expect(models.length).toBeGreaterThan(0);
    for (const model of models) {
      expect(model.status).toBeLessThan(300);
      expect(model.cors).toBe('*');
    }
  });

  test('with detection chosen, hears the fixture on Datalayer’s servers and finds its language (VO-34, VO-14)', async ({
    page,
    context,
  }) => {
    // Heard as it is said (VO-11): the stream's final words, and the sound
    // sent — the speech only, the silence around it stays in the browser.
    const finals: { language?: string; text?: string }[] = [];
    // The words heard so far, while the person speaks (VO-11).
    const partials: string[] = [];
    let soundBytes = 0;
    await context.route('**/api/**', route =>
      ['PUT', 'PATCH', 'DELETE'].includes(route.request().method())
        ? route.abort()
        : route.continue(),
    );
    // The notebook's Python in the browser is not needed to talk, and the
    // Studio's page stays inside the memory a test is given.
    await context.route(
      /pyodide|jupyterlite|lite-service-worker|\.whl(\?|$)/,
      route => route.abort(),
    );
    // The person's choice, as the voice menu keeps it.
    await context.addInitScript(() =>
      window.localStorage.setItem(
        'datalayer-voice-settings',
        JSON.stringify({ detectLanguage: true }),
      ),
    );
    page.on('websocket', socket => {
      if (!socket.url().includes('/speech/transcriptions/stream')) {
        return;
      }
      socket.on('framesent', frame => {
        if (typeof frame.payload !== 'string') {
          soundBytes += frame.payload.length;
        }
      });
      socket.on('framereceived', frame => {
        const message =
          typeof frame.payload === 'string' ? JSON.parse(frame.payload) : {};
        if (message.type === 'final') {
          finals.push({ language: message.language, text: message.text });
        } else if (message.type === 'partial') {
          partials.push(String(message.text ?? ''));
        }
      });
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
    await page.locator('text=Compose >> visible=true').first().click();
    const mic = page.locator('[data-voice-mic]').first();
    await expect(mic).toBeEnabled({ timeout: 120_000 });
    await mic.click();
    // Asked apart from the device's: the sound goes to Datalayer's servers.
    await expect(page.getByText('sent to Datalayer’s servers')).toBeVisible();
    await page.locator('[data-voice-consent-yes]').click();
    const box = page.locator('[contenteditable=true]').first();
    await expect(page.locator('[data-voice-input="idle"]')).toHaveCount(1, {
      timeout: 180_000,
    });
    await expect(box).toHaveText(/weather like in/i, { timeout: 120_000 });
    expect(finals).toHaveLength(1);
    expect(finals[0].language).toBe('en');
    expect(finals[0].text).toMatch(/weather like in/i);
    expect(soundBytes).toBeGreaterThan(0);
    test.info().annotations.push({
      type: 'partial words',
      description: JSON.stringify(partials),
    });
  });
});
