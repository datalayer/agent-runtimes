/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The decks tools, implemented in the page.
 *
 * The decks plugin declares its commands as agent tools (its `AgentTools`
 * bundle); the agentspecs declare the reading and writing as `tools/decks-*.yaml`
 * bound to Python callables that call the decks server. Here every one of
 * those names gets an implementation against the plugin mounted in this
 * workspace — the catalog for the read and write tools, the store for the
 * ones that steer the deck on screen — so the model sees the *same* tools
 * whether the agent runs in this browser or on a server, and in the browser
 * no server is needed at all (the plugin still saves to one when it was given
 * one).
 *
 * Contributed through `LoopFrontendTool`, which makes this the single source
 * of the deck tools in a Loop: the chat folds the bundle's own command tools
 * in *after* the contributions, name by name, so nothing is registered twice.
 *
 * @module loop/plugins/decks/deckTools
 */

import {
  deckById,
  deckId,
  listDecks,
  type DeckEntry,
  type DeckSpec,
  type SlideSpec,
} from '@datalayer/decks';
import {
  DECKS_AGENT_TOOLS,
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
import type { FrontendToolDefinition } from '../../../types';
import { requestSurface, type LoopWorkspaceContext } from '../../core';

/** The editor surface the deck is shown on. */
export const DECK_SURFACE_ID = 'deck';

const NO_ARGUMENTS = { type: 'object', properties: {} } as const;
const ID = {
  type: 'string',
  description:
    'The deck id, `collection/slug` or `slug`, as listed by decks_list_decks.',
} as const;
const SLIDE_NUMBER = {
  type: 'integer',
  description: "1-based slide number, from the deck's outline.",
} as const;
const SLIDE_SPEC = {
  type: 'object',
  description: 'A whole slide: `{type, ...}`.',
} as const;
const DECK_SPEC = {
  type: 'object',
  description:
    'The deck specification: `{deck: {title, subtitle?, template?}, slides: [...]}`.',
} as const;

type Args = Record<string, unknown>;
type Handler = (args: Args) => Promise<unknown>;
type Definition = Pick<
  FrontendToolDefinition,
  'name' | 'description' | 'parameters'
>;

/**
 * What each tool is called and told. The names, and the arguments of the
 * command tools, match `agentspecs/frontend-tools/decks.yaml` and
 * `agentspecs/tools/decks-*.yaml`; the descriptions here are what a
 * browser-only loop sends the model, and say the same thing.
 */
export const DECK_TOOL_DEFINITIONS: Definition[] = [
  {
    name: 'decks_list_decks',
    description:
      'Every deck: id, collection, slug, title, subtitle and slide count. Use the id with the other deck tools.',
    parameters: NO_ARGUMENTS,
  },
  {
    name: 'decks_get_deck',
    description:
      'One deck: its full spec and an outline (slide number, type, title) to find a slide before opening or changing it.',
    parameters: { type: 'object', properties: { id: ID }, required: ['id'] },
  },
  {
    name: 'decks_create_deck',
    description:
      'Create a deck from a complete spec under a short slug, optionally in a collection. The result names its id; the deck opens beside the conversation.',
    parameters: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'URL-safe name; becomes the address.',
        },
        spec: DECK_SPEC,
        collection: {
          type: 'string',
          description: 'Optional family the deck belongs to.',
        },
      },
      required: ['slug', 'spec'],
    },
  },
  {
    name: 'decks_update_deck',
    description:
      "Replace a deck's whole record — collection, slug and spec — by id. The same slug keeps the address.",
    parameters: {
      type: 'object',
      properties: {
        id: ID,
        slug: { type: 'string' },
        spec: DECK_SPEC,
        collection: { type: 'string' },
      },
      required: ['id', 'slug', 'spec'],
    },
  },
  {
    name: 'decks_update_slide',
    description:
      'Replace one slide of a deck by its 1-based number, leaving the rest as they are.',
    parameters: {
      type: 'object',
      properties: { id: ID, slide: SLIDE_NUMBER, slide_spec: SLIDE_SPEC },
      required: ['id', 'slide', 'slide_spec'],
    },
  },
  {
    name: 'decks_insert_slide',
    description:
      'Insert a slide before the given 1-based position (past the end appends).',
    parameters: {
      type: 'object',
      properties: { id: ID, slide: SLIDE_NUMBER, slide_spec: SLIDE_SPEC },
      required: ['id', 'slide', 'slide_spec'],
    },
  },
  {
    name: 'decks_delete_slide',
    description: 'Remove one slide of a deck by its 1-based number.',
    parameters: {
      type: 'object',
      properties: { id: ID, slide: SLIDE_NUMBER },
      required: ['id', 'slide'],
    },
  },
  {
    name: 'decks_delete_deck',
    description: 'Delete a deck by id. Irreversible; ask first.',
    parameters: { type: 'object', properties: { id: ID }, required: ['id'] },
  },
  {
    name: 'decks_list',
    description: 'Close the open deck and show the list of decks.',
    parameters: NO_ARGUMENTS,
  },
  {
    name: 'decks_open',
    description: 'Open a deck by id, optionally at a slide.',
    parameters: {
      type: 'object',
      properties: {
        id: ID,
        slide: {
          type: 'integer',
          description: '1-based slide to open at. The first when omitted.',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'decks_go_to_slide',
    description: 'Move the open deck to a slide.',
    parameters: {
      type: 'object',
      properties: { slide: SLIDE_NUMBER },
      required: ['slide'],
    },
  },
  {
    name: 'decks_next_slide',
    description: 'Advance the open deck by one slide.',
    parameters: NO_ARGUMENTS,
  },
  {
    name: 'decks_previous_slide',
    description: 'Go back one slide in the open deck.',
    parameters: NO_ARGUMENTS,
  },
  {
    name: 'decks_present',
    description:
      'Put the open deck in fullscreen. Browsers only allow this from a click, so the result may say it was blocked — then ask the person to press F or the Present button.',
    parameters: NO_ARGUMENTS,
  },
  {
    name: 'decks_print',
    description:
      'Open the print view of the open deck in a new tab, for Save as PDF. The result carries the address in case the tab was blocked.',
    parameters: NO_ARGUMENTS,
  },
];

const summary = (entry: DeckEntry) => ({
  id: deckId(entry),
  collection: entry.collection,
  slug: entry.slug,
  title: entry.spec.deck.title,
  subtitle: entry.spec.deck.subtitle,
  slides: entry.spec.slides.length,
  source: entry.source,
});

/** Slide number, type and title of every slide: what "the metrics slide" resolves against. */
export const deckOutline = (spec: DeckSpec) =>
  spec.slides.map((slide, index) => {
    const raw = slide as unknown as Record<string, unknown>;
    const title = raw.title ?? raw.statement ?? raw.quote ?? '';
    return {
      slide: index + 1,
      type: slide.type,
      title: String(title).slice(0, 80),
    };
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

const slideOf = (args: Args): number => {
  if (typeof args.slide !== 'number') {
    throw new Error(
      "Pass the 1-based `slide` number, from the deck's outline.",
    );
  }
  return args.slide;
};

const existing = (id: string): DeckEntry => {
  const entry = deckById(id);
  if (!entry) {
    throw new Error(`There is no deck ${id}.`);
  }
  return entry;
};

const written = (
  entry: DeckEntry,
  issues: { where: string; message: string }[],
) => ({
  ...summary(entry),
  outline: deckOutline(entry.spec),
  issues: issues.map(issue => `${issue.where}: ${issue.message}`),
});

/**
 * The implementations, keyed by tool name.
 *
 * `show` brings the deck surface on screen; the write tools and `decks_open`
 * call it, because a deck the agent just made and the person cannot see is a
 * tool call that looks like it did nothing.
 */
export function deckToolHandlers(show: () => void): Record<string, Handler> {
  const changeSlides = async (
    id: string,
    change: (slides: SlideSpec[]) => void,
    focus?: number,
  ) => {
    const current = existing(id);
    const slides = [...current.spec.slides];
    change(slides);
    const { entry, issues } = await replaceDeck(id, {
      spec: { ...current.spec, slides },
    });
    if (focus) {
      openDeck(deckId(entry), Math.min(focus, slides.length));
    }
    show();
    return written(entry, issues);
  };
  return {
    decks_list_decks: async () => listDecks().map(summary),
    decks_get_deck: async args => {
      const entry = existing(idOf(args));
      return {
        ...summary(entry),
        spec: entry.spec,
        outline: deckOutline(entry.spec),
      };
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
    decks_update_slide: async args => {
      const id = idOf(args);
      const slide = slideOf(args);
      return changeSlides(
        id,
        slides => {
          if (slide < 1 || slide > slides.length) {
            throw new Error(
              `There is no slide ${slide}; the deck has ${slides.length}.`,
            );
          }
          slides[slide - 1] = args.slide_spec as SlideSpec;
        },
        slide,
      );
    },
    decks_insert_slide: async args => {
      const id = idOf(args);
      const slide = slideOf(args);
      let position = slide;
      return changeSlides(
        id,
        slides => {
          position = Math.max(1, Math.min(slide, slides.length + 1));
          slides.splice(position - 1, 0, args.slide_spec as SlideSpec);
        },
        position,
      );
    },
    decks_delete_slide: async args => {
      const id = idOf(args);
      const slide = slideOf(args);
      return changeSlides(
        id,
        slides => {
          if (slide < 1 || slide > slides.length) {
            throw new Error(
              `There is no slide ${slide}; the deck has ${slides.length}.`,
            );
          }
          if (slides.length === 1) {
            throw new Error(
              'A deck needs at least one slide; delete the deck instead.',
            );
          }
          slides.splice(slide - 1, 1);
        },
        Math.max(1, slide - 1),
      );
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
      existing(id);
      openDeck(id, typeof args.slide === 'number' ? args.slide : 1);
      show();
      return { ok: true, id, slide: getDecksState().slide };
    },
    decks_go_to_slide: async args => {
      goToSlide(slideOf(args));
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
      show();
      const state = await presentOpenDeck();
      if (state === 'none') {
        throw new Error('No deck is on screen to present. Open one first.');
      }
      return state === 'blocked'
        ? {
            ok: false,
            blocked: true,
            reason:
              'The browser only allows fullscreen from a click. The deck is on screen: ask the person to press F, or the Present button.',
          }
        : { ok: true, state };
    },
    decks_print: async () => {
      const result = printOpenDeck();
      if (!result) {
        throw new Error('No deck is open to print. Open one first.');
      }
      return result.opened
        ? { ok: true, path: result.path }
        : {
            ok: false,
            blocked: true,
            path: result.path,
            reason:
              'The browser blocked the new tab. Give the person this address to open.',
          };
    },
  };
}

/**
 * The command tools as the decks plugin itself declares them, in the
 * `AgentTools` bundle it contributes to the reactor.
 *
 * For those, the plugin's bundle is the source of what the model is told — a
 * host without this bridge, and the server reading `/plugins/agent-tools`,
 * read the same bundle — so the in-page definition takes its description and
 * schema by name, and the two cannot drift. The read and write tools are
 * described here; their server twins are Python functions whose docstrings
 * say the same.
 */
const declaredCommands = new Map(
  DECKS_AGENT_TOOLS.commands.map(entry => [entry.name, entry]),
);

/** Every deck tool, bound to this workspace. */
export function createDeckTools(
  workspace: LoopWorkspaceContext,
): FrontendToolDefinition[] {
  const show = () => {
    workspace.setActiveViewType('chat');
    requestSurface(DECK_SURFACE_ID);
  };
  const handlers = deckToolHandlers(show);
  return DECK_TOOL_DEFINITIONS.map(definition => {
    const declared = declaredCommands.get(definition.name);
    return {
      ...definition,
      ...(declared
        ? {
            description: declared.description,
            parameters: declared.parameters ?? NO_ARGUMENTS,
          }
        : {}),
      location: 'frontend' as const,
      handler: handlers[definition.name],
    };
  });
}
