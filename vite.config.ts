/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/// <reference types="vitest/config" />

import react from '@vitejs/plugin-react';
import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { defineConfig, loadEnv, type ServerOptions } from 'vite';
import { treatAsCommonjs } from 'vite-plugin-treat-umd-as-commonjs';
import wasm from 'vite-plugin-wasm';

/** What JupyterLite asks for, at the root of the site. */
const WORKER_FILE_NAME = 'lite-service-worker.js';
const WORKER_VIRTUAL_ID = `\0${WORKER_FILE_NAME}`;

/** The worker is TypeScript on disk; a browser needs it as plain JavaScript. */
async function transpileWorker(source: string): Promise<{ code: string }> {
  const esbuild = await import('esbuild');
  return esbuild.transform(source, { loader: 'ts', target: 'es2020' });
}

/**
 * The JupyterLite service worker, as shipped by `@datalayer/jupyter-react`.
 *
 * Returns null when the package is not resolvable — the browser sandbox then
 * runs without contents syncing, which is a degradation rather than a failure,
 * and a missing optional dependency should not break the build.
 */
function liteServiceWorkerSource(): string | null {
  try {
    // The package's `exports` map does not expose `./package.json`, so the root
    // is found by walking up from the entry it does expose.
    const require = createRequire(import.meta.url);
    let directory = path.dirname(require.resolve('@datalayer/jupyter-react'));
    for (let depth = 0; depth < 8; depth += 1) {
      const worker = path.join(directory, 'dist', 'lite-service-worker.ts');
      if (fs.existsSync(worker)) {
        return fs.readFileSync(worker, 'utf8');
      }
      const parent = path.dirname(directory);
      if (parent === directory) {
        break;
      }
      directory = parent;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve the `loro-crdt` base64 entry point.
 *
 * In this multi-root monorepo the package is frequently hoisted to a parent
 * `node_modules` directory, so the local `./node_modules/loro-crdt` path does
 * not always exist.  Resolve the real package location via Node's module
 * resolution and fall back to known candidate paths.
 */
function resolveLoroBase64Entry(): string {
  try {
    const requireFromConfig = createRequire(
      path.join(__dirname, 'package.json'),
    );
    const pkgJson = requireFromConfig.resolve('loro-crdt/package.json');
    return path.resolve(path.dirname(pkgJson), 'base64/index.js');
  } catch {
    const candidates = [
      path.resolve(__dirname, './node_modules/loro-crdt/base64/index.js'),
      path.resolve(__dirname, '../../node_modules/loro-crdt/base64/index.js'),
      path.resolve(
        __dirname,
        '../../../node_modules/loro-crdt/base64/index.js',
      ),
    ];
    return (
      candidates.find(candidate => fs.existsSync(candidate)) ?? candidates[0]
    );
  }
}

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_APP_TARGET || process.env.VITE_APP_TARGET || 'app';

  const isShowcaseVercelAiElements = target === 'showcase-vercel-ai-elements';
  const isExamples = target === 'examples';
  const isExamples2 = target === 'examples2';
  const isExamplesTarget = isExamples || isExamples2;

  const plugins = [
    react(),
    wasm(),
    treatAsCommonjs(),
    // JupyterLite asks the page for `/lite-service-worker.js` — the worker that
    // keeps a Pyodide kernel's filesystem and the JupyterLite contents in step.
    // `@datalayer/jupyter-react` ships it as TypeScript (`dist/lite-service-worker.ts`),
    // which a browser cannot run, so without this the request 404s and the
    // browser sandbox comes up with contents syncing silently switched off.
    //
    // A service worker must be served from the scope it claims, so it is served
    // at the root under its own name rather than bundled with a hashed one.
    {
      name: 'serve-jupyterlite-service-worker',
      resolveId(id: string) {
        return id === WORKER_VIRTUAL_ID ? id : null;
      },
      configureServer(server: any) {
        server.middlewares.use(
          `/${WORKER_FILE_NAME}`,
          async (_request: any, response: any, next: any) => {
            const source = liteServiceWorkerSource();
            if (!source) {
              next();
              return;
            }
            try {
              const { code } = await transpileWorker(source);
              response.setHeader('Content-Type', 'text/javascript');
              // The worker's scope is the whole page; without this header a
              // browser refuses to let it claim the root.
              response.setHeader('Service-Worker-Allowed', '/');
              response.end(code);
            } catch (error) {
              next(error);
            }
          },
        );
      },
      async generateBundle(this: any) {
        const source = liteServiceWorkerSource();
        if (!source) {
          return;
        }
        const { code } = await transpileWorker(source);
        this.emitFile({
          type: 'asset',
          fileName: WORKER_FILE_NAME,
          source: code,
        });
      },
    },
    // After build, move HTML files from dist/html/ to dist/ so the FastAPI
    // StaticFiles mount can serve them at /static/agent.html etc.
    {
      name: 'flatten-html-output',
      closeBundle() {
        const outDir = path.resolve(__dirname, 'dist');
        const htmlDir = path.join(outDir, 'html');
        if (fs.existsSync(htmlDir)) {
          for (const file of fs.readdirSync(htmlDir)) {
            if (file.endsWith('.html')) {
              fs.renameSync(path.join(htmlDir, file), path.join(outDir, file));
            }
          }
          // Remove the now-empty html/ directory (best-effort)
          try {
            fs.rmdirSync(htmlDir);
          } catch {
            /* not empty – leave it */
          }
        }
      },
    },
    {
      name: 'raw-css-as-string',
      enforce: 'pre' as const,
      async resolveId(
        source: string,
        importer: string | undefined,
      ): Promise<string | null> {
        if (source.endsWith('.raw.css') && !source.includes('?raw')) {
          const resolved = await (this as any).resolve(
            source + '?raw',
            importer,
            {
              skipSelf: true,
            },
          );
          if (resolved) return resolved.id;
          return null;
        }
        return null;
      },
    },
    {
      name: 'fix-text-query',
      enforce: 'pre' as const,
      async resolveId(
        source: string,
        importer: string | undefined,
      ): Promise<string | null> {
        if (source.includes('?text')) {
          const fixed = source.replace('?text', '?raw');
          const resolved = await (this as any).resolve(fixed, importer, {
            skipSelf: true,
          });
          if (resolved) return resolved.id;
          return fixed;
        }
        return null;
      },
    },
    // @jupyter-widgets/controls and html-manager use
    //   version = require("../package.json").version;
    // which fails at runtime because requirejs can't resolve the relative
    // path.  Resolve it at build time to the actual package.json file.
    {
      name: 'resolve-jupyter-widgets-package-json',
      enforce: 'pre' as const,
      resolveId(source: string, importer: string | undefined) {
        if (source === '../package.json' && importer) {
          const normImporter = importer.replace(/\\/g, '/');
          if (normImporter.includes('@jupyter-widgets/')) {
            const dir = path.dirname(importer);
            return path.resolve(dir, source);
          }
        }
        return null;
      },
    },
    // Fallback: patch Node.js-only references that survive CJS→ESM bundling.
    // - require("../package.json").version from @jupyter-widgets
    // - __dirname from mathjax-full
    {
      name: 'patch-node-references-in-bundle',
      generateBundle(_options: any, bundle: any) {
        for (const [, chunk] of Object.entries(bundle)) {
          const c = chunk as any;
          if (c.type !== 'chunk' || !c.code) continue;
          let code = c.code;
          let changed = false;
          if (code.includes('require("../package.json")')) {
            code = code.replace(
              /require\("\.\.\/package\.json"\)\.version/g,
              '"0.0.0"',
            );
            changed = true;
          }
          if (code.includes('__dirname')) {
            // Only replace bare `__dirname` identifier references (from
            // mathjax-full's CJS build). Do NOT touch member accesses such as
            // `globalThis.__dirname`, which are valid property reads — blindly
            // replacing those produces `globalThis."/"` (a syntax error).
            code = code.replace(/(?<!\.)\b__dirname\b/g, '"/"');
            changed = true;
          }
          if (changed) c.code = code;
        }
      },
    },
  ];

  if (isExamplesTarget) {
    plugins.unshift({
      name: 'html-transform',
      transformIndexHtml: {
        order: 'pre' as const,
        handler(html: string) {
          return (
            html
              .replaceAll(
                '%VITE_DATALAYER_API_KEY%',
                env.VITE_DATALAYER_API_KEY || '',
              )
              .replaceAll(
                '%VITE_DATALAYER_RUNTIMES_URL%',
                env.VITE_DATALAYER_RUNTIMES_URL || 'https://r1.datalayer.run',
              )
              .replaceAll(
                '%VITE_DATALAYER_AGENT_RUNTIMES_URL%',
                env.VITE_DATALAYER_AGENT_RUNTIMES_URL ||
                  'https://r1.datalayer.run',
              )
              // One URL per service. In production they sit behind one gateway, so
              // they share a default; local dev overrides each to its own port so
              // http + ws both target local servers.
              .replaceAll(
                '%VITE_DATALAYER_AI_AGENTS_URL%',
                env.VITE_DATALAYER_AI_AGENTS_URL || 'https://r1.datalayer.run',
              )
              .replaceAll(
                '%VITE_DATALAYER_AI_INFERENCE_URL%',
                // prod1, not r1. r1 hosts the runtimes plane; the inference
                // service sits with the rest of the control plane on prod1,
                // and a browser agent pointed at r1 gets a cross-origin
                // failure from a host that does not serve the route at all.
                env.VITE_DATALAYER_AI_INFERENCE_URL ||
                  'https://prod1.datalayer.run',
              )
              .replaceAll(
                '%VITE_DATALAYER_JUPYTER_MCP_SERVER_URL%',
                env.VITE_DATALAYER_JUPYTER_MCP_SERVER_URL ||
                  'https://mcp.datalayer.run/mcp',
              )
              .replaceAll(
                '%VITE_DATALAYER_IAM_URL%',
                env.VITE_DATALAYER_IAM_URL || 'https://prod1.datalayer.run',
              )
              .replaceAll(
                '%VITE_DATALAYER_LIBRARY_URL%',
                env.VITE_DATALAYER_LIBRARY_URL || 'https://prod1.datalayer.run',
              )
              .replaceAll(
                '%VITE_DATALAYER_SPACER_URL%',
                env.VITE_DATALAYER_SPACER_URL || 'https://prod1.datalayer.run',
              )
              .replaceAll(
                '%VITE_DATALAYER_OTEL_URL%',
                env.VITE_DATALAYER_OTEL_URL ||
                  env.VITE_OTEL_IN_BASE_URL ||
                  env.VITE_OTEL_BASE_URL ||
                  'https://prod1.datalayer.run',
              )
              .replaceAll(
                '%VITE_DATALAYER_GROWTH_URL%',
                env.VITE_DATALAYER_GROWTH_URL || 'https://prod1.datalayer.run',
              )
              .replaceAll(
                '%VITE_DATALAYER_SUCCESS_URL%',
                env.VITE_DATALAYER_SUCCESS_URL || 'https://prod1.datalayer.run',
              )
              .replaceAll(
                '%VITE_DATALAYER_INBOUNDS_URL%',
                env.VITE_DATALAYER_INBOUNDS_URL || 'https://prod1.datalayer.run',
              )
              .replaceAll(
                '%VITE_DATALAYER_SUPPORT_URL%',
                env.VITE_DATALAYER_SUPPORT_URL || 'https://prod1.datalayer.run',
              )
              .replaceAll(
                '%VITE_DATALAYER_RUNTIMES_URL_WS%',
                (
                  env.VITE_DATALAYER_RUNTIMES_URL || 'https://r1.datalayer.run'
                ).replace('http', 'ws'),
              )
              .replaceAll(
                '%VITE_JUPYTER_SERVER_URL%',
                env.VITE_JUPYTER_SERVER_URL ||
                  `${env.VITE_DATALAYER_RUNTIMES_URL || 'https://r1.datalayer.run'}/api/jupyter-server`,
              )
              .replaceAll(
                '%VITE_JUPYTER_SERVER_URL_WS%',
                (
                  env.VITE_JUPYTER_SERVER_URL ||
                  `${env.VITE_DATALAYER_RUNTIMES_URL || 'https://r1.datalayer.run'}/api/jupyter-server`
                ).replace('http', 'ws'),
              )
          );
        },
      },
    });
  }

  const server: ServerOptions = isShowcaseVercelAiElements
    ? {
        port: 3100,
        open: '/html/index-showcase-vercel-ai-elements.html',
        fs: { strict: false, allow: ['..', '../..', '../../..'] },
      }
    : isExamplesTarget
      ? {
          port: 3000,
          open: isExamples2 ? '/html/examples2.html' : '/html/examples.html',
          fs: { strict: false, allow: ['..', '../..', '../../..'] },
        }
      : {
          fs: { strict: false, allow: ['..', '../..', '../../..'] },
          // Dev-mode proxy so the standalone agent pages (agent.html,
          // agent-notebook.html, agent-document.html, agent-node.html) served by
          // Vite can reach the agent-runtimes backend. In production these
          // pages are served from the backend origin itself (under /static),
          // so `window.location.origin` already points at the API; in dev the
          // Vite origin differs, so we forward the backend API routes here.
          proxy: {
            '/api': {
              target:
                env.VITE_AGENT_RUNTIMES_SERVER_URL || 'http://localhost:8765',
              changeOrigin: true,
              ws: true,
            },
            // `/health/startup` exposes the node-local sandbox's live Jupyter
            // endpoint (jupyter_url/jupyter_token/kernel_id) used to bind the
            // AgentNode chat's ephemeral notebook/document to the local
            // sandbox kernel. Without this proxy entry the fetch in
            // AgentNode.tsx hits the Vite dev server itself (404) and the
            // sandbox runtime override never resolves.
            '/health': {
              target:
                env.VITE_AGENT_RUNTIMES_SERVER_URL || 'http://localhost:8765',
              changeOrigin: true,
            },
          },
        };

  const build: any = {
    target: 'esnext',
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
    build.rollupOptions.input = path.resolve(
      __dirname,
      'html/index-showcase-vercel-ai-elements.html',
    );
  } else if (isExamplesTarget) {
    build.rollupOptions.input = path.resolve(
      __dirname,
      isExamples2 ? 'html/examples2.html' : 'html/examples.html',
    );
  } else {
    build.rollupOptions.input = {
      main: path.resolve(__dirname, 'html/index.html'),
      agent: path.resolve(__dirname, 'html/agent.html'),
      'agent-node': path.resolve(__dirname, 'html/agent-node.html'),
      'agent-notebook': path.resolve(__dirname, 'html/agent-notebook.html'),
      'agent-document': path.resolve(__dirname, 'html/agent-document.html'),
      loop: path.resolve(__dirname, 'html/loop.html'),
      'loop-example': path.resolve(__dirname, 'html/loop-example.html'),
    };
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
      // Pre-bundle mathjax-full so esbuild resolves its CommonJS named exports
      // (e.g. `import { mathjax }`) to real values instead of undefined, and so
      // the esbuildOptions.define below replaces its __dirname references.
      'mathjax-full',
    ],
    exclude: ['keytar', '@vscode/keytar'],
    esbuildOptions: {
      // Ensure Node globals referenced by CJS deps (mathjax-full) are also
      // replaced during dependency pre-bundling, matching the top-level define.
      define: {
        __dirname: JSON.stringify('/'),
        __filename: JSON.stringify('/index.js'),
      },
      loader: {
        '.whl': 'text',
        '.lexical': 'json',
      },
      // Fix prismjs language component load-order crash during pre-bundling.
      // When esbuild pre-bundles @lexical/code, it inlines the prismjs CJS
      // IIFEs and may reorder their execution.  prism-cpp.js extends 'c',
      // which in turn extends 'clike'.  If prism-c.js hasn't run yet,
      // `Prism.languages.c` is undefined and `.extend('c', ...)` crashes:
      //   TypeError: Cannot set properties of undefined (setting 'class-name')
      // The esbuild plugin below intercepts each derived prism language file
      // and prepends explicit `require()` calls for its prerequisites so that
      // the base language is always registered first, regardless of how
      // esbuild orders the inlined modules.
      plugins: [
        {
          name: 'fix-prismjs-language-deps',
          setup(build: any) {
            // Map of prism language files → their prerequisite requires
            const prismDeps: Record<string, string[]> = {
              'prism-cpp': [
                "require('prismjs');",
                "require('prismjs/components/prism-clike.js');",
                "require('prismjs/components/prism-c.js');",
              ],
              'prism-objectivec': [
                "require('prismjs');",
                "require('prismjs/components/prism-clike.js');",
                "require('prismjs/components/prism-c.js');",
              ],
              'prism-javascript': [
                "require('prismjs');",
                "require('prismjs/components/prism-clike.js');",
              ],
              'prism-typescript': [
                "require('prismjs');",
                "require('prismjs/components/prism-clike.js');",
                "require('prismjs/components/prism-javascript.js');",
              ],
              'prism-java': [
                "require('prismjs');",
                "require('prismjs/components/prism-clike.js');",
              ],
              'prism-c': [
                "require('prismjs');",
                "require('prismjs/components/prism-clike.js');",
              ],
              'prism-markdown': [
                "require('prismjs');",
                "require('prismjs/components/prism-markup.js');",
              ],
            };
            for (const [lang, deps] of Object.entries(prismDeps)) {
              const re = new RegExp(
                `prismjs[\\/\\\\]components[\\/\\\\]${lang}\\.js$`,
              );
              build.onLoad({ filter: re }, async (args: any) => {
                const original = await fs.promises.readFile(args.path, 'utf8');
                return {
                  contents: deps.join('\n') + '\n' + original,
                  loader: 'js' as const,
                };
              });
            }
          },
        },
      ],
    },
  };

  if (isShowcaseVercelAiElements) {
    // For showcase, move jupyterlab packages from include to exclude
    optimizeDeps.include = [
      'crypto-browserify',
      'buffer',
      'jwt-decode',
      'url-parse',
      'prop-types',
      'shallowequal',
      'react-is',
    ];
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

  // When building the default target, assets are served under /static/ by
  // the FastAPI StaticFiles mount, so we set base accordingly.
  // In dev mode (vite serve), use '/' so pages are accessible without the prefix.
  const isServe = command === 'serve';
  const base =
    isShowcaseVercelAiElements || isExamplesTarget || isServe
      ? '/'
      : '/static/';

  return {
    base,
    plugins,
    root: '.',
    publicDir: isExamplesTarget ? false : 'public',
    define: {
      global: 'globalThis',
      __webpack_public_path__: '""',
      // mathjax-full (and a few other CJS deps) reference Node's __dirname /
      // __filename at module scope. In production these are patched by the
      // `patch-node-references-in-bundle` plugin (generateBundle), but that
      // hook does not run under `vite serve`, so define them here to cover dev
      // mode too. Value mirrors the production patch ('/').
      __dirname: JSON.stringify('/'),
      __filename: JSON.stringify('/index.js'),
    },
    assetsInclude: ['**/*.whl', '**/*.raw.css', '**/*.lexical'],
    build,
    resolve: {
      // Force these packages to resolve from the root node_modules only.
      // Without this, Vite follows the @datalayer/core symlink into the core
      // source tree and picks up incompatible versions nestled there.
      //
      // @primer/react (and its siblings) MUST be deduped: multiple physical
      // copies exist across workspaces (agent-runtimes, primer-addons,
      // jupyter-react) at the same version. Each copy owns its own React
      // ThemeProvider context, so without deduping, the theme applied by
      // primer-addons' <DatalayerThemeProvider> is invisible to example
      // components that import from @primer/react directly — they render
      // unthemed while primer-addons' own components (theme selector) stay
      // themed. Collapsing to a single instance restores shared theming.
      dedupe: [
        'date-fns',
        'react',
        'react-dom',
        '@primer/react',
        '@primer/react-brand',
        '@primer/octicons-react',
        'styled-components',
      ],
      alias: [
        ...(isExamples
          ? [
              {
                find: /^loro-crdt$/,
                replacement: resolveLoroBase64Entry(),
              },
            ]
          : []),
        { find: '@', replacement: path.resolve(__dirname, './src') },
        { find: /^~(.*)$/, replacement: '$1' },
        // primer-addons Box (styled-components) forwards `sx` to DOM in the
        // current linked setup. Route Box module to a shim backed by
        // @primer/react Box so `sx` is consumed instead of rendered as an
        // attribute (e.g. sx="[object Object]").
        {
          find: /@datalayer\/primer-addons\/lib\/components\/box\/Box(\.js)?$/,
          replacement: path.resolve(
            __dirname,
            './src/shims/primerAddonsBox.tsx',
          ),
        },
        {
          find: /\/src\/tech\/primer\/addons\/lib\/components\/box\/Box\.js$/,
          replacement: path.resolve(
            __dirname,
            './src/shims/primerAddonsBox.tsx',
          ),
        },
        // json5 v2 ESM default export may not expose named exports expected by
        // @datalayer/jupyter-react; route through a shim that re-exports
        // parse/stringify explicitly.
        {
          find: /^json5$/,
          replacement: path.resolve(__dirname, './src/shims/json5.ts'),
        },
        // Stub out keytar for browser builds - it's a native Node.js module
        {
          find: 'keytar',
          replacement: path.resolve(__dirname, './src/stubs/keytar.ts'),
        },
        {
          find: '@vscode/keytar',
          replacement: path.resolve(__dirname, './src/stubs/keytar.ts'),
        },
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
            environment: 'node',
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
