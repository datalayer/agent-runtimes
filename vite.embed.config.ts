/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The embed's one script (LOOP D-08): `<datalayer-app>`, React and the
 * application renderer in a single file a host loads with one script tag,
 * and the stylesheet the element links into its shadow root beside it.
 *
 *   npm run build:embed  →  dist-embed/datalayer-app.js, dist-embed/datalayer-app.css
 *
 * The app's build, as `vite.config.ts` sets it up (its plugins, its
 * dependency fixes), as a library of one entry instead of the HTML pages.
 */

import path from 'path';
import { defineConfig, mergeConfig, type UserConfig } from 'vite';
import base from './vite.config';

export default defineConfig(async env => {
  const shared = (
    typeof base === 'function' ? await base(env) : base
  ) as UserConfig;
  const config = mergeConfig(shared, {
    // Nothing is copied from `public/`: the embed is its two files.
    publicDir: false,
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: {
      outDir: 'dist-embed',
      emptyOutDir: true,
      cssCodeSplit: false,
      lib: {
        entry: path.resolve(__dirname, 'src/apps/embed/datalayer-app.ts'),
        name: 'DatalayerApp',
        formats: ['iife'],
        fileName: () => 'datalayer-app.js',
        cssFileName: 'datalayer-app',
      },
    },
  }) as UserConfig;
  // The app's pages are its inputs; the library's entry is this one.
  if (config.build?.rollupOptions) {
    delete config.build.rollupOptions.input;
    config.build.rollupOptions.output = {
      ...(config.build.rollupOptions.output as object),
      inlineDynamicImports: true,
      // The element links `/embed/datalayer-app.css` (EMBED_STYLESHEET_PATH):
      // the stylesheet beside the script, not under `assets/`.
      assetFileNames: (info: { names?: string[] }) =>
        (info.names ?? []).some(name => name.endsWith('.css'))
          ? 'datalayer-app.css'
          : 'assets/[name]-[hash][extname]',
    };
  }
  return config;
});
