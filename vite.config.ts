/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/// <reference types="vitest/config" />

import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { treatAsCommonjs } from 'vite-plugin-treat-umd-as-commonjs';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_APP_TARGET || process.env.VITE_APP_TARGET || 'app';

  const isShowcaseVercelAiElements = target === 'showcase-vercel-ai-elements';
  const isExamples = target === 'examples';

  const plugins = [
    react(),
    wasm(),
    topLevelAwait(),
    treatAsCommonjs(),
    {
      name: 'raw-css-as-string',
      enforce: 'pre' as const,
      async resolveId(source: string, importer: string | undefined): Promise<string | null> {
        if (source.endsWith('.raw.css') && !source.includes('?raw')) {
          const resolved = await (this as any).resolve(source + '?raw', importer, {
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
      enforce: 'pre' as const,
      async resolveId(source: string, importer: string | undefined): Promise<string | null> {
        if (source.includes('?text')) {
          const fixed = source.replace('?text', '?raw');
          const resolved = await (this as any).resolve(fixed, importer, { skipSelf: true });
          if (resolved) return resolved.id;
          return fixed;
        }
        return null;
      },
    },
  ];

  if (isExamples) {
    plugins.unshift({
      name: 'html-transform',
      transformIndexHtml(html: string) {
        return html
          .replaceAll('%VITE_DATALAYER_API_KEY%', env.VITE_DATALAYER_API_KEY || '')
          .replaceAll(
            '%VITE_DATALAYER_RUN_URL%',
            env.VITE_DATALAYER_RUN_URL || 'https://prod1.datalayer.run',
          )
          .replaceAll(
            '%VITE_DATALAYER_RUN_URL_WS%',
            (env.VITE_DATALAYER_RUN_URL || 'https://prod1.datalayer.run').replace('http', 'ws'),
          );
      },
    });
  }

  const server = isShowcaseVercelAiElements
    ? {
        port: 3100,
        open: '/index-showcase-vercel-ai-elements.html',
        fs: { strict: false, allow: ['..', '../..', '../../..'] },
      }
    : isExamples
      ? {
          port: 3000,
          open: '/index-examples.html',
          fs: { strict: false, allow: ['..', '../..', '../../..'] },
          proxy: {
            // Identity OAuth token exchange must go to local backend
            '/api/v1/identity': {
              target: 'http://localhost:8765',
              changeOrigin: true,
              secure: false,
            },
            '/api': {
              target: 'https://prod1.datalayer.run',
              changeOrigin: true,
              secure: true,
              configure: (proxy: any, _options: any) => {
                proxy.on('proxyReq', (_proxyReq: any, req: any) => {
                  console.log(
                    'Proxying:',
                    req.method,
                    req.url,
                    '->',
                    'https://prod1.datalayer.run' + (req.url || ''),
                  );
                });
              },
            },
          },
        }
      : {
          fs: { strict: false, allow: ['..', '../..', '../../..'] },
        };

  const build: any = {
    rollupOptions: {
      external: ['keytar', '@vscode/keytar'],
      output: {
        assetFileNames: (assetInfo: any) => {
          if (/pypi\//.test(assetInfo.names?.[0])) {
            return 'pypi/[name][extname]';
          }
          return 'assets/[name][extname]';
        },
      },
    },
  };

  if (isShowcaseVercelAiElements) {
    build.outDir = 'dist/showcase';
    build.emptyOutDir = true;
    build.rollupOptions.input = path.resolve(__dirname, 'index-showcase-vercel-ai-elements.html');
  } else if (isExamples) {
    build.rollupOptions.input = path.resolve(__dirname, 'index-examples.html');
  } else {
    build.rollupOptions.input = path.resolve(__dirname, 'index.html');
  }

  const optimizeDeps: any = {
    include: [
      'crypto-browserify',
      'buffer',
      'jwt-decode',
      'url-parse',
      'prop-types',
      'shallowequal',
      'react-is',
      '@jupyterlab/coreutils',
      '@jupyterlab/services',
      '@jupyterlab/apputils',
      '@jupyterlab/cells',
      '@jupyterlab/codeeditor',
      '@jupyterlab/rendermime',
      '@jupyterlab/translation',
      '@jupyterlab/ui-components',
    ],
    exclude: ['keytar', '@vscode/keytar'],
    esbuildOptions: {
      loader: {
        '.whl': 'text',
        '.lexical': 'json',
      },
    },
  };

  if (isShowcaseVercelAiElements) {
    // For showcase, move jupyterlab packages from include to exclude
    optimizeDeps.include = ['crypto-browserify', 'buffer', 'jwt-decode', 'url-parse', 'prop-types', 'shallowequal', 'react-is'];
    optimizeDeps.exclude.push(
      '@jupyterlab/apputils',
      '@jupyterlab/apputils-extension',
      '@jupyterlab/cells',
      '@jupyterlab/codeeditor',
      '@jupyterlab/coreutils',
      '@jupyterlab/documentsearch',
      '@jupyterlab/rendermime',
      '@jupyterlab/services',
      '@jupyterlab/translation',
      '@jupyterlab/ui-components',
    );
  }

  return {
    plugins,
    root: '.',
    publicDir: isExamples ? false : 'public',
    define: {
      global: 'globalThis',
      __webpack_public_path__: '""',
    },
    assetsInclude: ['**/*.whl', '**/*.raw.css', '**/*.lexical'],
    build,
    resolve: {
      alias: [
        { find: '@', replacement: path.resolve(__dirname, './src') },
        { find: /^~(.*)$/, replacement: '$1' },
        // Stub out keytar for browser builds - it's a native Node.js module
        { find: 'keytar', replacement: path.resolve(__dirname, './src/stubs/keytar.ts') },
        { find: '@vscode/keytar', replacement: path.resolve(__dirname, './src/stubs/keytar.ts') },
      ],
    },
    optimizeDeps,
    server,
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
        {
          test: {
            name: 'unit',
            include: ['src/**/*.unit.{test,spec}.{js,ts,tsx}'],
            environment: 'jsdom',
            setupFiles: ['src/test-setup.ts'],
            testTimeout: 10000,
            pool: 'threads',
            poolOptions: { threads: { singleThread: false } },
          },
        },
        {
          test: {
            name: 'integration',
            include: ['src/**/*.integration.{test,spec}.{js,ts,tsx}'],
            environment: 'jsdom',
            setupFiles: ['src/test-setup.ts'],
            testTimeout: 30000,
            pool: 'threads',
            poolOptions: { threads: { singleThread: true } },
          },
        },
        {
          test: {
            name: 'general',
            include: [
              'src/**/*.{test,spec}.{js,ts,tsx}',
              '!src/**/*.unit.{test,spec}.{js,ts,tsx}',
              '!src/**/*.integration.{test,spec}.{js,ts,tsx}',
              '!src/__tests__/hooks.test.ts',
              '!src/__tests__/index.test.ts',
              '!src/__tests__/utils.test.ts',
            ],
            environment: 'jsdom',
            setupFiles: ['src/test-setup.ts'],
            testTimeout: 10000,
            pool: 'threads',
          },
        },
      ],
    },
  };
});
