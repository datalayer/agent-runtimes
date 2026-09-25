/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A minimal runner for the LOOP tests.
 *
 * The repository's main vitest config currently fails to transform its setup
 * file under the installed vite/vitest pair — an existing test file fails the
 * same way on a clean tree. This config runs the LOOP suite without that setup,
 * which it does not need, so the new code is actually verified rather than
 * assumed while that toolchain problem is sorted out separately.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/loop/__tests__/**/*.test.{ts,tsx}'],
    environment: 'node',
    environmentMatchGlobs: [['**/*.test.tsx', 'jsdom']],
    // Browser globals jsdom lacks, installed before any module is imported —
    // a stub written inside a test file runs too late.
    setupFiles: ['./src/__tests__/browserGlobals.ts'],
  },
  esbuild: { jsx: 'automatic' },
});
