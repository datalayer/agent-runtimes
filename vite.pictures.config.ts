/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The dev server the reference pictures are taken from (LOOP T-16): the
 * package's own Vite config, on a port of its own and with a dependency cache
 * of its own, so a run neither collides with the examples on :3000 nor makes
 * them re-optimize their dependencies. HMR stays on: a cold cache
 * re-optimizes on the first page and reloads it, which the capture waits
 * through.
 */

import { defineConfig, mergeConfig, type ConfigEnv } from 'vite';
import base from './vite.config';

export const PICTURES_PORT = 3107;

export default defineConfig((env: ConfigEnv) =>
  mergeConfig(typeof base === 'function' ? base(env) : base, {
    cacheDir: 'node_modules/.vite-pictures',
    server: {
      host: '127.0.0.1',
      port: PICTURES_PORT,
      strictPort: true,
      open: false,
    },
  }),
);
