/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * One end-to-end suite, two mounts (STUDIO D-15): the hosted page of an
 * application on the landing (`/apps/<slug>`) and the `<datalayer-app>`
 * element on a host page of another origin (`examples/embed-host`), each
 * running the same cases, in the system Chrome.
 *
 *   npm run test:e2e
 *
 * What it reaches is read from the environment, each with a default:
 *
 *   E2E_LANDING_URL      http://localhost:3063        the landing's dev server, which serves /embed/
 *   E2E_DATALAYER_API    https://r1.datalayer.run     ai-agents and ai-inference
 *   E2E_EXAMPLE          web-research                 the element's application: a public example
 *   E2E_ADDRESS          (none)                       the hosted mount's address, one open to visitors
 *   E2E_REFUSED_ADDRESS  demo-accounting              an address a visitor may not talk to
 *   E2E_CHROME           /usr/bin/google-chrome       the browser
 *
 * `global-setup.ts` probes each before any browser opens; what is not
 * reachable skips its cases with a sentence rather than failing them. One
 * worker, one browser, one page at a time: the machine is shared with heavy
 * dev servers.
 */

import { defineConfig } from '@playwright/test';

/** Where the host page is served from, by this config. */
export const HOST_PAGE_PORT = 8788;

export default defineConfig({
  testDir: '.',
  testMatch: 'mounts.spec.ts',
  outputDir: './test-results',
  globalSetup: './global-setup.ts',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  // A visitor's answer waits on a model, and on searches.
  timeout: 240_000,
  reporter: [['list']],
  use: {
    browserName: 'chromium',
    launchOptions: {
      executablePath: process.env.E2E_CHROME || '/usr/bin/google-chrome',
    },
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
  },
  webServer: {
    // The host page, on an origin of its own.
    command: `python3 -m http.server ${HOST_PAGE_PORT} --bind 127.0.0.1 --directory examples/embed-host`,
    cwd: '..',
    url: `http://127.0.0.1:${HOST_PAGE_PORT}/index.html`,
    reuseExistingServer: true,
    timeout: 30_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
