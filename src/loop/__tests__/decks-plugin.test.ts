/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The decks plugin in a Loop: it contributes the surface and follows the
 * decks, and declares no tools of its own — the decks plugin's bundle, run
 * through the chat's command adapter, is the whole of what an agent gets.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildReactorFromPlugins } from '@datalayer/reactor';
import { clearDecks, deckById, registerDecks } from '@datalayer/decks';
import type { DeckSpec } from '@datalayer/decks';
import {
  DECKS_AGENT_TOOLS,
  DecksPlugin,
  getDecksState,
  resetDecksState,
} from '@datalayer/decks/plugin';
import { agentBundleTools } from '../../tools/adapters/commands';
import { LoopEditorView, LoopFrontendTool } from '../core';
import { DECK_SURFACE_ID, LoopDecksPlugin } from '../plugins/decks';

const spec = (title: string, slides = 3): DeckSpec =>
  ({
    deck: { title, template: 'datalayer' },
    slides: Array.from({ length: slides }, (_, i) => ({
      type: 'section',
      title: `${i + 1}`,
    })),
  }) as DeckSpec;

beforeEach(() => {
  vi.clearAllMocks();
  resetDecksState();
  clearDecks();
});

describe('the deck tools an agent gets', () => {
  const EXPECTED = [
    'decks_list_decks',
    'decks_get_deck',
    'decks_create_deck',
    'decks_update_deck',
    'decks_update_slide',
    'decks_insert_slide',
    'decks_delete_slide',
    'decks_delete_deck',
    'decks_list',
    'decks_open',
    'decks_go_to_slide',
    'decks_next_slide',
    'decks_previous_slide',
    'decks_present',
    'decks_print',
  ];

  it('are the decks plugin’s bundle, data and screen alike, and nothing of the Loop’s', () => {
    expect(DECKS_AGENT_TOOLS.commands.map(tool => tool.name)).toEqual(EXPECTED);
    const contributes = LoopDecksPlugin.contributes ?? [];
    expect(contributes.some(entry => entry.point === LoopFrontendTool)).toBe(
      false,
    );
  });

  it('run as the plugin’s commands on the reactor, and answer with what the command returned', async () => {
    const reactor = buildReactorFromPlugins([DecksPlugin]);
    reactor.start();
    await reactor.whenReady();
    registerDecks([
      { collection: 'c', slug: 'one', spec: spec('One', 4), source: 'bundled' },
    ]);
    const tools = Object.fromEntries(
      agentBundleTools(DECKS_AGENT_TOOLS, reactor).map(tool => [
        tool.name,
        tool,
      ]),
    );
    expect(Object.keys(tools)).toEqual(EXPECTED);
    for (const tool of Object.values(tools)) {
      expect(tool.location).toBe('frontend');
    }
    expect(await tools.decks_list_decks.handler!({})).toEqual([
      expect.objectContaining({ id: 'c/one', title: 'One', slides: 4 }),
    ]);
    const made = (await tools.decks_create_deck.handler!({
      collection: 'talks',
      slug: 'Hello, World',
      spec: spec('Hello'),
    })) as { id: string; issues: string[] };
    expect(made).toMatchObject({ id: 'talks/hello-world', issues: [] });
    expect(deckById('talks/hello-world')).toBeDefined();
    // Made and opened: the store's `revealed` is what brings the surface.
    expect(getDecksState().selected).toBe('talks/hello-world');
    const got = (await tools.decks_get_deck.handler!({ id: 'c/one' })) as {
      outline: { slide: number }[];
    };
    expect(got.outline.map(o => o.slide)).toEqual([1, 2, 3, 4]);
    expect(await tools.decks_open.handler!({ id: 'c/one', slide: 2 })).toEqual({
      ok: true,
      id: 'c/one',
      slide: 2,
    });
    expect(await tools.decks_next_slide.handler!({})).toEqual({
      ok: true,
      slide: 3,
    });
    const edited = (await tools.decks_update_slide.handler!({
      id: 'c/one',
      slide: 4,
      slide_spec: { type: 'statement', statement: 'Fin' },
    })) as { outline: { type: string }[] };
    expect(edited.outline.at(-1)?.type).toBe('statement');
    expect(getDecksState()).toMatchObject({ selected: 'c/one', slide: 4 });
    await expect(tools.decks_get_deck.handler!({})).rejects.toThrow(
      /Which deck/,
    );
    expect(await tools.decks_present.handler!({})).toMatchObject({
      ok: false,
    });
    reactor.stop();
  });
});

describe('LoopDecksPlugin', () => {
  it('brings the deck surface on screen whenever decks are asked for', async () => {
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

  it('contributes the deck surface, and depends on the decks plugin and the composer', () => {
    const contributes = LoopDecksPlugin.contributes ?? [];
    const surface = contributes.find(entry => entry.point === LoopEditorView);
    expect(surface?.value).toMatchObject({
      surfaceId: DECK_SURFACE_ID,
      title: 'Deck',
    });
    expect(LoopDecksPlugin.dependencies?.length).toBe(2);
  });
});
