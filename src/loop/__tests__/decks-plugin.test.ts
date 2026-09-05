/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The decks plugin in a Loop: every tool the `decks` bundle declares has an
 * implementation here, the write tools bring the deck on screen, and the
 * plugin contributes the surface and the tools the way the notebook does.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearDecks,
  deckById,
  listDecks,
  registerDecks,
} from '@datalayer/decks';
import { getDecksState, resetDecksState } from '@datalayer/decks/plugin';
import type { DeckSpec } from '@datalayer/decks';
import { DECKS_AGENT_TOOLS } from '@datalayer/decks/plugin';
import { TOOL_CATALOG } from '../../specs/tools';
import {
  LoopEditorView,
  LoopFrontendTool,
  type LoopWorkspaceContext,
} from '../core';
import {
  DECK_SURFACE_ID,
  LoopDecksPlugin,
  createDeckTools,
} from '../plugins/decks';
import { DECK_TOOL_DEFINITIONS } from '../plugins/decks/deckTools';

vi.mock('../core', async importOriginal => {
  const actual = await importOriginal<typeof import('../core')>();
  return { ...actual, requestSurface: vi.fn(() => true) };
});
const { requestSurface } = await import('../core');

const spec = (title: string, slides = 3): DeckSpec =>
  ({
    deck: { title, template: 'datalayer' },
    slides: Array.from({ length: slides }, (_, i) => ({
      type: 'section',
      title: `${i + 1}`,
    })),
  }) as DeckSpec;

const workspace = {
  setActiveViewType: vi.fn(),
  surfaceId: 'deck',
} as unknown as LoopWorkspaceContext;

const toolsByName = () =>
  Object.fromEntries(createDeckTools(workspace).map(tool => [tool.name, tool]));

beforeEach(() => {
  vi.clearAllMocks();
  resetDecksState();
  clearDecks();
});

describe('createDeckTools', () => {
  it('implements every tool declared, the plugin’s commands and the backend alike', () => {
    const declared = [
      ...DECKS_AGENT_TOOLS.commands.map(entry => entry.name),
      ...Object.values(TOOL_CATALOG)
        .filter(tool => tool.id.startsWith('decks-'))
        .map(tool => tool.runtime.method),
    ];
    const tools = toolsByName();
    expect(Object.keys(tools).sort()).toEqual([...declared].sort());
    // The command tools say what the plugin's bundle says.
    const open = DECKS_AGENT_TOOLS.commands.find(
      entry => entry.name === 'decks_open',
    )!;
    expect(tools.decks_open.parameters).toEqual(open.parameters);
    expect(tools.decks_open.description).toBe(open.description);
    for (const tool of Object.values(tools)) {
      expect(tool.location).toBe('frontend');
      expect(typeof tool.handler).toBe('function');
    }
    expect(DECK_TOOL_DEFINITIONS.map(d => d.name)).toEqual(Object.keys(tools));
  });

  it('creates a deck in the page, opens it and shows the deck surface', async () => {
    const tools = toolsByName();
    const result = (await tools.decks_create_deck.handler!({
      collection: 'talks',
      slug: 'Hello, World',
      spec: spec('Hello'),
    })) as { id: string; slides: number; issues: string[] };
    expect(result).toMatchObject({
      id: 'talks/hello-world',
      slides: 3,
      issues: [],
    });
    expect(deckById('talks/hello-world')).toBeDefined();
    expect(getDecksState().selected).toBe('talks/hello-world');
    expect(workspace.setActiveViewType).toHaveBeenCalledWith('chat');
    expect(requestSurface).toHaveBeenCalledWith(DECK_SURFACE_ID);
  });

  it('lists, reads, steers and replaces what is in the catalog', async () => {
    registerDecks([
      { collection: 'c', slug: 'one', spec: spec('One', 4), source: 'bundled' },
    ]);
    const tools = toolsByName();
    expect(await tools.decks_list_decks.handler!({})).toEqual([
      expect.objectContaining({ id: 'c/one', title: 'One', slides: 4 }),
    ]);
    expect(await tools.decks_get_deck.handler!({ id: 'c/one' })).toMatchObject({
      id: 'c/one',
      spec: expect.objectContaining({
        deck: expect.objectContaining({ title: 'One' }),
      }),
    });
    await tools.decks_open.handler!({ id: 'c/one', slide: 2 });
    expect(getDecksState()).toMatchObject({ selected: 'c/one', slide: 2 });
    await tools.decks_next_slide.handler!({});
    await tools.decks_go_to_slide.handler!({ slide: 4 });
    expect(getDecksState().slide).toBe(4);
    await tools.decks_update_deck.handler!({
      id: 'c/one',
      slug: 'one',
      spec: spec('One, cut', 2),
    });
    expect(deckById('c/one')?.spec.deck.title).toBe('One, cut');
    expect(getDecksState().slide).toBe(2);
    await tools.decks_list.handler!({});
    expect(getDecksState().selected).toBeUndefined();
    expect(await tools.decks_delete_deck.handler!({ id: 'c/one' })).toEqual({
      ok: true,
      id: 'c/one',
    });
    expect(listDecks()).toEqual([]);
  });

  it('edits one slide at a time, with an outline to find it by', async () => {
    registerDecks([
      { collection: 'c', slug: 'one', spec: spec('One', 3), source: 'bundled' },
    ]);
    const tools = toolsByName();
    const got = (await tools.decks_get_deck.handler!({ id: 'c/one' })) as {
      outline: unknown[];
    };
    expect(got.outline).toEqual([
      { slide: 1, type: 'section', title: '1' },
      { slide: 2, type: 'section', title: '2' },
      { slide: 3, type: 'section', title: '3' },
    ]);
    const updated = (await tools.decks_update_slide.handler!({
      id: 'c/one',
      slide: 2,
      slide_spec: { type: 'two-columns', title: 'Compared' },
    })) as { outline: { type: string }[] };
    expect(updated.outline.map(o => o.type)).toEqual([
      'section',
      'two-columns',
      'section',
    ]);
    expect(getDecksState()).toMatchObject({ selected: 'c/one', slide: 2 });
    const inserted = (await tools.decks_insert_slide.handler!({
      id: 'c/one',
      slide: 99,
      slide_spec: { type: 'statement', statement: 'Fin' },
    })) as { outline: { type: string; title: string }[] };
    expect(inserted.outline.at(-1)).toEqual({
      slide: 4,
      type: 'statement',
      title: 'Fin',
    });
    const deleted = (await tools.decks_delete_slide.handler!({
      id: 'c/one',
      slide: 1,
    })) as { slides: number };
    expect(deleted.slides).toBe(3);
    await expect(
      tools.decks_update_slide.handler!({
        id: 'c/one',
        slide: 9,
        slide_spec: {},
      }),
    ).rejects.toThrow(/no slide 9/);
  });

  it('answers a bad request with a message the model can act on', async () => {
    const tools = toolsByName();
    await expect(tools.decks_open.handler!({ id: 'nope' })).rejects.toThrow(
      /no deck nope/,
    );
    await expect(tools.decks_get_deck.handler!({})).rejects.toThrow(
      /Which deck/,
    );
    await expect(tools.decks_present.handler!({})).rejects.toThrow(
      /No deck is on screen/,
    );
    await expect(tools.decks_print.handler!({})).rejects.toThrow(
      /No deck is open/,
    );
    await expect(
      tools.decks_create_deck.handler!({ slug: 'x', spec: { deck: {} } }),
    ).rejects.toThrow(/deck\.title/);
  });
});

describe('LoopDecksPlugin', () => {
  it('brings the deck surface on screen whenever decks are asked for', async () => {
    const { buildReactorFromPlugins } = await import('@datalayer/reactor');
    const editorChoice = await import('../plugins/shell/editorChoice');
    const choose = vi.spyOn(editorChoice, 'chooseEditor').mockReturnValue(true);
    const reactor = buildReactorFromPlugins([LoopDecksPlugin]);
    reactor.start();
    await reactor.whenReady();
    const { closeDeck, openDeck } = await import('@datalayer/decks/plugin');
    registerDecks([
      { collection: 'c', slug: 'one', spec: spec('One'), source: 'bundled' },
    ]);
    closeDeck(); // nothing was open: still an ask to see the list
    openDeck('c/one');
    expect(choose.mock.calls.map(call => call[0])).toEqual([
      DECK_SURFACE_ID,
      DECK_SURFACE_ID,
    ]);
    reactor.stop();
    choose.mockRestore();
  });

  it('contributes the deck surface and vouches for its tools in the chat view', () => {
    const contributes = LoopDecksPlugin.contributes ?? [];
    const surface = contributes.find(entry => entry.point === LoopEditorView);
    expect(surface?.value).toMatchObject({
      surfaceId: DECK_SURFACE_ID,
      title: 'Deck',
    });
    const tools = contributes.find(entry => entry.point === LoopFrontendTool);
    expect(tools?.value).toMatchObject({ id: 'deck-tools', chatView: true });
    expect(LoopDecksPlugin.dependencies?.length).toBe(2);
  });
});
