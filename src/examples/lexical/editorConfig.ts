/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListNode, ListItemNode } from '@lexical/list';
import { CodeNode, CodeHighlightNode } from '@lexical/code';
import { LinkNode, AutoLinkNode } from '@lexical/link';
import { TableNode, TableCellNode, TableRowNode } from '@lexical/table';
import { HashtagNode } from '@lexical/hashtag';
import { MarkNode } from '@lexical/mark';
import { OverflowNode } from '@lexical/overflow';
import { HorizontalRuleNode } from '@lexical/react/LexicalHorizontalRuleNode';
import {
  EquationNode,
  ImageNode,
  YouTubeNode,
  JupyterCellNode,
  JupyterInputNode,
  JupyterInputHighlightNode,
  JupyterOutputNode,
  InlineCompletionNode,
} from '@datalayer/jupyter-lexical';

import { lexicalTheme } from './theme';

/**
 * Lexical editor configuration
 */
export const editorConfig = {
  namespace: 'AgUiLexicalEditor',
  editable: true,
  theme: lexicalTheme,
  nodes: [
    // Basic rich text nodes
    HeadingNode,
    QuoteNode,
    ListNode,
    ListItemNode,
    CodeNode,
    CodeHighlightNode,
    LinkNode,
    AutoLinkNode,
    // Table nodes
    TableNode,
    TableCellNode,
    TableRowNode,
    // Additional nodes from @lexical packages
    HashtagNode,
    MarkNode,
    OverflowNode,
    HorizontalRuleNode,
    // Simple lexical nodes
    EquationNode,
    ImageNode,
    YouTubeNode,
    JupyterCellNode,
    JupyterInputNode,
    JupyterInputHighlightNode,
    JupyterOutputNode,
    InlineCompletionNode,
  ],
  onError(_error: Error) {
    // Lexical error handler
  },
};
