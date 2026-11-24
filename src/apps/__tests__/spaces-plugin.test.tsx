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
  live: {} as Record<string, unknown>,
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

// The notebooks drawn on the page, by the id each is drawn under.
vi.mock('../../chat/notebook/liveNotebookModel', () => ({
  liveNotebookModel: (id: string) => state.live[id] ?? null,
}));

// The editors are heavy: a tab draws what it holds instead.
vi.mock('../plugins/spaces/SpaceItemView', () => ({
  default: ({ item }: { item: { uid: string; type: string } }) => (
    <div data-testid="item-view" data-uid={item.uid} data-type={item.type} />
  ),
}));

const { ItemTypes } = await import('@datalayer/core/lib/client');
const { spacesTools, SPACES_WORDS, SPACES_TOOL_NAMES } =
  await import('../plugins/spaces/tools');
const {
  openSpaceItemsOf,
  openSpaceItemOf,
  resetSpaceItems,
  spaceItemViewId,
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
    // As Spacer's client answers them, typed as LexicalDTO and NotebookDTO
    // say (core's ItemTypes: a lexical document is `document`); a space
    // holds other kinds too.
    getSpaceItems: vi.fn(async () => [
      item('doc-1', ItemTypes.LEXICAL, 'Report', DOCUMENT_STATE),
      item('nb-1', ItemTypes.NOTEBOOK, 'Analysis', NOTEBOOK),
      item('cell-1', ItemTypes.CELL, 'A cell', ''),
    ]),
    getLexical: vi.fn(async (uid: string) =>
      item(uid, ItemTypes.LEXICAL, 'Report', DOCUMENT_STATE),
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
  state.live = {};
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
    // A lexical document is listed as a document.
    const documents = (await call('spacesListItemsOfType', {
      spaceUid: 'space-1',
      type: 'document',
    })) as { items: Array<{ uid: string; type: string }> };
    expect(documents.items).toEqual([
      {
        uid: 'doc-1',
        type: 'document',
        name: 'Report',
        description: 'Report described',
      },
    ]);
  });

  it('list a space’s documents in the panel, under All and Documents', async () => {
    render(<SpacesPanel conversation="c1" />);
    fireEvent.click(await screen.findByText('Research'));
    expect(await screen.findByText('Report')).toBeTruthy();
    expect(screen.getByText('Analysis')).toBeTruthy();
    expect(screen.queryByText('A cell')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Documents' }));
    await waitFor(() => expect(screen.queryByText('Analysis')).toBeNull());
    expect(await screen.findByText('Report')).toBeTruthy();
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

  it('are tabs a keyboard moves through, each controlling the panel it labels', async () => {
    await call('spacesOpenItem', { uid: 'nb-1', type: 'notebook' });
    await call('spacesOpenItem', { uid: 'doc-1', type: 'document' });
    render(<SpacesPanel conversation="c1" />);
    const tabs = () => screen.getAllByRole('tab');
    const panel = screen.getByRole('tabpanel');
    const shown = () =>
      tabs().find(tab => tab.getAttribute('aria-selected') === 'true')!;
    // The shown tab alone in the Tab order, labelling the panel it controls.
    expect(shown().textContent).toBe('Report');
    expect(tabs().map(tab => tab.tabIndex)).toEqual([-1, -1, 0]);
    for (const tab of tabs()) {
      expect(tab.getAttribute('aria-controls')).toBe(panel.id);
    }
    expect(panel.getAttribute('aria-labelledby')).toBe(shown().id);
    // Right wraps to the first, Left goes back, End and Home to the ends.
    fireEvent.keyDown(shown(), { key: 'ArrowRight' });
    expect(shown().textContent).toBe('Spaces');
    expect(document.activeElement).toBe(shown());
    expect(screen.queryByTestId('item-view')).toBeNull();
    fireEvent.keyDown(shown(), { key: 'ArrowRight' });
    expect(shown().textContent).toBe('Analysis');
    expect(screen.getByTestId('item-view').getAttribute('data-uid')).toBe(
      'nb-1',
    );
    fireEvent.keyDown(shown(), { key: 'ArrowLeft' });
    expect(shown().textContent).toBe('Spaces');
    fireEvent.keyDown(shown(), { key: 'End' });
    expect(shown().textContent).toBe('Report');
    expect(document.activeElement).toBe(shown());
    fireEvent.keyDown(shown(), { key: 'Home' });
    expect(shown().textContent).toBe('Spaces');
    expect(tabs().map(tab => tab.tabIndex)).toEqual([0, -1, -1]);
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(
      shown().id,
    );
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
    updateSpaceItemContent(
      'doc-1',
      JSON.stringify(edited),
      'c1',
      openSpaceItemOf('doc-1', 'c1')!.loaded,
    );
    const answer = await call('spacesSaveItem', {});
    expect(answer).toEqual({
      uid: 'doc-1',
      type: 'document',
      name: 'Report',
      saved: true,
    });
    // As JSON text, as the Spacer client sends it.
    expect(state.client.updateLexicalModel).toHaveBeenCalledWith(
      'doc-1',
      JSON.stringify(edited),
    );
  });

  it('writes a notebook as its tab holds it, named or shown', async () => {
    await call('spacesOpenItem', { uid: 'nb-1', type: 'notebook' });
    await call('spacesOpenItem', { uid: 'doc-1', type: 'document' });
    const edited = { ...NOTEBOOK, cells: [] };
    updateSpaceItemContent(
      'nb-1',
      edited,
      'c1',
      openSpaceItemOf('nb-1', 'c1')!.loaded,
    );
    await call('spacesSaveItem', { uid: 'nb-1' });
    expect(state.client.updateNotebookModel).toHaveBeenCalledWith(
      'nb-1',
      edited,
    );
    expect(state.client.updateLexicalModel).not.toHaveBeenCalled();
  });

  it('writes a notebook drawn in its tab as it stands at the save, not as it last said', async () => {
    await call('spacesOpenItem', { uid: 'nb-1', type: 'notebook' });
    const said = { ...NOTEBOOK, cells: [] };
    updateSpaceItemContent(
      'nb-1',
      said,
      'c1',
      openSpaceItemOf('nb-1', 'c1')!.loaded,
    );
    // An edit made since: the view says it only at its next half second.
    const live = {
      ...NOTEBOOK,
      cells: [
        { cell_type: 'code', source: 'print(2)', outputs: [], metadata: {} },
      ],
    };
    state.live[spaceItemViewId('nb-1', 'c1')] = live;
    await call('spacesSaveItem', {});
    expect(state.client.updateNotebookModel).toHaveBeenCalledWith('nb-1', live);
    expect(openSpaceItemOf('nb-1', 'c1')!.current).toEqual(live);
    // Its tab no longer drawn: what it last said.
    delete state.live[spaceItemViewId('nb-1', 'c1')];
    state.client.updateNotebookModel.mockClear();
    await call('spacesSaveItem', {});
    expect(state.client.updateNotebookModel).toHaveBeenCalledWith('nb-1', live);
  });

  it('is not overwritten by the view of a load it replaced', async () => {
    await call('spacesOpenItem', { uid: 'nb-1', type: 'notebook' });
    const first = openSpaceItemOf('nb-1', 'c1')!.loaded;
    await call('spacesOpenItem', { uid: 'nb-1', type: 'notebook' });
    const second = openSpaceItemOf('nb-1', 'c1')!;
    expect(second.loaded).not.toBe(first);
    // The outgoing view flushes its old model as it unmounts.
    updateSpaceItemContent('nb-1', { ...NOTEBOOK, cells: [] }, 'c1', first);
    expect(openSpaceItemOf('nb-1', 'c1')!.current).toEqual(NOTEBOOK);
    // The view of the new load is heard.
    const edited = { ...NOTEBOOK, metadata: { edited: true } };
    updateSpaceItemContent('nb-1', edited, 'c1', second.loaded);
    expect(openSpaceItemOf('nb-1', 'c1')!.current).toEqual(edited);
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
      JSON.stringify(DOCUMENT_STATE),
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
