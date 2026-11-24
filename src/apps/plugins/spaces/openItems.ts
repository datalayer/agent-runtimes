/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Space items open in a conversation: a tab each in the Spaces panel,
 * the document in a Lexical editor, the notebook in a notebook view.
 *
 * What an item holds is kept here, not in its editor: the content it was
 * loaded with (what its view starts from) and the content as it stands (what
 * its view last said, what a save writes). A tool can open and save an item
 * whether its tab is shown or not, and a tab shown again starts from what it
 * held when it was hidden. A conversation's items are its own: another
 * thread, or another workspace on the page, has none of them.
 *
 * @module apps/plugins/spaces/openItems
 */

import type { INotebookContent } from '@jupyterlab/nbformat';

/** The kinds of Space items the panel opens. */
export const SPACE_ITEM_TYPES = ['document', 'notebook'] as const;

export type SpaceItemType = (typeof SPACE_ITEM_TYPES)[number];

/** Whether a value names a kind of item the panel opens. */
export const isSpaceItemType = (value: unknown): value is SpaceItemType =>
  (SPACE_ITEM_TYPES as readonly unknown[]).includes(value);

/** A document's content is its Lexical editor state, as JSON. */
type DocumentContent = { type: 'document'; content: string };
/** A notebook's content is its nbformat model. */
type NotebookContent = { type: 'notebook'; content: INotebookContent };

export type OpenSpaceItem = (DocumentContent | NotebookContent) & {
  uid: string;
  name: string;
  /** The space it was opened from, when known. */
  spaceUid?: string;
  /** Changes each time it is loaded: its view starts again from `content`. */
  loaded: number;
  /** Its content as its view last said it; `content` until it says. */
  current: string | INotebookContent;
};

/** What `openSpaceItem` is given: the item as Spacer answered it. */
export type LoadedSpaceItem = (DocumentContent | NotebookContent) & {
  uid: string;
  name: string;
  spaceUid?: string;
};

export type OpenSpaceItems = {
  items: readonly OpenSpaceItem[];
  /** The tab shown: an item's uid, or none for the list of spaces. */
  selected?: string;
};

const EMPTY: OpenSpaceItems = { items: [] };

const conversations = new Map<string, OpenSpaceItems>();
const listeners = new Set<() => void>();
let loads = 0;

function set(conversation: string, next: OpenSpaceItems): void {
  conversations.set(conversation, next);
  listeners.forEach(listener => listener());
}

/** The conversation's open items, and the tab shown. */
export const openSpaceItemsOf = (conversation = ''): OpenSpaceItems =>
  conversations.get(conversation) ?? EMPTY;

/** The conversation's open item `uid`, if it is open. */
export const openSpaceItemOf = (
  uid: string,
  conversation = '',
): OpenSpaceItem | undefined =>
  openSpaceItemsOf(conversation).items.find(item => item.uid === uid);

/**
 * Open an item in the conversation and show its tab; an item already open is
 * loaded again, its tab where it was.
 */
export function openSpaceItem(
  loaded: LoadedSpaceItem,
  conversation = '',
): OpenSpaceItem {
  loads += 1;
  const item = {
    ...loaded,
    loaded: loads,
    current: loaded.content,
  } as OpenSpaceItem;
  const { items } = openSpaceItemsOf(conversation);
  const at = items.findIndex(each => each.uid === item.uid);
  set(conversation, {
    items:
      at < 0
        ? [...items, item]
        : items.map((each, index) => (index === at ? item : each)),
    selected: item.uid,
  });
  return item;
}

/** What an item's view says it holds now. Nothing is redrawn for it. */
export function updateSpaceItemContent(
  uid: string,
  current: string | INotebookContent,
  conversation = '',
): void {
  const item = openSpaceItemOf(uid, conversation);
  if (item) {
    // In place: its view drew it, and redrawing it would start it again.
    item.current = current;
  }
}

/** Show a tab: an open item's, or the list of spaces for none. */
export function selectSpaceItem(
  uid: string | undefined,
  conversation = '',
): void {
  const held = openSpaceItemsOf(conversation);
  if (uid !== undefined && !held.items.some(item => item.uid === uid)) {
    return;
  }
  set(conversation, { ...held, selected: uid });
}

/** Close an item's tab; the tab before it is shown, or the list of spaces. */
export function closeSpaceItem(uid: string, conversation = ''): void {
  const held = openSpaceItemsOf(conversation);
  const at = held.items.findIndex(item => item.uid === uid);
  if (at < 0) {
    return;
  }
  const items = held.items.filter(item => item.uid !== uid);
  const selected =
    held.selected === uid ? items[Math.max(0, at - 1)]?.uid : held.selected;
  set(conversation, { items, selected });
}

export function subscribeSpaceItems(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Forget every conversation's items (tests). */
export function resetSpaceItems(): void {
  conversations.clear();
  loads = 0;
  listeners.forEach(listener => listener());
}
