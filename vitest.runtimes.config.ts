/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A minimal runner for the runtimes-vocabulary tests.
 *
 * Same reason as `vitest.loop.config.ts`: the repository's main vitest config
 * fails to transform its setup file under the installed vite/vitest pair, and
 * these tests do not need that setup.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'src/runtimes/__tests__/**/*.test.ts',
      // The chat's own dependency-free rules, which need no DOM either.
      'src/chat/base/__tests__/**/*.test.ts',
    ],
    environment: 'node',
  },
});
