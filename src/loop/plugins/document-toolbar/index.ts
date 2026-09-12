/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-document-toolbar` — the document's own toolbar items.
 *
 * The prose counterpart of the notebook toolbar plugin, and the same
 * arrangement: the document editor offers a point, this plugin provides the
 * bar and puts what belongs to the document on it, and opens a second point
 * where the chat's agent actions arrive. Switch it off and the document has no
 * toolbar at all — no formatting controls, no buttons — and goes on being
 * editable.
 *
 * Lazy, waiting on the document toolbar point — a workspace where nobody opens
 * a document never fetches it.
 *
 * @module loop/plugins/document-toolbar
 */

import { defineLazyPlugin, onContributionPoint } from '@datalayer/reactor';
import { LoopDocumentToolbar, LoopDocumentToolbarItem } from '../../core';
import { DOCUMENT_TOOLBAR_PLUGIN_NAME } from './names';

export { DOCUMENT_TOOLBAR_PLUGIN_NAME };

export const DocumentToolbarPlugin = defineLazyPlugin({
  name: DOCUMENT_TOOLBAR_PLUGIN_NAME,
  displayName: 'Document toolbar',
  description: 'Shows what the document’s code blocks run on.',
  octicon: 'circle',
  emoji: '\u{1F535}',
  activationEvents: [onContributionPoint(LoopDocumentToolbar)],
  /** The bar accepts the buttons, so the bar's owner opens the point. */
  contributionPoints: [LoopDocumentToolbarItem],
  load: () => import('./plugin'),
});

export default DocumentToolbarPlugin;
