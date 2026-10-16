/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What the hands-free cases share (VO-12, VO-13): the browser with Chrome's
 * fake microphone playing a fixture, and the application's Preview with
 * hands-free turned on, every state it shows recorded as it changes.
 *
 * @module e2e/handsFree
 */

import { fileURLToPath } from 'node:url';
import { expect, type BrowserContext, type Page } from '@playwright/test';
import { PROBES, landingUrl } from './global-setup';

export const fixture = (name: string): string =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

export const unreachable =
  process.env[PROBES.landing] ||
  (!process.env.E2E_STATE
    ? 'E2E_STATE names no signed-in storage state: the Preview needs a person.'
    : !process.env.E2E_VOICE_APP
      ? 'E2E_VOICE_APP names no application to preview.'
      : '');

/** The browser, its fake microphone playing `wav` over and over. */
export const hearing = (wav: string) => ({
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
      `--use-file-for-fake-audio-capture=${fixture(wav)}`,
    ],
  },
});

export interface Talk {
  /** The runs the page started: one per turn sent. */
  runs: string[];
  /** The status of each answer said by the speech service. */
  syntheses: number[];
  /** Every state the composer showed, in order, each once per change. */
  states: () => Promise<string[]>;
  /** The toggle: *Talk with it*. */
  toggle: ReturnType<Page['locator']>;
  /** The state shown: *Listening…*, *Thinking…*, *Speaking…*, *Paused*. */
  state: ReturnType<Page['locator']>;
  /** The silence that ends a turn, as the hands-free composer was given it (ms). */
  turnSilenceMs: () => Promise<number | undefined>;
}

/**
 * The application's Preview with hands-free chosen and turned on, its
 * consent given; `settings` are the person's voice settings.
 */
export async function talkWith(
  page: Page,
  context: BrowserContext,
  settings: Record<string, unknown>,
): Promise<Talk> {
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
  await context.addInitScript(
    kept =>
      window.localStorage.setItem(
        'datalayer-voice-settings',
        JSON.stringify(kept),
      ),
    { detectLanguage: true, ...settings },
  );
  // Every state shown, as it changes: a state shown for a moment is seen.
  await context.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __handsFree: string[] }).__handsFree = seen;
    const note = () => {
      const shown = document
        .querySelector('[data-hands-free-state]')
        ?.getAttribute('data-hands-free-state');
      if (shown && seen[seen.length - 1] !== shown) {
        seen.push(shown);
      }
    };
    new MutationObserver(note).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-hands-free-state'],
    });
  });
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
    !['on', 'true'].includes((await card.getAttribute('data-app-voice')) ?? '')
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
  return {
    runs,
    syntheses,
    toggle,
    state,
    states: () =>
      page.evaluate(
        () => (window as unknown as { __handsFree: string[] }).__handsFree,
      ),
    // Read from the component itself: the prop React holds for it, found
    // from its element up through its fibers.
    turnSilenceMs: () =>
      page.evaluate(() => {
        const element = document.querySelector('[data-hands-free]');
        const key = element
          ? Object.keys(element).find(name => name.startsWith('__reactFiber$'))
          : undefined;
        type Fiber = { memoizedProps?: Record<string, unknown>; return?: Fiber };
        let fiber = key
          ? (element as unknown as Record<string, Fiber>)[key]
          : undefined;
        while (fiber) {
          const props = fiber.memoizedProps;
          if (props && typeof props.turnSilenceMs === 'number') {
            return props.turnSilenceMs;
          }
          fiber = fiber.return;
        }
        return undefined;
      }),
  };
}

/** `wanted` appear in `seen` in this order, others between them or not. */
export const inOrder = (seen: string[], wanted: string[]): boolean => {
  let at = 0;
  for (const shown of seen) {
    if (shown === wanted[at]) {
      at += 1;
    }
  }
  return at === wanted.length;
};
