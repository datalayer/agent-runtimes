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
import {
  LoopCommand,
  LoopEditorView,
  LoopFrontendTool,
  requestSurface,
  LoopDocumentToolbar,
} from '../../core';
import { AgentsPlugin } from '../agents';

export const DOCUMENT_PLUGIN_NAME = '@datalayer/loop-plugin-document';

export const DocumentPlugin = definePlugin({
  name: DOCUMENT_PLUGIN_NAME,
  displayName: 'Document editor',
  description: 'A rich-text document beside the chat, driven by the agent.',
  octicon: 'file',
  emoji: '\u{1F4C4}',
  // The sandbox is a hard dependency; the shell and the chat are extended
  // through their points instead — see the notebook plugin for why.
  dependencies: [AgentsPlugin],
  // Declared, not merely used: the registry knows who contributed to a
  // point, it cannot know who opened it. Declaring it is also what makes
  // the document toolbar visible on the plugin graph before anything has
  // filled it — which is exactly when knowing it exists is most useful.
  contributionPoints: [LoopDocumentToolbar],
  contributes: [
    // The editor: one entry in the shell's segmented control, one view in
    // the editor column.
    contribution(
      LoopEditorView,
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
        keybinding: 'Mod+Alt+O',
        run: async ({ workspace }) => {
          // The chat first, because the surface lives beside it; then the
          // surface itself. Switching the view alone leaves whichever surface
          // was already open, so on the chat view — where a reader usually is
          // — this used to do nothing at all.
          workspace.setActiveViewType('chat');
          if (!requestSurface('document')) {
            throw new Error(
              'No chat is on screen to open the document beside.',
            );
          }
        },
      },
      { id: 'document' },
    ),
  ],
  build: ctx => {
    /*
     * The document's tools, contributed when their module arrives.
     *
     * `lexicalHooks` imports `@datalayer/jupyter-lexical` at module load —
     * the exact import this plugin keeps out of its own entry so a workspace
     * only pays for lexical when a document exists. A static contribution
     * would smuggle it back in. The reactor takes contributions at any time
     * and bumps its revision, so the chat re-reads its tools point the
     * moment these land.
     */
    void import('../../../tools/adapters/agent-runtimes/lexicalHooks').then(
      ({ createLexicalTools }) => {
        ctx.contribute(
          LoopFrontendTool,
          {
            id: 'document-tools',
            tools: workspace => createLexicalTools(workspace.surfaceId),
          },
          { id: 'document-tools' },
        );
      },
    );
    return {};
  },
});

export default DocumentPlugin;
