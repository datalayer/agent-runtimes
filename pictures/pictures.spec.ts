/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Pictures as tests (LOOP T-16, and T-27's states of the floating assistant).
 *
 * Each picture is a page of `html/pictures.html` — the real chat components
 * with fixed data (`src/stories/loop/ReferenceScreens.tsx`) — taken once its
 * fonts are in, with motion reduced and animations stopped, and compared with
 * its baseline. A changed token shows as a failed test and a `-diff.png` in
 * `pictures/test-results/`: fix it, or accept it with
 * `npm run test:pictures:accept`.
 *
 * `PICTURES_THEMES=loop,datalayer` narrows the themes for a quicker run;
 * `npm run test:pictures -- -g "assistant|character"` takes only the floating
 * assistant's pictures.
 * `PICTURES_CSS` adds a stylesheet to every page before it is pictured — to
 * see what a token change would do before making it, e.g.
 * `PICTURES_CSS='[data-datalayer-theme-scope] { --theme-radius-bubble: 20px !important }'`.
 */

import { expect, test, type Page } from '@playwright/test';

/** The registry's themes, in its order (`themeConfigs` of primer-addons). */
const ALL_THEMES = [
  'datalayer',
  'spatial',
  'lovely',
  'matrix',
  'earth',
  'sand',
  'ivory',
  'sun',
  'loop',
];
const THEMES = process.env.PICTURES_THEMES
  ? process.env.PICTURES_THEMES.split(',').map(theme => theme.trim())
  : ALL_THEMES;
const MODES = ['light', 'dark'] as const;
const SCREENS = [
  'conversation',
  'beside-work',
  'worker-activity',
  'approval',
  'tool-marks',
] as const;
const ASSISTANT = [
  'idle',
  'thinking',
  'working',
  'waiting',
  'paused',
  'speaking',
  'aside',
] as const;
// Each character idle, light and dark (T-25), and the owl an example plugin
// contributes (T-24); the paper clip's is `assistant-idle`.
const CHARACTERS = ['wizard', 'cat', 'eyes', 'owl'] as const;

async function show(page: Page, query: string): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(`/html/pictures.html?${query}`, {
    waitUntil: 'commit',
    timeout: 240_000,
  });
  // A cold dependency cache re-optimizes on the first page and reloads it;
  // the wait carries over the reload.
  const ready = page.locator('html[data-pictures-ready]');
  try {
    await ready.waitFor({ state: 'attached', timeout: 120_000 });
  } catch {
    // Once in a long run a page never says it is ready; a second load does.
    test.info().annotations.push({
      type: 'reloaded',
      description: errors.join('\n') || 'no page error',
    });
    await page.reload({ waitUntil: 'commit' });
    await ready.waitFor({ state: 'attached', timeout: 120_000 });
  }
  if (process.env.PICTURES_CSS) {
    await page.addStyleTag({ content: process.env.PICTURES_CSS });
  }
}

for (const theme of THEMES) {
  for (const mode of MODES) {
    test.describe(`${theme} · ${mode}`, () => {
      test.use({ colorScheme: mode, viewport: { width: 960, height: 640 } });
      for (const screen of SCREENS) {
        test(screen, async ({ page }) => {
          await show(page, `screen=${screen}&theme=${theme}&mode=${mode}`);
          await expect(page.locator('html')).toHaveAttribute(
            'data-reference-theme',
            theme,
          );
          await expect(page).toHaveScreenshot(`${screen}-${theme}-${mode}.png`);
        });
      }
    });
  }
}

// The floating assistant in the theme of applications, in both modes (T-27).
for (const mode of MODES) {
  test.describe(`assistant · ${mode}`, () => {
    test.use({ colorScheme: mode, viewport: { width: 480, height: 360 } });
    for (const picture of ASSISTANT) {
      test(picture, async ({ page }) => {
        await show(page, `assistant=${picture}&theme=loop&mode=${mode}`);
        const stage = page.locator('[data-assistant-state]');
        if (picture === 'aside') {
          // A dialog over it: it steps aside, and the picture holds that.
          await expect(stage).toHaveAttribute(
            'data-assistant-aside',
            'obstacle',
          );
        } else {
          await expect(stage).toHaveAttribute('data-assistant-state', picture);
          await expect(stage).not.toHaveAttribute('data-assistant-aside', /.+/);
        }
        await expect(page).toHaveScreenshot(`assistant-${picture}-${mode}.png`);
      });
    }
  });
}

// The conversation open, as the assistant's balloon (T-23): the history, the
// welcome first, the Lexical composer last, no header nor footer; a window
// tall enough for its 60%.
for (const mode of MODES) {
  test.describe(`assistant open · ${mode}`, () => {
    test.use({ colorScheme: mode, viewport: { width: 560, height: 720 } });
    test('open', async ({ page }) => {
      await show(page, `assistant=open&theme=loop&mode=${mode}`);
      await expect(page.locator('[data-conversation-balloon]')).toBeVisible();
      await expect(
        page.locator('[data-conversation-balloon] [contenteditable="true"]'),
      ).toBeVisible();
      await expect(page).toHaveScreenshot(`assistant-open-${mode}.png`);
    });
  });
}

// Datalayer's characters, each in its own drawing for the mode (T-25), and a
// character a plugin contributes (T-24), idle in the theme of applications.
for (const mode of MODES) {
  test.describe(`character · ${mode}`, () => {
    test.use({ colorScheme: mode, viewport: { width: 480, height: 360 } });
    for (const character of CHARACTERS) {
      test(character, async ({ page }) => {
        await show(page, `character=${character}&theme=loop&mode=${mode}`);
        await expect(
          page.locator(
            `[data-assistant-state="idle"] svg[data-assistant-mode="${mode}"]`,
          ),
        ).toBeVisible();
        await expect(page).toHaveScreenshot(
          `character-${character}-${mode}.png`,
        );
      });
    }
  });
}

// The gallery's grid (T-16, T-22, T-26, T-27): every character — Datalayer's,
// the owl a plugin contributes and a test sprite read by the clippy.js
// reader — in every state and stepped aside, still, in both modes.
for (const mode of MODES) {
  test.describe(`assistant gallery · ${mode}`, () => {
    test.use({ colorScheme: mode, viewport: { width: 880, height: 520 } });
    test('every character in every state', async ({ page }) => {
      await show(page, `gallery=grid&theme=loop&mode=${mode}`);
      await expect(page.locator('[data-gallery-cell]')).toHaveCount(6 * 9);
      await expect(
        page.locator(
          '[data-gallery-cell="sprite-idle"] [data-sprite-animation]',
        ),
      ).toHaveAttribute('data-sprite-animation', 'Idle1_1');
      await expect(
        page.locator('[data-gallery-cell$="-aside"] [data-assistant-aside]'),
      ).toHaveCount(6);
      for (const cell of await page
        .locator('[data-gallery-cell$="-aside"] [data-assistant-state]')
        .all()) {
        await expect(cell).toHaveAttribute('data-assistant-aside', 'obstacle');
      }
      await expect(page).toHaveScreenshot(`assistant-gallery-${mode}.png`);
    });
  });
}
