/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A minimal runner for the examples-shell tests.
 *
 * Same reason as `vitest.loop.config.ts`: the repository's main vitest config
 * fails to transform its setup file under the installed vite/vitest pair, and
 * these tests do not need that setup.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/examples/__tests__/**/*.test.{ts,tsx}'],
    environment: 'node',
    // Hook tests need a DOM to render into; the rest do not and are faster
    // without one.
    environmentMatchGlobs: [['**/*.test.tsx', 'jsdom']],
    // Browser globals jsdom lacks, installed before any module is imported —
    // a stub written inside a test file runs too late.
    setupFiles: ['./src/__tests__/browserGlobals.ts'],
  },
  esbuild: { jsx: 'automatic' },
});
