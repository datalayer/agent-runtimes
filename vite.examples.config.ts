/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { treatAsCommonjs } from 'vite-plugin-treat-umd-as-commonjs';
import path from 'path';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    root: process.cwd(),
    publicDir: false,

    server: {
      port: 3000,
      open: true,
      fs: {
        strict: false,
      },
      proxy: {
        '/api': {
          target: 'https://prod1.datalayer.run',
          changeOrigin: true,
          secure: true,
          configure: (proxy, options) => {
            proxy.on('proxyReq', (proxyReq, req, res) => {
              console.log(
                'Proxying:',
                req.method,
                req.url,
                '->',
                options.target + (req.url || ''),
              );
            });
          },
        },
      },
      // Handle SPA routing - serve index.html for all routes
      middlewareMode: false,
    },

    appType: 'spa',

    plugins: [
      react(),
      treatAsCommonjs(),
      {
        name: 'html-transform',
        transformIndexHtml(html) {
          // Replace environment variables in HTML
          return html
            .replaceAll(
              /%VITE_DATALAYER_API_KEY%/g,
              env.VITE_DATALAYER_API_KEY || '',
            )
            .replaceAll(
              /%VITE_DATALAYER_RUN_URL%/g,
              env.VITE_DATALAYER_RUN_URL || 'https://prod1.datalayer.run',
            )
            .replaceAll(
              /%VITE_DATALAYER_RUN_URL_WS%/g,
              (
                env.VITE_DATALAYER_RUN_URL || 'https://prod1.datalayer.run'
              ).replace('http', 'ws'),
            );
        },
      },
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

    assetsInclude: ['**/*.whl', '**/*.raw.css'],

    resolve: {
      alias: [
        {
          find: '@',
          replacement: path.resolve(__dirname, './src'),
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
        },
      },
    },

    build: {
      rollupOptions: {
        external: ['keytar'],
        input: path.resolve(__dirname, 'index.html'),
      },
    },
  };
});
