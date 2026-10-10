/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The embed and the hosted page pass the same suite: one set of cases, two
 * mounts (STUDIO D-15).
 *
 * The **hosted** mount is an application at its address on the landing,
 * `/apps/<slug>`, read by a visitor without an account. The **element**
 * mount is `<datalayer-app>` on a host page of another origin
 * (`examples/embed-host/index.html`), its bundle fetched from the landing's
 * `/embed/`, or from `E2E_EMBED_URL`. Each runs the same four cases:
 *
 * 1. the page loads: the application's conversation is drawn, its prompt
 *    ready;
 * 2. a visitor's message is answered — one model request per mount, the
 *    answer kept for the next case;
 * 3. a component is drawn in that answer (a table, asked for);
 * 4. a refusal is shown: an address a visitor may not talk to says why, in
 *    ai-agents' sentence, and nothing is asked of a model.
 *
 * What is not reachable — the landing's dev server, the rebuilt bundle, the
 * visitors' runtime, an address open to visitors — skips its cases with the
 * sentence `global-setup.ts` wrote, and opens no browser for them.
 */

import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  PROBES,
  address,
  apiUrl,
  embedUrl,
  exampleId,
  hostPageUrl,
  landingUrl,
  refusedAddress,
} from './global-setup';

/** What a visitor asks, so that the answer draws a component: a table. */
const ASK =
  'In one short markdown table with two rows, compare the populations of Belgium and the Netherlands, then stop.';

/** A probe's sentence, read in the worker; `''` when reachable. */
const probe = (name: string): string => process.env[name] ?? '';

/** The sentences a mount's cases are skipped with, joined. */
const notReachable = (...names: string[]): string =>
  names.map(probe).filter(Boolean).join(' ');

/** A mount: where the application is, and how to find things on it. */
type Mount = {
  name: string;
  /** Why the whole mount is skipped, or `''`. */
  unreachable: string;
  /** Open the application a visitor may talk to. */
  openAnswering: (page: Page) => Promise<void>;
  /** Why the answering cases are skipped, or `''`. */
  notAnswering: string;
  /** Open the address a visitor may not talk to. */
  openRefused: (page: Page) => Promise<void>;
  /** Why the refusal case is skipped, or `''`. */
  notRefusing: string;
  /** The conversation's prompt. */
  prompt: (page: Page) => Locator;
  /** The answers, newest last. */
  answers: (page: Page) => Locator;
  /** Where a refusal is said. */
  said: (page: Page) => Locator;
};

const MOUNTS: Mount[] = [
  {
    name: 'the hosted page',
    unreachable: notReachable(PROBES.landing),
    openAnswering: page =>
      page.goto(`${landingUrl()}/apps/${address()}`).then(() => undefined),
    notAnswering: notReachable(PROBES.address, PROBES.visitors),
    openRefused: page =>
      page
        .goto(`${landingUrl()}/apps/${refusedAddress()}`)
        .then(() => undefined),
    notRefusing: notReachable(PROBES.refused),
    prompt: page => page.locator('[contenteditable="true"]').first(),
    answers: page => page.locator('[data-chat-message="assistant"]'),
    said: page => page.locator('main, body').first(),
  },
  {
    name: 'the element on a host page',
    unreachable: notReachable(PROBES.bundle, PROBES.hostPage),
    openAnswering: page =>
      page.goto(hostPage({ app: exampleId() })).then(() => undefined),
    notAnswering: notReachable(PROBES.visitors),
    openRefused: page =>
      page.goto(hostPage({ app: refusedAddress() })).then(() => undefined),
    notRefusing: notReachable(PROBES.refused),
    prompt: page =>
      page.locator('datalayer-app [contenteditable="true"]').first(),
    answers: page =>
      page.locator('datalayer-app [data-chat-message="assistant"]'),
    said: page => page.locator('datalayer-app .datalayer-app-said'),
  },
];

/** The host page, told what to embed and where Datalayer is. */
function hostPage(query: Record<string, string>): string {
  const params = new URLSearchParams({
    embed: `${embedUrl()}/datalayer-app.js`,
    origin: landingUrl(),
    api: apiUrl(),
    mode: 'inline',
    ...query,
  });
  return `${hostPageUrl()}?${params.toString()}`;
}

for (const mount of MOUNTS) {
  test.describe(mount.name, () => {
    test.describe.configure({ mode: 'serial' });
    test.skip(Boolean(mount.unreachable), mount.unreachable);

    test.describe('talking to it', () => {
      test.skip(Boolean(mount.notAnswering), mount.notAnswering);

      /** One page for the three cases, so that one message is sent per mount. */
      let page: Page;
      /** The answer, once there is one. */
      let answer: Locator | undefined;

      test.beforeAll(async ({ browser }) => {
        page = await browser.newPage();
        await mount.openAnswering(page);
      });

      test.afterAll(async () => {
        await page?.close();
      });

      test('the page loads, the conversation ready', async () => {
        await expect(mount.prompt(page)).toBeVisible({ timeout: 120_000 });
        // Nothing refused in place of the conversation (where nothing is
        // said at all, there is nothing to read).
        await expect(
          mount.said(page).filter({ hasText: 'datalayer-app:' }),
        ).toHaveCount(0);
      });

      test('a visitor’s message is answered', async () => {
        const prompt = mount.prompt(page);
        await prompt.click();
        await page.keyboard.type(ASK);
        await page.keyboard.press('Enter');
        const answers = mount.answers(page);
        await expect(answers.last()).toContainText(/Belgium|Netherlands/i, {
          timeout: 200_000,
        });
        answer = answers.last();
      });

      test('a component is drawn in the answer', async () => {
        test.skip(!answer, 'No answer came, so no component could be drawn.');
        // A markdown table, or an A2UI table: a table either way.
        await expect(answer!.locator('table').first()).toBeVisible({
          timeout: 60_000,
        });
      });
    });

    test.describe('refusing', () => {
      test.skip(Boolean(mount.notRefusing), mount.notRefusing);

      test('an address a visitor may not talk to says why, and asks no model', async ({
        page,
      }) => {
        const asked: string[] = [];
        page.on('request', request => {
          if (request.url().includes('/ag-ui/')) {
            asked.push(request.url());
          }
        });
        await mount.openRefused(page);
        await expect(mount.said(page)).toContainText(
          /Without an account it is not run|No application is at this address|Sign in to open it|Only the/,
          { timeout: 120_000 },
        );
        await expect(mount.prompt(page)).toHaveCount(0);
        expect(asked).toEqual([]);
      });
    });
  });
}
