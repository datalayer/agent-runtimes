/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Pictures as tests (LOOP T-16): the four reference screens in every theme
 * and mode, and the floating assistant's states, captured headless in the
 * system Chrome and compared with the baselines in `pictures/baselines/`.
 *
 *   npm run test:pictures          # compare; a difference fails with a diff image
 *   npm run test:pictures:accept   # accept what changed as the new baselines
 *
 * One worker and one browser at a time: the machine this runs on is shared
 * with heavy dev servers. Playwright starts the Vite server below and stops
 * it when the run ends.
 */

import { defineConfig } from '@playwright/test';

const PORT = 3107;

export default defineConfig({
  testDir: '.',
  testMatch: 'pictures.spec.ts',
  outputDir: './test-results',
  // One file per picture, named by what it shows; no platform suffix, since
  // the baselines are taken on Linux with the fonts installed there.
  snapshotPathTemplate: '{testDir}/baselines/{arg}{ext}',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 300_000,
  reporter: [['list']],
  expect: {
    toHaveScreenshot: {
      // A pixel counts as different past this colour distance (0 to 1),
      // about 3 levels of 255...
      threshold: 0.01,
      // ...and a picture fails past this many different pixels. The same
      // Chrome on the same machine draws the same pixels, so this only lets
      // a stray edge through. Measured on the conversation: the bubbles'
      // radius from 22 to 16px is 110 to 220 pixels, the frame's from 28 to
      // 20px some 370, a 2px hairline some 20,000, another accent some
      // 20,000. A change drawn only in anti-aliased pixels — the pale
      // bubble's radius 2px smaller — is ignored by the comparison and
      // passes.
      maxDiffPixels: 64,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    },
  },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    browserName: 'chromium',
    launchOptions: {
      executablePath: process.env.PICTURES_CHROME || '/usr/bin/google-chrome',
    },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    locale: 'en-US',
    timezoneId: 'UTC',
  },
  webServer: {
    command: 'npx vite --config vite.pictures.config.ts',
    cwd: '..',
    url: `http://127.0.0.1:${PORT}/html/pictures.html`,
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
