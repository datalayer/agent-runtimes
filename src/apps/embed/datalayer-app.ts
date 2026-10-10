/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The element's module (LOOP D-08): it defines `<datalayer-app>` and nothing
 * else. Built on its own by `npm run build:embed` (`vite.embed.config.ts`)
 * into `dist-embed/datalayer-app-main.js`, with the chunks it imports under
 * `dist-embed/chunks/` and the stylesheet the element links into its shadow
 * root (`dist-embed/datalayer-app.css`); served from a Datalayer origin at
 * `/embed/`.
 *
 * A host does not load it: it loads `datalayer-app.js`, the classic script
 * beside it (`loader.ts`), which imports this. A module has no
 * `document.currentScript`, so where that script is — the default origin, and
 * the stylesheet beside it — is told from this module's own address.
 *
 * @module apps/embed/datalayer-app
 */

import { defineDatalayerAppElement } from './element';

/** The script a host writes, beside this module. */
const SCRIPT_FILE = 'datalayer-app.js';

defineDatalayerAppElement({
  scriptUrl: new URL(SCRIPT_FILE, import.meta.url).href,
});
