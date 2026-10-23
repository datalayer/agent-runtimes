/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The floating assistant is never drawn over the composer's voice controls
 * (T-27). On an application's page the character stands in the bottom-right
 * corner, where the composer's session controls end: the microphone, the
 * voice menu and *Talk with it*. It took their clicks there (20 October
 * 2026, 1280×900); the band now ends where the character's clearance begins
 * (`--assistant-clearance`), at a desktop's width and at a phone's.
 *
 *   E2E_VOICE_ADDRESS=<slug open to visitors> \
 *     npx playwright test -c e2e/playwright.config.ts voice-assistant-clear.spec.ts
 *
 * or, signed in, the Studio's Preview (`E2E_STATE`, `E2E_VOICE_APP`).
 */

import { expect, test, type Locator, type Page } from '@playwright/test';
import { hearing, openVoice, unreachable, voiceAddress } from './handsFree';

/** Whether the point at the middle of `control` reaches it, not what is drawn over it. */
const reached = (control: Locator): Promise<string> =>
  control.evaluate(element => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2,
    );
    if (!hit) {
      return 'nothing';
    }
    if (element === hit || element.contains(hit)) {
      return 'reached';
    }
    return hit.closest('[data-assistant-state]')
      ? 'the floating assistant'
      : `${hit.tagName.toLowerCase()} ${hit.getAttribute('aria-label') ?? ''}`.trim();
  });

async function voiceControls(page: Page): Promise<Locator[]> {
  await expect(page.locator('[data-assistant-figure]')).toBeVisible({
    timeout: 180_000,
  });
  const mic = page.locator('[data-voice-mic]:visible').first();
  // Enabled once the application's runtime is assigned.
  await expect(mic).toBeEnabled({ timeout: 180_000 });
  const controls = [mic, page.locator('[data-voice-menu]:visible').first()];
  const talk = page.locator('[data-hands-free-toggle]:visible').first();
  if (await talk.count()) {
    controls.push(talk);
  }
  for (const control of controls) {
    await control.scrollIntoViewIfNeeded();
  }
  return controls;
}

test.use(hearing('quiet-then-hello.wav'));

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test.describe(`the voice controls, clear of the floating assistant at ${viewport.width}×${viewport.height}`, () => {
    test.skip(Boolean(unreachable), unreachable);
    test.skip(
      viewport.width < 800 && !voiceAddress(),
      'The Studio is laid out for a desktop: a phone’s width is a hosted address’s (E2E_VOICE_ADDRESS).',
    );
    test.use({ viewport });
    test('each control takes its own clicks: the voice menu opens, the microphone listens', async ({
      page,
      context,
    }) => {
      await openVoice(page, context, {
        input: 'push_to_talk',
        output: 'on_request',
        where: 'server',
      });
      const controls = await voiceControls(page);
      for (const control of controls) {
        expect(await reached(control)).toBe('reached');
        // Playwright's own check: nothing else would receive the click.
        await control.click({ trial: true, timeout: 10_000 });
      }
      // Clicked, as a person does: the voice menu opens.
      const [mic, menu] = controls;
      await menu.click();
      await expect(page.locator('[data-voice-language]').first()).toBeVisible();
      await page.keyboard.press('Escape');
      // The microphone: asked once, then listening.
      await mic.click();
      const yes = page.locator('[data-voice-consent-yes]');
      if (await yes.isVisible().catch(() => false)) {
        await yes.click();
      }
      await expect(
        page.locator('[data-voice-input="listening"]'),
      ).toHaveCount(1, { timeout: 30_000 });
    });
  });
}
