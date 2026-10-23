/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { describe, expect, it } from 'vitest';
import {
  isChatViewTool,
  isInactiveSurfaceContribution,
  orderToolContributions,
  toolsForChatView,
} from '../plugins/chat/chatViewTools';

describe('the chat view toolset', () => {
  it('keeps the kernel tools and the read and list tools', () => {
    for (const name of [
      'executeCodeInNotebook',
      'datalayer_executeCodeInNotebook',
      'executeCodeInDocument',
      'datalayer_executeCodeInDocument',
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
      { name: 'executeCodeInNotebook' },
    ];
    expect(toolsForChatView(tools).map(tool => tool.name)).toEqual([
      'readAllCells',
      'executeCodeInNotebook',
    ]);
  });

  it('keeps what a contribution vouched for, whatever its name', () => {
    const tools = [
      { name: 'decks_create_deck' },
      { name: 'insertCell' },
      { name: 'readAllCells' },
    ];
    expect(
      toolsForChatView(tools, new Set(['decks_create_deck'])).map(
        tool => tool.name,
      ),
    ).toEqual(['decks_create_deck', 'readAllCells']);
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

  describe('isInactiveSurfaceContribution', () => {
    const surfaceIds = new Set(['notebook', 'document']);

    it('withholds the surface that is not on screen', () => {
      expect(
        isInactiveSurfaceContribution('notebook-tools', surfaceIds, 'document'),
      ).toBe(true);
      expect(
        isInactiveSurfaceContribution('document-tools', surfaceIds, 'notebook'),
      ).toBe(true);
    });

    it('keeps the active surface’s own tools', () => {
      expect(
        isInactiveSurfaceContribution('document-tools', surfaceIds, 'document'),
      ).toBe(false);
      expect(
        isInactiveSurfaceContribution('notebook-tools', surfaceIds, 'notebook'),
      ).toBe(false);
    });

    it('withholds nothing while no editor is on screen', () => {
      expect(
        isInactiveSurfaceContribution('notebook-tools', surfaceIds, undefined),
      ).toBe(false);
      expect(
        isInactiveSurfaceContribution('document-tools', surfaceIds, undefined),
      ).toBe(false);
    });

    it('never withholds a contribution that was never tied to a surface', () => {
      // Not a `-tools` id at all.
      expect(
        isInactiveSurfaceContribution('chat-extras', surfaceIds, 'document'),
      ).toBe(false);
      // Ends in `-tools`, but names a surface this workspace doesn't have.
      expect(
        isInactiveSurfaceContribution('decks-tools', surfaceIds, 'document'),
      ).toBe(false);
    });
  });
});
