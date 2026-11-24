/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The person's Datalayer Spaces as frontend tools, run in their page with
 * their own sign-in (the user, 24 November 2026: "list spaces, list items
 * by space, list items by space and type (document, notebook) and load,
 * display in tabs and save items").
 *
 * - `spacesList()`: the spaces the person belongs to;
 * - `spacesListItems({spaceUid})`: a space's documents and notebooks;
 * - `spacesListItemsOfType({spaceUid, type})`: its documents, or its notebooks;
 * - `spacesOpenItem({uid, type})`: load an item into a tab of the Spaces
 *   panel, a document in a Lexical editor, a notebook in a notebook view;
 * - `spacesSaveItem({uid?})`: write the open item back to its space.
 *
 * Everything goes through agent-runtimes' Spacer client
 * (`AgentRuntimesClient`), built for each call from the page's sign-in
 * (`iamStore`) and the platform's address (`coreStore`). Signed out, or when
 * Spacer refuses, a tool answers in a sentence and throws nothing.
 *
 * @module apps/plugins/spaces/tools
 */

import type { INotebookContent } from '@jupyterlab/nbformat';
import { coreStore, iamStore } from '@datalayer/core/lib/state';
import { AgentRuntimesClient } from '../../../client/AgentRuntimesClient';
import type { FrontendToolDefinition } from '../../../types/tools';
import { conversationOf } from '../../pageTools/conversationScope';
import { revealPanelFor } from '../../shell/sidePanelReveal';
import {
  SPACE_ITEM_TYPES,
  isSpaceItemType,
  openSpaceItem,
  openSpaceItemOf,
  openSpaceItemsOf,
  type SpaceItemType,
} from './openItems';

export const SPACES_LIST = 'spacesList';
export const SPACES_LIST_ITEMS = 'spacesListItems';
export const SPACES_LIST_ITEMS_OF_TYPE = 'spacesListItemsOfType';
export const SPACES_OPEN_ITEM = 'spacesOpenItem';
export const SPACES_SAVE_ITEM = 'spacesSaveItem';

export const SPACES_TOOL_NAMES = [
  SPACES_LIST,
  SPACES_LIST_ITEMS,
  SPACES_LIST_ITEMS_OF_TYPE,
  SPACES_OPEN_ITEM,
  SPACES_SAVE_ITEM,
] as const;

export const SPACES_WORDS = {
  signedOut:
    'The person is not signed in to Datalayer, so their Spaces cannot be reached: ask them to sign in first.',
  noSpacer:
    'This page does not know where Datalayer Spaces are, so they cannot be reached.',
  noSpace:
    'Say which space: "spaceUid" is the uid of one of the spaces spacesList answers.',
  noItem:
    'Say which item: "uid" is the uid of a document or a notebook that spacesListItems answers.',
  noType: (type: unknown) =>
    `There is no item type "${String(type ?? '')}" to list or open here: choose ${SPACE_ITEM_TYPES.join(' or ')}.`,
  nothingOpen:
    'No Space item is open in this conversation: open one with spacesOpenItem first.',
  notOpen: (uid: string) =>
    `The item ${uid} is not open in this conversation: open it with spacesOpenItem first.`,
  refused: (what: string, reason: string) =>
    `Datalayer Spaces could not ${what}: ${reason}`,
  listed: (count: number) => `Listed ${count} space${count === 1 ? '' : 's'}`,
  listedItems: (count: number, type?: string) =>
    `Listed ${count} ${type ?? 'item'}${count === 1 ? '' : 's'}`,
  opened: (name: string) => `Opened ${name || 'the item'}`,
  saved: (name: string) => `Saved ${name || 'the item'}`,
  reading: 'Reading your Spaces…',
  opening: 'Opening the item…',
  saving: 'Saving the item…',
} as const;

/** An empty notebook: what an item without content opens as. */
const EMPTY_NOTEBOOK: INotebookContent = {
  cells: [],
  metadata: {},
  nbformat: 4,
  nbformat_minor: 5,
};

/** A sentence: what a tool answers when it cannot do what it was asked. */
class Refusal extends Error {}

/** The Spacer client of the person signed in on this page. */
export function spacesClient(): AgentRuntimesClient {
  const token = String(iamStore.getState().token ?? '').trim();
  if (!token) {
    throw new Refusal(SPACES_WORDS.signedOut);
  }
  const spacerUrl = String(
    coreStore.getState().configuration?.spacerUrl ?? '',
  ).trim();
  if (!spacerUrl) {
    throw new Refusal(SPACES_WORDS.noSpacer);
  }
  return new AgentRuntimesClient({ token, spacerUrl });
}

/** A tool's handler answering a sentence for any refusal or failure. */
function answering<A extends Record<string, unknown>>(
  what: string,
  handler: (args: A, conversation: string) => Promise<unknown>,
): FrontendToolDefinition['handler'] {
  return async (args, context) => {
    try {
      return await handler(args as A, conversationOf(context));
    } catch (error) {
      if (error instanceof Refusal) {
        return error.message;
      }
      const reason = error instanceof Error ? error.message : String(error);
      return SPACES_WORDS.refused(what, reason);
    }
  };
}

const uidArg = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

/** A space, as the tools answer it. */
export type SpaceSummary = {
  uid: string;
  name: string;
  handle: string;
  variant: string;
  description: string;
};

/** A document or notebook of a space, as the tools answer it. */
export type SpaceItemSummary = {
  uid: string;
  type: SpaceItemType;
  name: string;
  description: string;
};

/** The person's spaces. */
export async function listSpaces(
  client: AgentRuntimesClient = spacesClient(),
): Promise<SpaceSummary[]> {
  const spaces = await client.getMySpaces();
  return spaces.map(space => ({
    uid: space.uid,
    name: space.name ?? '',
    handle: space.handle ?? '',
    variant: space.variant ?? '',
    description: space.description ?? '',
  }));
}

/** A space's documents and notebooks, or those of one type. */
export async function listSpaceItems(
  spaceUid: string,
  type?: SpaceItemType,
  client: AgentRuntimesClient = spacesClient(),
): Promise<SpaceItemSummary[]> {
  const items = await client.getSpaceItems(spaceUid);
  return items
    .filter(item => isSpaceItemType(item.type))
    .filter(item => !type || item.type === type)
    .map(item => ({
      uid: item.uid,
      type: item.type as SpaceItemType,
      name: item.name,
      description: item.description ?? '',
    }));
}

/** A document's content, as its Lexical editor state in JSON. */
function documentContentOf(content: unknown): string {
  if (content === undefined || content === null || content === '') {
    return '';
  }
  return typeof content === 'string' ? content : JSON.stringify(content);
}

/** A notebook's content, as nbformat writes it. */
function notebookContentOf(content: unknown): INotebookContent {
  const parsed = typeof content === 'string' ? JSON.parse(content) : content;
  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.cells)) {
    return parsed as INotebookContent;
  }
  return JSON.parse(JSON.stringify(EMPTY_NOTEBOOK)) as INotebookContent;
}

/** Load an item from its space and open it in a tab of the conversation. */
export async function loadSpaceItem(
  uid: string,
  type: SpaceItemType,
  conversation = '',
  client: AgentRuntimesClient = spacesClient(),
) {
  const item =
    type === 'document'
      ? await client.getLexical(uid)
      : await client.getNotebook(uid);
  const content = await item.getContent();
  const common = {
    uid,
    name: item.name,
    spaceUid: item.spaceId || undefined,
  };
  return openSpaceItem(
    type === 'document'
      ? { ...common, type, content: documentContentOf(content) }
      : { ...common, type, content: notebookContentOf(content) },
    conversation,
  );
}

/** Write an open item back to its space, as its tab holds it now. */
export async function saveSpaceItem(
  uid: string,
  conversation = '',
  client: AgentRuntimesClient = spacesClient(),
) {
  const item = openSpaceItemOf(uid, conversation);
  if (!item) {
    throw new Refusal(SPACES_WORDS.notOpen(uid));
  }
  if (item.type === 'document') {
    const text = item.current as string;
    await client.updateLexicalModel(uid, text ? JSON.parse(text) : '');
  } else {
    await client.updateNotebookModel(uid, item.current);
  }
  return item;
}

const SPACE_UID = {
  type: 'string',
  description: 'The uid of the space, as spacesList answers it.',
};

const ITEM_TYPE = {
  type: 'string',
  enum: [...SPACE_ITEM_TYPES],
  description:
    'document (a Lexical rich-text document) or notebook (a Jupyter notebook).',
};

/** The five tools, run in the page with the person's sign-in. */
export function spacesTools(): FrontendToolDefinition[] {
  return [
    {
      name: SPACES_LIST,
      description:
        "Lists the person's Datalayer Spaces (uid, name, handle, variant, description), read with their own sign-in. It reads and changes nothing else. Call it first to find the uid of the space whose documents and notebooks to list.",
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      handler: answering('list your spaces', async () => {
        const spaces = await listSpaces();
        return { spaces, total: spaces.length };
      }),
      summaryOf: () => 'Listed the Spaces',
    },
    {
      name: SPACES_LIST_ITEMS,
      description:
        "Lists the documents and the notebooks of one of the person's Datalayer Spaces (uid, type, name, description), given the space's uid from spacesList. It reads and changes nothing. Open one of them with spacesOpenItem.",
      parameters: {
        type: 'object',
        properties: { spaceUid: SPACE_UID },
        required: ['spaceUid'],
        additionalProperties: false,
      },
      handler: answering('list the items of this space', async args => {
        const spaceUid = uidArg(args.spaceUid);
        if (!spaceUid) {
          throw new Refusal(SPACES_WORDS.noSpace);
        }
        const items = await listSpaceItems(spaceUid);
        return { spaceUid, items, total: items.length };
      }),
      summaryOf: () => 'Listed the items of a space',
    },
    {
      name: SPACES_LIST_ITEMS_OF_TYPE,
      description:
        "Lists the items of one type of one of the person's Datalayer Spaces: its documents (type document) or its notebooks (type notebook), each with its uid, name and description. It reads and changes nothing. Open one of them with spacesOpenItem.",
      parameters: {
        type: 'object',
        properties: { spaceUid: SPACE_UID, type: ITEM_TYPE },
        required: ['spaceUid', 'type'],
        additionalProperties: false,
      },
      handler: answering('list the items of this space', async args => {
        const spaceUid = uidArg(args.spaceUid);
        if (!spaceUid) {
          throw new Refusal(SPACES_WORDS.noSpace);
        }
        if (!isSpaceItemType(args.type)) {
          throw new Refusal(SPACES_WORDS.noType(args.type));
        }
        const items = await listSpaceItems(spaceUid, args.type);
        return { spaceUid, type: args.type, items, total: items.length };
      }),
      summaryOf: () => 'Listed the items of a space',
    },
    {
      name: SPACES_OPEN_ITEM,
      description:
        "Loads a document or a notebook from the person's Datalayer Spaces and opens it in its own tab of the Spaces side panel: a document in a Lexical editor, a notebook in a notebook view, where the person reads and edits it. Opening an item already open loads it again from its space. Nothing is written back until spacesSaveItem.",
      parameters: {
        type: 'object',
        properties: {
          uid: {
            type: 'string',
            description:
              'The uid of the document or notebook, as spacesListItems answers it.',
          },
          type: ITEM_TYPE,
        },
        required: ['uid', 'type'],
        additionalProperties: false,
      },
      handler: answering('open this item', async (args, conversation) => {
        const uid = uidArg(args.uid);
        if (!uid) {
          throw new Refusal(SPACES_WORDS.noItem);
        }
        if (!isSpaceItemType(args.type)) {
          throw new Refusal(SPACES_WORDS.noType(args.type));
        }
        const item = await loadSpaceItem(uid, args.type, conversation);
        revealPanelFor(SPACES_OPEN_ITEM);
        return {
          uid: item.uid,
          type: item.type,
          name: item.name,
          spaceUid: item.spaceUid ?? '',
          opened: true,
        };
      }),
      summaryOf: () => 'Opened a Space item',
    },
    {
      name: SPACES_SAVE_ITEM,
      description:
        "Saves a document or a notebook open in the Spaces side panel back to its Datalayer Space, as its tab holds it now, the person's edits included: its content replaces the one the space held. Without a uid it saves the item whose tab is shown. Save only when the person asks for it or agreed to it.",
      parameters: {
        type: 'object',
        properties: {
          uid: {
            type: 'string',
            description:
              'The uid of the open item to save; the item whose tab is shown when unsaid.',
          },
        },
        additionalProperties: false,
      },
      handler: answering('save this item', async (args, conversation) => {
        const held = openSpaceItemsOf(conversation);
        const uid = uidArg(args.uid) || held.selected || '';
        if (!uid) {
          throw new Refusal(SPACES_WORDS.nothingOpen);
        }
        const item = await saveSpaceItem(uid, conversation);
        return { uid: item.uid, type: item.type, name: item.name, saved: true };
      }),
      summaryOf: () => 'Saved a Space item',
    },
  ];
}
