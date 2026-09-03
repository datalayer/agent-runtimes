/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-document-view` — the document, one click away.
 *
 * The footer icon that opens the document beside the conversation. It shows
 * only while a document is actually contributed, and requires the
 * input-prompt plugin, whose footer the icon sits in.
 *
 * @module loop/plugins/document-view
 */

import { FileIcon } from '@primer/octicons-react';
import { defineViewPlugin } from '../view-switch';

export const DOCUMENT_VIEW_PLUGIN_NAME = '@datalayer/loop-plugin-document-view';

export const DocumentViewPlugin = defineViewPlugin({
  key: 'document',
  viewId: 'document',
  displayName: 'Document View',
  description: 'The document beside the chat, from the composer footer.',
  icon: FileIcon,
  tooltip: 'Show the document',
  octicon: 'file',
  emoji: '\u{1F4C4}',
  order: 12,
});

export default DocumentViewPlugin;
