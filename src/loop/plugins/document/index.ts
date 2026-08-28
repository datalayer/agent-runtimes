/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-document` — a rich-text document the agent can drive.
 *
 * @module loop/plugins/document
 */

import { FileIcon } from '@primer/octicons-react';
import { contribution, defineExtension } from '@datalayer/reactor';
import { LoopCommand, LoopViewType } from '../../core';
import { CodeSandboxExtension } from '../code-sandbox';

export const DOCUMENT_EXTENSION_NAME = '@datalayer/loop-plugin-document';

export const DocumentExtension = defineExtension({
  name: DOCUMENT_EXTENSION_NAME,
  dependencies: [CodeSandboxExtension],
  contributes: [
    contribution(
      LoopViewType,
      {
        viewType: 'document',
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
        description: 'Open the document',
        group: 'Open',
        run: async ({ workspace }) => {
          workspace.setActiveViewType('document');
        },
      },
      { id: 'document' },
    ),
  ],
});

export default DocumentExtension;
