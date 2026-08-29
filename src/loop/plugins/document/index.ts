/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-document` — a rich-text editor, beside the chat.
 *
 * The same shape as the notebook plugin, contributed to the same point: an
 * editor the conversation is about, not an alternative to it.
 *
 * @module loop/plugins/document
 */

import { FileIcon } from '@primer/octicons-react';
import { contribution, definePlugin } from '@datalayer/reactor';
import { LoopChatSurface, LoopCommand, LoopDocumentToolbar } from '../../core';
import { CodeSandboxPlugin } from '../code-sandbox';

export const DOCUMENT_PLUGIN_NAME = '@datalayer/loop-plugin-document';

export const DocumentPlugin = definePlugin({
  name: DOCUMENT_PLUGIN_NAME,
  displayName: 'Document editor',
  description: 'A rich-text document beside the chat, driven by the agent.',
  octicon: 'file',
  emoji: '\u{1F4C4}',
  dependencies: [CodeSandboxPlugin],
  // Declared, not merely used: the registry knows who contributed to a
  // point, it cannot know who opened it. Declaring it is also what makes
  // the document toolbar visible on the plugin graph before anything has
  // filled it — which is exactly when knowing it exists is most useful.
  contributionPoints: [LoopDocumentToolbar],
  contributes: [
    contribution(
      LoopChatSurface,
      {
        surfaceId: 'document',
        title: 'Document',
        icon: FileIcon,
        order: 20,
        canOpen: workspace => workspace.sandbox.state === 'running',
        unavailableReason: () => 'Needs a running sandbox',
        // Lazy, and it matters more here than anywhere: this module pulls
        // `@datalayer/jupyter-lexical`, which initialises Lumino-backed nodes
        // at import time.
        load: () => import('./DocumentView'),
      },
      { id: 'document', order: 20 },
    ),
    contribution(
      LoopCommand,
      {
        name: 'document',
        description: 'Open the document beside the chat',
        group: 'Open',
        run: async ({ workspace }) => {
          workspace.setActiveViewType('chat');
        },
      },
      { id: 'document' },
    ),
  ],
});

export default DocumentPlugin;
