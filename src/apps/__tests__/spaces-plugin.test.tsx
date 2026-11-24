/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The person's Datalayer Spaces beside the conversation (the user,
 * 24 November 2026: "list spaces, list items by space, list items by space
 * and type (document, notebook) and load, display in tabs and save items"):
 * the five frontend tools on agent-runtimes' Spacer client (mocked here),
 * the tabs of the Spaces panel, and the save of what a tab holds.
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

const state = vi.hoisted(() => ({
  token: 'token-1' as string | undefined,
  spacerUrl: 'https://spacer.example' as string | undefined,
  configs: [] as Array<Record<string, unknown>>,
  client: {} as Record<string, ReturnType<typeof vi.fn>>,
  revealed: [] as string[],
}));

vi.mock('@datalayer/core/lib/state', () => ({
  iamStore: { getState: () => ({ token: state.token }) },
  coreStore: {
    getState: () => ({ configuration: { spacerUrl: state.spacerUrl } }),
  },
}));

vi.mock('../../client/AgentRuntimesClient', () => ({
  AgentRuntimesClient: class {
    constructor(config: Record<string, unknown>) {
      state.configs.push(config);
      Object.assign(this, state.client);
    }
  },
}));

vi.mock('../shell/sidePanelReveal', () => ({
  revealPanelFor: (name: string) => state.revealed.push(name),
}));

// The editors are heavy: a tab draws what it holds instead.
vi.mock('../plugins/spaces/SpaceItemView', () => ({
  default: ({ item }: { item: { uid: string; type: string } }) => (
    <div data-testid="item-view" data-uid={item.uid} data-type={item.type} />
  ),
}));

const { spacesTools, SPACES_WORDS, SPACES_TOOL_NAMES } =
  await import('../plugins/spaces/tools');
const {
  openSpaceItemsOf,
  openSpaceItemOf,
  resetSpaceItems,
  updateSpaceItemContent,
} = await import('../plugins/spaces/openItems');
const { default: SpacesPanel } = await import('../plugins/spaces/SpacesPanel');
const { spacesCallLine } = await import('../plugins/spaces');

const DOCUMENT_STATE = { root: { type: 'root', children: [] } };
const NOTEBOOK = {
  cells: [{ cell_type: 'code', source: 'print(1)', outputs: [], metadata: {} }],
  metadata: {},
  nbformat: 4,
  nbformat_minor: 5,
};

const item = (uid: string, type: string, name: string, content: unknown) => ({
  uid,
  type,
  name,
  description: `${name} described`,
  spaceId: 'space-1',
  getContent: vi.fn(async () => content),
});

function fakeClient() {
  state.client = {
    getMySpaces: vi.fn(async () => [
      {
        uid: 'space-1',
        name: 'Research',
        handle: 'research',
        variant: 'default',
        description: 'Papers',
      },
      {
        uid: 'space-2',
        name: 'Ops',
        handle: 'ops',
        variant: 'default',
        description: '',
      },
    ]),
    getSpaceItems: vi.fn(async () => [
      item('doc-1', 'document', 'Report', DOCUMENT_STATE),
      item('nb-1', 'notebook', 'Analysis', NOTEBOOK),
    ]),
    getLexical: vi.fn(async (uid: string) =>
      item(uid, 'document', 'Report', DOCUMENT_STATE),
    ),
    getNotebook: vi.fn(async (uid: string) =>
      item(uid, 'notebook', 'Analysis', JSON.stringify(NOTEBOOK)),
    ),
    updateLexicalModel: vi.fn(async () => undefined),
    updateNotebookModel: vi.fn(async () => undefined),
  };
}

const tools = spacesTools();
const call = (
  name: string,
  args: Record<string, unknown> = {},
  conversation = 'c1',
) => tools.find(tool => tool.name === name)!.handler!(args, { conversation });

beforeEach(() => {
  state.token = 'token-1';
  state.spacerUrl = 'https://spacer.example';
  state.configs = [];
  state.revealed = [];
  fakeClient();
  resetSpaceItems();
});

afterEach(() => {
  cleanup();
});

describe('the Spaces tools', () => {
  it('are the five tools, each described in words of its own', () => {
    expect(tools.map(tool => tool.name)).toEqual([...SPACES_TOOL_NAMES]);
    expect(SPACES_TOOL_NAMES).toEqual([
      'spacesList',
      'spacesListItems',
      'spacesListItemsOfType',
      'spacesOpenItem',
      'spacesSaveItem',
    ]);
    for (const tool of tools) {
      expect(tool.description.length, tool.name).toBeGreaterThan(80);
    }
  });

  it('list the spaces with the page’s sign-in and Spacer address', async () => {
    const answer = (await call('spacesList')) as Record<string, unknown>;
    expect(state.configs).toEqual([
      { token: 'token-1', spacerUrl: 'https://spacer.example' },
    ]);
    expect(answer.total).toBe(2);
    expect(answer.spaces).toEqual([
      {
        uid: 'space-1',
        name: 'Research',
        handle: 'research',
        variant: 'default',
        description: 'Papers',
      },
      {
        uid: 'space-2',
        name: 'Ops',
        handle: 'ops',
        variant: 'default',
        description: '',
      },
    ]);
  });

  it('list the items of a space, and of one type', async () => {
    const all = (await call('spacesListItems', { spaceUid: 'space-1' })) as {
      items: Array<{ uid: string; type: string }>;
    };
    expect(state.client.getSpaceItems).toHaveBeenCalledWith('space-1');
    expect(all.items.map(each => [each.uid, each.type])).toEqual([
      ['doc-1', 'document'],
      ['nb-1', 'notebook'],
    ]);
    const notebooks = (await call('spacesListItemsOfType', {
      spaceUid: 'space-1',
      type: 'notebook',
    })) as { items: Array<{ uid: string }>; type: string };
    expect(notebooks.type).toBe('notebook');
    expect(notebooks.items.map(each => each.uid)).toEqual(['nb-1']);
  });

  it('answer in a sentence, never throwing, when signed out or refused', async () => {
    state.token = undefined;
    for (const name of SPACES_TOOL_NAMES) {
      const args =
        name === 'spacesSaveItem'
          ? {}
          : { spaceUid: 'space-1', uid: 'doc-1', type: 'document' };
      const answer = await call(name, args);
      if (name === 'spacesSaveItem') {
        expect(answer).toBe(SPACES_WORDS.nothingOpen);
      } else {
        expect(answer, name).toBe(SPACES_WORDS.signedOut);
      }
    }
    expect(state.configs).toEqual([]);
    state.token = 'token-1';
    state.spacerUrl = '';
    expect(await call('spacesList')).toBe(SPACES_WORDS.noSpacer);
    state.spacerUrl = 'https://spacer.example';
    state.client.getMySpaces.mockRejectedValueOnce(
      new Error('503 Service Unavailable'),
    );
    expect(await call('spacesList')).toBe(
      SPACES_WORDS.refused('list your spaces', '503 Service Unavailable'),
    );
    expect(await call('spacesListItems', {})).toBe(SPACES_WORDS.noSpace);
    expect(
      await call('spacesListItemsOfType', {
        spaceUid: 'space-1',
        type: 'deck',
      }),
    ).toBe(SPACES_WORDS.noType('deck'));
    expect(await call('spacesOpenItem', { type: 'document' })).toBe(
      SPACES_WORDS.noItem,
    );
    expect(await call('spacesSaveItem', { uid: 'doc-9' })).toBe(
      SPACES_WORDS.notOpen('doc-9'),
    );
  });
});

describe('an item opened in a tab', () => {
  it('is loaded from its space and opened in the conversation, its panel revealed', async () => {
    const answer = await call('spacesOpenItem', {
      uid: 'doc-1',
      type: 'document',
    });
    expect(answer).toEqual({
      uid: 'doc-1',
      type: 'document',
      name: 'Report',
      spaceUid: 'space-1',
      opened: true,
    });
    expect(state.client.getLexical).toHaveBeenCalledWith('doc-1');
    expect(state.revealed).toEqual(['spacesOpenItem']);
    const held = openSpaceItemsOf('c1');
    expect(held.selected).toBe('doc-1');
    expect(held.items[0].content).toBe(JSON.stringify(DOCUMENT_STATE));
    // Another conversation has none of it.
    expect(openSpaceItemsOf('c2').items).toEqual([]);

    await call('spacesOpenItem', { uid: 'nb-1', type: 'notebook' });
    expect(state.client.getNotebook).toHaveBeenCalledWith('nb-1');
    expect(openSpaceItemsOf('c1').items.map(each => each.uid)).toEqual([
      'doc-1',
      'nb-1',
    ]);
    expect(openSpaceItemOf('nb-1', 'c1')?.content).toEqual(NOTEBOOK);
    expect(openSpaceItemsOf('c1').selected).toBe('nb-1');

    // Opened again, it is loaded again, in the tab where it was.
    const before = openSpaceItemOf('doc-1', 'c1')!.loaded;
    await call('spacesOpenItem', { uid: 'doc-1', type: 'document' });
    expect(openSpaceItemsOf('c1').items.map(each => each.uid)).toEqual([
      'doc-1',
      'nb-1',
    ]);
    expect(openSpaceItemOf('doc-1', 'c1')!.loaded).toBeGreaterThan(before);
  });

  it('is shown in a tab of the panel, which closes', async () => {
    render(<SpacesPanel conversation="c1" />);
    // The list of spaces, then the items of the one chosen.
    fireEvent.click(await screen.findByText('Research'));
    fireEvent.click(await screen.findByText('Analysis'));
    await waitFor(() =>
      expect(screen.getByTestId('item-view').getAttribute('data-uid')).toBe(
        'nb-1',
      ),
    );
    expect(
      screen
        .getByRole('tab', { name: /Analysis/ })
        .getAttribute('aria-selected'),
    ).toBe('true');
    // The agent opens another: its tab is shown.
    await act(async () => {
      await call('spacesOpenItem', { uid: 'doc-1', type: 'document' });
    });
    expect(screen.getByTestId('item-view').getAttribute('data-type')).toBe(
      'document',
    );
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual([
      'Spaces',
      'Analysis',
      'Report',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Close Report' }));
    expect(screen.getByTestId('item-view').getAttribute('data-uid')).toBe(
      'nb-1',
    );
    fireEvent.click(screen.getByRole('tab', { name: /Spaces/ }));
    expect(screen.queryByTestId('item-view')).toBeNull();
    expect(await screen.findByText('Research')).toBeTruthy();
  });

  it('says the person must sign in, in the panel too', async () => {
    state.token = undefined;
    render(<SpacesPanel conversation="c1" />);
    expect((await screen.findByRole('alert')).textContent).toBe(
      SPACES_WORDS.signedOut,
    );
  });
});

describe('saving an open item', () => {
  it('writes a document as its tab holds it', async () => {
    await call('spacesOpenItem', { uid: 'doc-1', type: 'document' });
    const edited = {
      root: { type: 'root', children: [{ type: 'paragraph' }] },
    };
    updateSpaceItemContent('doc-1', JSON.stringify(edited), 'c1');
    const answer = await call('spacesSaveItem', {});
    expect(answer).toEqual({
      uid: 'doc-1',
      type: 'document',
      name: 'Report',
      saved: true,
    });
    expect(state.client.updateLexicalModel).toHaveBeenCalledWith(
      'doc-1',
      edited,
    );
  });

  it('writes a notebook as its tab holds it, named or shown', async () => {
    await call('spacesOpenItem', { uid: 'nb-1', type: 'notebook' });
    await call('spacesOpenItem', { uid: 'doc-1', type: 'document' });
    const edited = { ...NOTEBOOK, cells: [] };
    updateSpaceItemContent('nb-1', edited, 'c1');
    await call('spacesSaveItem', { uid: 'nb-1' });
    expect(state.client.updateNotebookModel).toHaveBeenCalledWith(
      'nb-1',
      edited,
    );
    expect(state.client.updateLexicalModel).not.toHaveBeenCalled();
  });

  it('says so in a sentence when Spacer refuses', async () => {
    await call('spacesOpenItem', { uid: 'nb-1', type: 'notebook' });
    state.client.updateNotebookModel.mockRejectedValueOnce(
      new Error('Not authorized'),
    );
    expect(await call('spacesSaveItem', {})).toBe(
      SPACES_WORDS.refused('save this item', 'Not authorized'),
    );
  });

  it('is saved from its tab', async () => {
    await call('spacesOpenItem', { uid: 'doc-1', type: 'document' });
    render(<SpacesPanel conversation="c1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(SPACES_WORDS.saved('Report'))).toBeTruthy();
    expect(state.client.updateLexicalModel).toHaveBeenCalledWith(
      'doc-1',
      DOCUMENT_STATE,
    );
  });
});

describe('a call, in a line', () => {
  it('says what it did', () => {
    expect(spacesCallLine('spacesList', { total: 2 })).toBe('Listed 2 spaces');
    expect(spacesCallLine('spacesListItems', { total: 1 })).toBe(
      'Listed 1 item',
    );
    expect(
      spacesCallLine('spacesListItemsOfType', { total: 3, type: 'notebook' }),
    ).toBe('Listed 3 notebooks');
    expect(spacesCallLine('spacesOpenItem', { name: 'Report' })).toBe(
      'Opened Report',
    );
    expect(spacesCallLine('spacesSaveItem', { name: 'Report' })).toBe(
      'Saved Report',
    );
  });
});
