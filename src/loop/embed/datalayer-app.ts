/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The one script a host loads (LOOP D-08): it defines `<datalayer-app>` and
 * nothing else. Built on its own by `npm run build:embed`
 * (`vite.embed.config.ts`) into `dist-embed/datalayer-app.js`, with the
 * stylesheet the element links into its shadow root beside it
 * (`dist-embed/datalayer-app.css`); served from a Datalayer origin at
 * `/embed/`.
 *
 * @module loop/embed/datalayer-app
 */

import { defineDatalayerAppElement } from './element';

defineDatalayerAppElement();
