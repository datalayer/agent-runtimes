/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The one script a host writes (LOOP D-08):
 *
 *   <script src="https://datalayer.app/embed/datalayer-app.js" async></script>
 *
 * A classic script of a few hundred bytes. It imports the element's module,
 * `datalayer-app-main.js`, from beside itself — that module defines
 * `<datalayer-app>` and imports the chunks it needs from beside it in turn,
 * each fetched only when what it draws is shown. A host still writes one
 * script tag; the `async` it already has, and no `type="module"`.
 *
 * Not bundled: `vite.embed.config.ts` transpiles this file on its own and
 * writes it as `dist-embed/datalayer-app.js`. It imports nothing, so a page
 * that runs no module can still run it — and say why nothing came, in place
 * of each element, when the module does not load.
 *
 * @module apps/embed/loader
 */

(function loadDatalayerApp(): void {
  /** The module beside this script: `EMBED_MODULE_FILE` in `vite.embed.config.ts`. */
  const MODULE_FILE = 'datalayer-app-main.js';
  const script = document.currentScript as HTMLScriptElement | null;
  if (!script || !script.src) {
    console.error(
      'datalayer-app: the script has to be loaded by a script tag with a src, so it knows where its module is.',
    );
    return;
  }
  const main = new URL(MODULE_FILE, script.src).href;
  import(/* @vite-ignore */ main).catch((error: unknown) => {
    const reason = error instanceof Error ? error.message : String(error);
    const sentence = `The application could not be loaded: ${main} did not load (${reason}).`;
    console.error(`datalayer-app: ${sentence}`);
    document.querySelectorAll('datalayer-app').forEach(element => {
      if (element.shadowRoot) {
        return;
      }
      const said = document.createElement('p');
      said.textContent = sentence;
      element.attachShadow({ mode: 'open' }).appendChild(said);
    });
  });
})();

// A module to the type checker; written out as a classic script, without it.
export {};
