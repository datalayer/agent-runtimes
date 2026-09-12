/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A minimal runner for the Jupyter integration tests.
 *
 * Same reason as `vitest.loop.config.ts`: the repository's main vitest config
 * fails to transform its setup file under the installed vite/vitest pair.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/jupyter/__tests__/**/*.test.ts'],
    environment: 'jsdom',
    // The same browser globals jsdom lacks; these modules reach JupyterLab,
    // which touches them when it loads.
    setupFiles: ['./src/__tests__/browserGlobals.ts'],
  },
});
