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
import { REACTOR_TOOL_CATALOG } from '../../specs/reactorTools';
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
  it('implements every tool the bundle declares, with the spec’s schemas', () => {
    const bundle = REACTOR_TOOL_CATALOG.decks;
    const declared = [
      ...bundle.frontend.map(entry => entry.name),
      ...(bundle.backend?.tools ?? []).map(entry => entry.name),
    ];
    const tools = toolsByName();
    expect(Object.keys(tools).sort()).toEqual([...declared].sort());
    expect(tools.decks_open.parameters).toEqual(
      bundle.frontend.find(entry => entry.name === 'decks_open')!.parameters,
    );
    for (const tool of Object.values(tools)) {
      expect(tool.location).toBe('frontend');
      expect(typeof tool.handler).toBe('function');
    }
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
