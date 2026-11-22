/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The document toolbar plugin's module.
 *
 * @module apps/plugins/document-toolbar/plugin
 */

import { contribution, definePlugin } from '@datalayer/reactor';
import type { ToolbarItem } from '@datalayer/primer-addons';
import { AgentDocumentToolbar } from '../../core';
import { SandboxStatusItem } from './SandboxStatusItem';
import { DOCUMENT_TOOLBAR_PLUGIN_NAME } from './names';
import { uiManifestOf } from '../../uiManifest';

/** Trailing edge, past whatever the Lexical toolbar puts there itself. */
const STATUS_ORDER = 1000;

export const DocumentToolbarPlugin = definePlugin({
  name: DOCUMENT_TOOLBAR_PLUGIN_NAME,
  ...uiManifestOf('document-toolbar'),
  contributes: [
    contribution(
      AgentDocumentToolbar,
      {
        items: (): ToolbarItem[] => [
          {
            key: 'agent-document-status-spacer',
            type: 'spacer',
            order: STATUS_ORDER - 1,
          },
          {
            key: 'agent-document-sandbox-status',
            type: 'custom',
            order: STATUS_ORDER,
            group: 'sandbox',
            render: () => <SandboxStatusItem />,
          },
        ],
      },
      { id: 'toolbar', order: 100 },
    ),
  ],
});

export default DocumentToolbarPlugin;
