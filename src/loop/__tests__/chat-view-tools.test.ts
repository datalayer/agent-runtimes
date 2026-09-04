/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { describe, expect, it } from 'vitest';
import {
  isChatViewTool,
  orderToolContributions,
  toolsForChatView,
} from '../plugins/chat/chatViewTools';

describe('the chat view toolset', () => {
  it('keeps executeCode and the read and list tools', () => {
    for (const name of [
      'executeCode',
      'datalayer_executeCode',
      'datalayer_executeCode_lexical',
      'readCell',
      'readAllCells',
      'datalayer_readAllBlocks',
      'listAvailableBlocks',
    ]) {
      expect(isChatViewTool(name), name).toBe(true);
    }
  });

  it('withholds everything that changes a notebook or a document', () => {
    for (const name of [
      'insertCell',
      'updateCell',
      'runCell',
      'deleteCells',
      'proposeCellUpdate',
      'datalayer_insertBlock',
      'runBlock',
      'runAllBlocks',
      'deleteBlocks',
    ]) {
      expect(isChatViewTool(name), name).toBe(false);
    }
  });

  it('filters a toolset in place order', () => {
    const tools = [
      { name: 'readAllCells' },
      { name: 'insertCell' },
      { name: 'executeCode' },
    ];
    expect(toolsForChatView(tools).map(tool => tool.name)).toEqual([
      'readAllCells',
      'executeCode',
    ]);
  });

  it('lets the editor on screen own shared tool names, the notebook otherwise', () => {
    const entries = [
      { value: { id: 'document-tools' } },
      { value: { id: 'chat-extras' } },
      { value: { id: 'notebook-tools' } },
    ];
    const ids = (active: string | undefined) =>
      orderToolContributions(entries, active).map(entry => entry.value.id);
    expect(ids(undefined)).toEqual([
      'notebook-tools',
      'document-tools',
      'chat-extras',
    ]);
    expect(ids('document')).toEqual([
      'document-tools',
      'notebook-tools',
      'chat-extras',
    ]);
    expect(ids('notebook')).toEqual([
      'notebook-tools',
      'document-tools',
      'chat-extras',
    ]);
  });
});
