/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The one script a host writes:
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
  // `@jupyter-widgets` assigns to a bare `__webpack_public_path__` at the top
  // of the module (see `loop-main.tsx`): in an ES module that is a
  // ReferenceError unless the global exists, and the module's own body runs
  // after everything it imports, so it is declared here, before the import —
  // without it no application loads (`… did not load (__webpack_public_path__
  // is not defined)`, seen with `loop apps run --web`).
  const globals = window as unknown as Record<string, unknown>;
  if (globals['__webpack_public_path__'] === undefined) {
    globals['__webpack_public_path__'] = '';
  }
  // A skeleton in each element at once, before the module is even fetched
  // (the user, 15 November 2026: never a loading sentence). Light DOM, so the
  // element's shadow root hides it the moment the module defines it; the
  // element then removes it. Inline only: a floating mode draws nothing in
  // the page until it opens.
  const SKELETON = 'data-datalayer-skeleton';
  const style = document.createElement('style');
  style.textContent =
    '@keyframes datalayer-app-pulse{0%,100%{opacity:1}50%{opacity:.45}}' +
    `[${SKELETON}]>span{display:block;height:14px;border-radius:6px;background:#eaeef2;animation:datalayer-app-pulse 1.4s ease-in-out infinite}` +
    `@media (prefers-reduced-motion:reduce){[${SKELETON}]>span{animation:none}}`;
  document.head.appendChild(style);
  const placeholder = (element: Element): void => {
    const mode = element.getAttribute('mode');
    if (
      element.shadowRoot ||
      (mode && mode !== 'inline') ||
      element.querySelector(`:scope > [${SKELETON}]`)
    ) {
      return;
    }
    const height = Number.parseInt(element.getAttribute('height') ?? '', 10);
    const box = document.createElement('div');
    box.setAttribute(SKELETON, '');
    box.setAttribute('role', 'status');
    box.setAttribute('aria-busy', 'true');
    box.setAttribute('aria-label', 'Loading the application');
    box.style.cssText =
      'display:flex;flex-direction:column;gap:12px;padding:16px;border:1px solid #d0d7de;border-radius:12px;background:#fff;' +
      `min-height:${Number.isFinite(height) && height > 0 ? height : 480}px;box-sizing:border-box`;
    for (const width of ['40%', '72%', '58%', '64%']) {
      const bar = document.createElement('span');
      bar.style.width = width;
      box.appendChild(bar);
    }
    element.appendChild(box);
  };
  document.querySelectorAll('datalayer-app').forEach(placeholder);
  // Elements a page adds while the module is on its way get one too.
  const watch = new MutationObserver(records => {
    for (const record of records) {
      record.addedNodes.forEach(node => {
        if (node instanceof Element) {
          if (node.localName === 'datalayer-app') {
            placeholder(node);
          }
          node.querySelectorAll?.('datalayer-app').forEach(placeholder);
        }
      });
    }
  });
  watch.observe(document.documentElement, { childList: true, subtree: true });
  const main = new URL(MODULE_FILE, script.src).href;
  import(/* @vite-ignore */ main)
    .finally(() => watch.disconnect())
    .catch((error: unknown) => {
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
