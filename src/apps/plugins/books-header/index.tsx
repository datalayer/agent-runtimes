/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-books-header` — the Accountant's title bar: a
 * Period drop-down told to the agent with every turn, how many payments are
 * still to match, and the open invoices with their total due.
 *
 * What it draws is its UI spec's `header` (`agentspecs/ui/books-header.yaml`):
 * the items, the frontend tool `set_books_header` the agent sets them with,
 * and what each drop-down tells the agent (`toolCards/headerItems`).
 *
 * @module apps/plugins/books-header
 */

import { defineHeaderPlugin } from '../../toolCards/headerItems';

export const BOOKS_HEADER_PLUGIN_NAME = '@datalayer/loop-plugin-books-header';

/** The plugin, built for a workspace: what a person picked is that workspace's. */
export const booksHeaderPlugin = defineHeaderPlugin({
  id: 'books-header',
});

export default booksHeaderPlugin;
