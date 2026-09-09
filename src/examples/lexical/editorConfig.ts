/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Lexical editor the examples share, as a root extension.
 *
 * `JupyterLexicalExtension` is the document — every node and behaviour of
 * `@datalayer/jupyter-lexical` — and this adds what is the examples' own:
 * their namespace, their theme, the demo content, focus on mount and the
 * overflow node. Defined once at module scope so a composer never rebuilds
 * the editor on a re-render.
 *
 * @module examples/lexical/editorConfig
 */

import { AutoFocusExtension } from '@lexical/extension';
import { OverflowExtension } from '@lexical/overflow';
import { JupyterLexicalExtension } from '@datalayer/jupyter-lexical';
import { defineExtension } from 'lexical';

import { lexicalTheme } from './theme';
import initialContent from './initial-content.json';

/**
 * Lexical editor extension
 */
export const editorExtension = defineExtension({
  name: '@datalayer/agent-runtimes/examples/Lexical',
  namespace: 'AgUiLexicalEditor',
  editable: true,
  theme: lexicalTheme,
  dependencies: [
    JupyterLexicalExtension,
    AutoFocusExtension,
    OverflowExtension,
  ],
  $initialEditorState: JSON.stringify(initialContent),
  onError(error: Error) {
    console.error('[LexicalExample]', error);
  },
});
