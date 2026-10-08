/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The embed (LOOP D-08): `<datalayer-app>` for a host that writes one script
 * tag and one element.
 *
 *   npm run build:embed  →  dist-embed/
 *     datalayer-app.js        the script a host writes: a classic script of a
 *                             few hundred bytes that imports the module beside it
 *     datalayer-app-main.js   the element's module: React, the element,
 *                             AppRenderer and the conversation
 *     chunks/*.js             what is drawn only when shown — the notebook and
 *                             the document, the agent's details and their
 *                             charts, diagrams, maths, each highlighted
 *                             language — fetched from beside the module
 *     assets/*                fonts, images, wasm and workers, fetched by URL
 *     datalayer-app.css       the stylesheet the element links into its shadow root
 *
 * Everything is found relative to where it was loaded from (`base: './'`,
 * `import.meta.url`), so `/embed/` can sit on any Datalayer origin. Being
 * modules, the files are fetched with CORS when the host is another origin:
 * the origin serving `/embed/` answers `Access-Control-Allow-Origin`.
 *
 * The build fails when what a page fetches before it can draw an application
 * — the module and the chunks it imports statically — is larger, gzipped,
 * than `INITIAL_GZIP_BUDGET`, and prints the size of every file it wrote.
 *
 * The app's build, as `vite.config.ts` sets it up (its plugins, its
 * dependency fixes), with one entry instead of the HTML pages.
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import {
  defineConfig,
  mergeConfig,
  type Plugin,
  type PluginOption,
  type UserConfig,
} from 'vite';
import base from './vite.config';

/** The script a host writes. */
const EMBED_SCRIPT_FILE = 'datalayer-app.js';
/** The module it imports: `MODULE_FILE` in `src/apps/embed/loader.ts`. */
const EMBED_MODULE_FILE = 'datalayer-app-main.js';
/** The stylesheet beside the script: `EMBED_STYLESHEET_PATH` in `embedConfig.ts`. */
const EMBED_STYLESHEET_FILE = 'datalayer-app.css';

/**
 * What a page fetches before it can draw an application, gzipped: the module
 * and every chunk it imports statically.
 *
 * 2.5 MB: the initial load measured 2.36 MB on 2026-10-08 (from 15.7 MB in
 * one script), and what is left in it is the conversation's own weight —
 * JupyterLab's services and `@datalayer/jupyter-react`, KaTeX through
 * streamdown, the browser agent's AI SDK, the agentspecs catalogue — which
 * an import() cannot move without changing the chat. A little above that, so
 * a change that adds a library to the first load fails here instead of
 * shipping. See `docs/docs/apps/embedding.mdx` (What loads when).
 */
const INITIAL_GZIP_BUDGET = 2_500_000;

/** The app build's plugins an embed has no use for. */
const NOT_FOR_THE_EMBED = new Set([
  // JupyterLite's service worker claims the scope of the page it is served
  // from: a host's page is another origin, where it can claim nothing.
  'serve-jupyterlite-service-worker',
  // The app's HTML pages; the embed has none.
  'flatten-html-output',
]);

/** `datalayer-app.js`: the loader, transpiled on its own, imported by nothing. */
function embedLoader(): Plugin {
  return {
    name: 'datalayer-app-loader',
    apply: 'build',
    async generateBundle() {
      const esbuild = await import('esbuild');
      const source = fs.readFileSync(
        path.resolve(__dirname, 'src/apps/embed/loader.ts'),
        'utf8',
      );
      const { code } = await esbuild.transform(source, {
        loader: 'ts',
        format: 'iife',
        target: 'es2020',
        minify: true,
      });
      this.emitFile({
        type: 'asset',
        fileName: EMBED_SCRIPT_FILE,
        source: code,
      });
    },
  };
}

/** In kB of 1000 bytes, as Vite's own report counts them. */
const kb = (bytes: number) => `${(bytes / 1000).toFixed(1)} kB`;

/** The package a module of the bundle comes from, or the source folder. */
function packageOf(id: string): string {
  const clean = id.replace(/^\0/, '').replace(/\?.*$/, '');
  const at = clean.lastIndexOf('node_modules/');
  if (at >= 0) {
    const parts = clean.slice(at + 'node_modules/'.length).split('/');
    return parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
  }
  const src = clean.indexOf('/src/');
  if (src >= 0) {
    return clean
      .slice(src + 1)
      .split('/')
      .slice(0, 3)
      .join('/');
  }
  return path.basename(clean);
}

/**
 * Every file's size, the initial load's per package, and the budget.
 *
 * The initial load is the module and the chunks it imports statically —
 * what the browser fetches before the element can draw. A chunk only
 * reached by `import()` is fetched when what it draws is shown.
 */
function embedSizes(): Plugin {
  return {
    name: 'datalayer-app-sizes',
    apply: 'build',
    writeBundle(_options, bundle) {
      const gzip = (source: string | Uint8Array) =>
        zlib.gzipSync(source, { level: 9 }).length;
      const files = Object.values(bundle);
      const chunks = new Map(
        files.flatMap(file =>
          file.type === 'chunk' ? [[file.fileName, file] as const] : [],
        ),
      );
      if (!chunks.has(EMBED_MODULE_FILE)) {
        this.error(`The embed build wrote no ${EMBED_MODULE_FILE}.`);
      }
      const initial = new Set<string>();
      const pending = [EMBED_MODULE_FILE];
      while (pending.length > 0) {
        const name = pending.pop()!;
        if (!initial.has(name)) {
          initial.add(name);
          pending.push(...(chunks.get(name)?.imports ?? []));
        }
      }
      const rows = files
        .map(file => {
          const source = file.type === 'chunk' ? file.code : file.source;
          const raw =
            typeof source === 'string'
              ? Buffer.byteLength(source)
              : source.byteLength;
          const compressible =
            file.type === 'chunk' || /\.(js|css|json|svg)$/.test(file.fileName);
          return {
            name: file.fileName,
            raw,
            gzip: compressible ? gzip(source) : raw,
            initial: initial.has(file.fileName),
          };
        })
        .sort(
          (a, b) =>
            Number(b.initial) - Number(a.initial) ||
            b.gzip - a.gzip ||
            a.name.localeCompare(b.name),
        );
      const sum = (list: typeof rows, key: 'raw' | 'gzip') =>
        list.reduce((total, row) => total + row[key], 0);
      const initialRows = rows.filter(row => row.initial);
      const lazyRows = rows.filter(row => !row.initial && chunks.has(row.name));
      const otherRows = rows.filter(
        row => !row.initial && !chunks.has(row.name),
      );
      const line = (row: (typeof rows)[number]) =>
        `  ${kb(row.raw).padStart(12)} ${kb(row.gzip).padStart(12)}  ${row.name}`;
      const log: string[] = [
        '',
        'Embed bundle (raw, gzip):',
        `Initial load: ${EMBED_MODULE_FILE} and the chunks it imports statically`,
        ...initialRows.map(line),
        `  ${kb(sum(initialRows, 'raw')).padStart(12)} ${kb(sum(initialRows, 'gzip')).padStart(12)}  total (budget ${kb(INITIAL_GZIP_BUDGET)} gzip)`,
        `Lazy chunks: fetched when what they draw is shown (${lazyRows.length})`,
        ...lazyRows.map(line),
        `  ${kb(sum(lazyRows, 'raw')).padStart(12)} ${kb(sum(lazyRows, 'gzip')).padStart(12)}  total`,
        `The script, the stylesheet and the assets (${otherRows.length})`,
        ...otherRows.map(line),
      ];
      // What the initial load is made of, by package: what to move next.
      const byPackage = new Map<string, number>();
      for (const name of initial) {
        for (const [id, info] of Object.entries(
          chunks.get(name)?.modules ?? {},
        )) {
          const key = packageOf(id);
          byPackage.set(key, (byPackage.get(key) ?? 0) + info.renderedLength);
        }
      }
      // How each package is reached: the shortest chain of static imports
      // from the entry, through the modules the initial chunks hold.
      const held = new Set<string>();
      for (const name of initial) {
        for (const id of Object.keys(chunks.get(name)?.modules ?? {})) {
          held.add(id);
        }
      }
      const entryId = [...held].find(
        id => this.getModuleInfo(id)?.isEntry === true,
      );
      const parent = new Map<string, string | null>();
      if (entryId) {
        parent.set(entryId, null);
        const queue = [entryId];
        for (let at = 0; at < queue.length; at += 1) {
          for (const next of this.getModuleInfo(queue[at])?.importedIds ?? []) {
            if (held.has(next) && !parent.has(next)) {
              parent.set(next, queue[at]);
              queue.push(next);
            }
          }
        }
      }
      const firstOf = new Map<string, string>();
      for (const id of parent.keys()) {
        const key = packageOf(id);
        if (!firstOf.has(key)) {
          firstOf.set(key, id);
        }
      }
      const chainTo = (id: string): string => {
        const steps: string[] = [];
        for (let at: string | null = id; at; at = parent.get(at) ?? null) {
          const clean = at.replace(/^\0/, '');
          const step = clean.includes('node_modules/')
            ? packageOf(clean)
            : path.relative(__dirname, clean);
          if (steps[0] !== step) {
            steps.unshift(step);
          }
        }
        return steps.slice(1).join(' > ');
      };
      log.push(
        'Initial load by package (rendered, before minifying names), and how it is reached:',
      );
      for (const [key, bytes] of [...byPackage.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 60)) {
        const first = firstOf.get(key);
        log.push(
          `  ${kb(bytes).padStart(12)}  ${key}` +
            (first ? `  via ${chainTo(first)}` : ''),
        );
      }
      console.log(log.join('\n'));
      const initialGzip = sum(initialRows, 'gzip');
      if (initialGzip > INITIAL_GZIP_BUDGET) {
        this.error(
          `The embed's initial load is ${kb(initialGzip)} gzipped, over its budget of ${kb(INITIAL_GZIP_BUDGET)}: ` +
            'move what is not drawn with the conversation behind an import().',
        );
      }
    },
  };
}

export default defineConfig(async env => {
  const shared = (
    typeof base === 'function' ? await base(env) : base
  ) as UserConfig;
  const config = mergeConfig(shared, {
    // Every URL relative to the file that asks for it: chunks to the module,
    // assets to the module or the stylesheet.
    base: './',
    // Nothing is copied from `public/`.
    publicDir: false,
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: {
      outDir: 'dist-embed',
      emptyOutDir: true,
      // One stylesheet, linked once into the element's shadow root.
      cssCodeSplit: false,
      // A host's <head> is not the embed's to add preload links to.
      modulePreload: false,
      // The size of every file is printed below, against the budget.
      chunkSizeWarningLimit: Number.POSITIVE_INFINITY,
      reportCompressedSize: false,
    },
  }) as UserConfig;
  config.plugins = [
    ...(config.plugins ?? [])
      .flat(Infinity as 1)
      .filter(
        (plugin: PluginOption) =>
          !(
            plugin &&
            typeof plugin === 'object' &&
            'name' in plugin &&
            NOT_FOR_THE_EMBED.has(plugin.name)
          ),
      ),
    embedLoader(),
    embedSizes(),
  ];
  const rollupOptions = (config.build!.rollupOptions ??= {});
  const entry = path.resolve(__dirname, 'src/apps/embed/datalayer-app.ts');
  // The app's pages are its inputs; the embed's is its module.
  rollupOptions.input = {
    'datalayer-app-main': entry,
  };
  rollupOptions.output = {
    format: 'es',
    entryFileNames: EMBED_MODULE_FILE,
    chunkFileNames: 'chunks/[name]-[hash].js',
    // The element links the stylesheet beside the script (EMBED_STYLESHEET_PATH),
    // not under `assets/`.
    assetFileNames: (info: { names?: string[] }) =>
      (info.names ?? []).some(name => name.endsWith('.css'))
        ? EMBED_STYLESHEET_FILE
        : 'assets/[name]-[hash][extname]',
  };
  return config;
});
