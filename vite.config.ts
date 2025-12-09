/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/// <reference types="vitest/config" />

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { treatAsCommonjs } from 'vite-plugin-treat-umd-as-commonjs';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    treatAsCommonjs(),
    {
      name: 'raw-css-as-string',
      enforce: 'pre',
      async resolveId(source, importer) {
        if (source.endsWith('.raw.css') && !source.includes('?raw')) {
          // rewrite import to append ?raw query
          const resolved = await this.resolve(source + '?raw', importer, {
            skipSelf: true,
          });
          if (resolved) return resolved.id;
          return null;
        }
        return null;
      },
    },
    {
      name: 'fix-text-query',
      enforce: 'pre',
      async resolveId(source, importer) {
        if (source.includes('?text')) {
          const fixed = source.replace('?text', '?raw');
          const resolved = await this.resolve(fixed, importer, {
            skipSelf: true,
          });
          if (resolved) {
            return resolved.id;
          }
          return fixed;
        }
        return null;
      },
    },
  ],
  define: {
    global: 'globalThis',
    __webpack_public_path__: '""',
  },
  assetsInclude: ['**/*.whl', '**/*.raw.css', '**/*.lexical'],
  build: {
    rollupOptions: {
      external: ['keytar'],
      output: {
        assetFileNames: assetInfo => {
          if (/pypi\//.test(assetInfo.names[0])) {
            return 'pypi/[name][extname]';
          }
          return 'assets/[name][extname]';
        },
      },
    },
  },
  resolve: {
    alias: [
      {
        find: '@',
        replacement: '/src',
      },
      {
        find: /^~(.*)$/,
        replacement: '$1',
      },
    ],
  },
  optimizeDeps: {
    include: ['crypto-browserify', 'buffer'],
    exclude: ['keytar'],
    esbuildOptions: {
      loader: {
        '.whl': 'text',
        '.lexical': 'json',
      },
    },
  },
  test: {
    coverage: {
      include: ['src/**/*'],
      exclude: [
        'src/**/*.{test,spec}.{js,ts,tsx}',
        'src/test-setup.ts',
        'src/stories/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
      ],
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
    },
    server: {
      deps: {
        external: ['@datalayer/jupyter-react', '@jupyter/web-components'],
      },
    },
    projects: [
      // Unit tests - run in parallel for speed
      {
        test: {
          name: 'unit',
          include: ['src/**/*.unit.{test,spec}.{js,ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['src/test-setup.ts'],
          testTimeout: 10000, // 10 seconds default timeout
          // Unit tests run in parallel for speed
          pool: 'threads',
          poolOptions: {
            threads: {
              singleThread: false,
            },
          },
        },
      },
      // Integration tests - run sequentially to avoid server overload
      {
        test: {
          name: 'integration',
          include: ['src/**/*.integration.{test,spec}.{js,ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['src/test-setup.ts'],
          testTimeout: 30000, // 30 seconds timeout for integration tests
          // Integration tests run sequentially to avoid server overload
          pool: 'threads',
          poolOptions: {
            threads: {
              singleThread: true,
            },
          },
        },
      },
      // General tests (backward compatibility for tests without .unit or .integration)
      {
        test: {
          name: 'general',
          include: [
            'src/**/*.{test,spec}.{js,ts,tsx}',
            '!src/**/*.unit.{test,spec}.{js,ts,tsx}',
            '!src/**/*.integration.{test,spec}.{js,ts,tsx}',
          ],
          environment: 'jsdom',
          setupFiles: ['src/test-setup.ts'],
          testTimeout: 10000,
          // General tests run in parallel by default
          pool: 'threads',
        },
      },
    ],
  },
});
