/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The `decks` tool bundle, implemented in the page.
 *
 * The agentspec bundle (`reactor-tools/decks.yaml`) declares the tools — their
 * names, what they say to the model, their arguments — and this module gives
 * every one of them an implementation against the decks plugin mounted in
 * this workspace: the catalog for the read and write tools, the store for the
 * ones that steer the deck on screen. So the model sees the *same* tools
 * whether the agent runs here in the browser or on a server with the decks
 * backend behind it, and in the browser no server is needed at all — the
 * plugin still saves to one when it was given one.
 *
 * Contributed through `LoopFrontendTool`, which is what makes this the single
 * source of the deck tools in a Loop: the chat folds the spec's own reactor
 * tools in *after* the contributions, name by name, so nothing here is
 * registered twice.
 *
 * @module loop/plugins/decks/deckTools
 */

import { deckById, deckId, listDecks, type DeckEntry } from '@datalayer/decks';
import {
  addDeck,
  closeDeck,
  getDecksState,
  goToSlide,
  nextSlide,
  openDeck,
  presentOpenDeck,
  previousSlide,
  printOpenDeck,
  removeDeck,
  replaceDeck,
} from '@datalayer/decks/plugin';
import type { DeckSpec } from '@datalayer/decks';
import { REACTOR_TOOL_CATALOG } from '../../../specs/reactorTools';
import type { FrontendToolDefinition, ReactorToolSpec } from '../../../types';
import { requestSurface, type LoopWorkspaceContext } from '../../core';

/** The editor surface the deck is shown on. */
export const DECK_SURFACE_ID = 'deck';

const NO_ARGUMENTS = { type: 'object', properties: {} } as const;

type Args = Record<string, unknown>;
type Handler = (args: Args) => Promise<unknown>;

const summary = (entry: DeckEntry) => ({
  id: deckId(entry),
  collection: entry.collection,
  slug: entry.slug,
  title: entry.spec.deck.title,
  subtitle: entry.spec.deck.subtitle,
  slides: entry.spec.slides.length,
  source: entry.source,
});

const idOf = (args: Args): string => {
  const id = args.id;
  if (typeof id !== 'string' || !id) {
    throw new Error(
      'Which deck? Pass its `id`, as listed by decks_list_decks.',
    );
  }
  return id;
};

const written = (
  entry: DeckEntry,
  issues: { where: string; message: string }[],
) => ({
  ...summary(entry),
  issues: issues.map(issue => `${issue.where}: ${issue.message}`),
});

/**
 * The implementations, keyed by the bundle's tool names.
 *
 * `show` brings the deck surface on screen; the write tools and `decks_open`
 * call it, because a deck the agent just made and the person cannot see is a
 * tool call that looks like it did nothing.
 */
export function deckToolHandlers(show: () => void): Record<string, Handler> {
  return {
    decks_list_decks: async () => listDecks().map(summary),
    decks_get_deck: async args => {
      const id = idOf(args);
      const entry = deckById(id);
      if (!entry) {
        throw new Error(`There is no deck ${id}.`);
      }
      return { ...summary(entry), spec: entry.spec };
    },
    decks_create_deck: async args => {
      const { entry, issues } = await addDeck({
        collection:
          typeof args.collection === 'string' ? args.collection : undefined,
        slug: typeof args.slug === 'string' ? args.slug : '',
        spec: args.spec as DeckSpec,
      });
      show();
      return written(entry, issues);
    },
    decks_update_deck: async args => {
      const { entry, issues } = await replaceDeck(idOf(args), {
        collection:
          typeof args.collection === 'string' ? args.collection : undefined,
        slug: typeof args.slug === 'string' ? args.slug : undefined,
        spec: args.spec as DeckSpec,
      });
      show();
      return written(entry, issues);
    },
    decks_delete_deck: async args => {
      const id = idOf(args);
      if (!(await removeDeck(id))) {
        throw new Error(`There is no deck ${id}.`);
      }
      return { ok: true, id };
    },
    decks_list: async () => {
      closeDeck();
      return { ok: true, decks: listDecks().map(summary) };
    },
    decks_open: async args => {
      const id = idOf(args);
      if (!deckById(id)) {
        throw new Error(`There is no deck ${id}.`);
      }
      const slide = typeof args.slide === 'number' ? args.slide : 1;
      openDeck(id, slide);
      show();
      return { ok: true, id, slide: getDecksState().slide };
    },
    decks_go_to_slide: async args => {
      if (typeof args.slide !== 'number') {
        throw new Error('Pass the 1-based `slide` number.');
      }
      goToSlide(args.slide);
      show();
      return { ok: true, slide: getDecksState().slide };
    },
    decks_next_slide: async () => {
      nextSlide();
      return { ok: true, slide: getDecksState().slide };
    },
    decks_previous_slide: async () => {
      previousSlide();
      return { ok: true, slide: getDecksState().slide };
    },
    decks_present: async () => {
      if (!presentOpenDeck()) {
        throw new Error('No deck is on screen to present. Open one first.');
      }
      return { ok: true };
    },
    decks_print: async () => {
      const path = printOpenDeck();
      if (!path) {
        throw new Error('No deck is open to print. Open one first.');
      }
      return { ok: true, path };
    },
  };
}

/**
 * The bundle as frontend tools for this workspace.
 *
 * Names, descriptions and schemas come from the spec, so what the model is
 * told matches what a server-side harness would tell it; only the handler is
 * this page's. A tool the spec names and this module does not implement is
 * left out rather than registered as a stub.
 */
export function createDeckTools(
  workspace: LoopWorkspaceContext,
  spec: ReactorToolSpec | undefined = REACTOR_TOOL_CATALOG.decks,
): FrontendToolDefinition[] {
  if (!spec) {
    return [];
  }
  const show = () => {
    workspace.setActiveViewType('chat');
    requestSurface(DECK_SURFACE_ID);
  };
  const handlers = deckToolHandlers(show);
  const declared = [
    ...spec.frontend.map(entry => ({
      name: entry.name,
      description: entry.description,
      parameters: entry.parameters,
    })),
    ...(spec.backend?.tools ?? []).map(entry => ({
      name: entry.name,
      description: entry.description,
      parameters: entry.parameters,
    })),
  ];
  return declared.flatMap(entry => {
    const handler = handlers[entry.name];
    if (!handler) {
      return [];
    }
    return [
      {
        name: entry.name,
        description: entry.description,
        parameters: entry.parameters ?? NO_ARGUMENTS,
        location: 'frontend' as const,
        handler,
      },
    ];
  });
}
