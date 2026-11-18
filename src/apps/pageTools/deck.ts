/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A deck an agent builds in the page, slide by slide (the user, 18 November
 * 2026: "add to the marketer the frontend tools to create slides").
 *
 * Pure: the deck's state (a `@datalayer/decks` spec), what each tool does to
 * it, and what the deck says of itself. It began as the deck arena of
 * Datalayer's Battles, which still plays on it with three of these tools
 * (`DECK_ARENA_TOOL_NAMES`); the chat's `page-deck` plugin binds all of them
 * to the conversation's deck (`apps/plugins/page-deck`).
 *
 * Everything a tool takes is checked here, in the page, and refused in a
 * sentence the model can act on. What a slide holds is text and numbers,
 * drawn by the decks library as such: no HTML, no script, no component, and
 * a picture or a link only at an https address.
 *
 * @module apps/pageTools/deck
 */

import type { DeckSpec, SlideSpec } from '@datalayer/decks';
import type { FrontendToolDefinition } from '../../types/tools';

export type DeckState = {
  spec: DeckSpec;
  moves: number;
  /** The slide the last change was about, from 1: the one to show. */
  shown?: number;
};

/** The template a deck starts with: the application's own. */
export const DECK_TEMPLATE = 'datalayer';

/** The templates a deck may wear: the decks library's. */
export const DECK_TEMPLATES = ['datalayer', 'brand', 'ink'] as const;

/** The themes a deck may ask for: primer-addons' variants. */
export const DECK_THEMES = [
  'datalayer',
  'spatial',
  'lovely',
  'matrix',
  'earth',
  'sand',
  'ivory',
  'sun',
  'loop',
  'metal',
] as const;

export const DECK_COLOR_MODES = ['light', 'dark', 'auto'] as const;

/** How much a deck holds: said to the model when it asks for more. */
export const DECK_LIMITS = {
  slides: 40,
  items: 8,
  metrics: 6,
  title: 160,
  line: 280,
  statement: 400,
  notes: 2000,
} as const;

export const DECK_WORDS = {
  title: 'The deck',
  empty: 'No slide yet.',
  slides: (n: number): string => (n === 1 ? '1 slide' : `${n} slides`),
} as const;

export const emptyDeck = (title = 'Untitled deck'): DeckState => ({
  spec: { deck: { title, template: DECK_TEMPLATE }, slides: [] },
  moves: 0,
});

/** The kinds of slide a Battle's contestant adds. */
export const DECK_SLIDE_KINDS = [
  'title',
  'section',
  'bullets',
  'statement',
  'closing',
] as const;

/** The kinds of slide an agent adds in a chat: those, a row of figures, and a picture. */
export const DECK_PAGE_SLIDE_KINDS = [
  ...DECK_SLIDE_KINDS,
  'metrics',
  'image',
] as const;

export type DeckSlideKind = (typeof DECK_PAGE_SLIDE_KINDS)[number];

export type DeckMetricArgs = { value: string; label: string; detail?: string };

export type DeckSlideArgs = {
  type: DeckSlideKind;
  title?: string;
  subtitle?: string;
  items?: string[];
  statement?: string;
  attribution?: string;
  cta?: string;
  metrics?: DeckMetricArgs[];
  /** A picture's https address: beside the bullets, or the whole `image` slide. */
  image?: string;
  image_alt?: string;
  caption?: string;
  /** Speaker notes: what to say over the slide. */
  notes?: string;
};

const SLIDE_FIELDS = [
  'type',
  'title',
  'subtitle',
  'items',
  'statement',
  'attribution',
  'cta',
  'metrics',
  'image',
  'image_alt',
  'caption',
  'notes',
] as const;

/** A link written as `[words](address)` whose address is not https. */
const UNSAFE_LINK = /\]\(\s*(?!https:\/\/)[^)]*\)/i;

const checked = (value: string, what: string, most: number): string => {
  if (value.length > most) {
    throw new Error(
      `${what} is ${value.length} characters long; ${most} at most.`,
    );
  }
  if (UNSAFE_LINK.test(value)) {
    throw new Error(`${what} links only to an address starting with https://.`);
  }
  return value;
};

const text = (
  value: unknown,
  what: string,
  most: number = DECK_LIMITS.title,
): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${what} is a non-empty text.`);
  }
  return checked(value.trim(), what, most);
};

/** A text that may be left out: undefined when absent or empty. */
const optional = (
  value: unknown,
  what: string,
  most: number = DECK_LIMITS.line,
): string | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`${what} is a text.`);
  }
  const trimmed = value.trim();
  return trimmed ? checked(trimmed, what, most) : undefined;
};

/** A picture's address: https only, nothing a browser would run. */
export function deckImage(value: unknown): string {
  const url = typeof value === 'string' ? value.trim() : '';
  if (!/^https:\/\/[^\s"'<>]+$/i.test(url) || url.length > 2000) {
    throw new Error(
      'A picture is the https:// address of an image, such as one a stock photo search answered.',
    );
  }
  return url;
}

const only = (
  args: Record<string, unknown>,
  allowed: readonly string[],
  what: string,
): void => {
  const unknown = Object.keys(args).filter(key => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new Error(
      `${what} takes ${allowed.join(', ')}; not ${unknown.join(', ')}.`,
    );
  }
};

const itemsOf = (value: unknown): string[] => {
  if (value !== undefined && !Array.isArray(value)) {
    throw new Error('The items are an array of short lines.');
  }
  const items = ((value as unknown[] | undefined) ?? [])
    .map(item => String(item).trim())
    .filter(Boolean)
    .map((item, index) => checked(item, `Item ${index + 1}`, DECK_LIMITS.line));
  if (items.length > DECK_LIMITS.items) {
    throw new Error(
      `A slide takes ${DECK_LIMITS.items} items at most; this one has ${items.length}. Split it in two slides.`,
    );
  }
  return items;
};

const metricsOf = (value: unknown): DeckMetricArgs[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(
      'A metrics slide takes metrics: each a value ("4.2%") and a label ("click rate").',
    );
  }
  if (value.length > DECK_LIMITS.metrics) {
    throw new Error(
      `A metrics slide takes ${DECK_LIMITS.metrics} metrics at most; this one has ${value.length}.`,
    );
  }
  return value.map((each, index) => {
    const metric = (each ?? {}) as Record<string, unknown>;
    const shown =
      typeof metric.value === 'number' ? String(metric.value) : metric.value;
    const detail = optional(metric.detail, `Metric ${index + 1}'s detail`);
    return {
      value: text(shown, `Metric ${index + 1}'s value`, 40),
      label: text(metric.label, `Metric ${index + 1}'s label`),
      ...(detail ? { detail } : {}),
    };
  });
};

/** A slide spec from a tool's arguments; refused in a sentence when a kind lacks what it takes. */
export function slideOf(args: DeckSlideArgs): SlideSpec {
  only(args as unknown as Record<string, unknown>, SLIDE_FIELDS, 'A slide');
  const notes = optional(args.notes, 'The notes', DECK_LIMITS.notes);
  const subtitle = optional(args.subtitle, 'The subtitle');
  const said = notes ? { notes } : {};
  switch (args.type) {
    case 'title':
      return {
        type: 'title',
        title: text(args.title, 'The title'),
        ...(subtitle ? { subtitle } : {}),
        ...said,
      };
    case 'section':
      return { type: 'section', title: text(args.title, 'The title'), ...said };
    case 'bullets': {
      const items = itemsOf(args.items);
      if (items.length === 0) {
        throw new Error('A bullets slide takes items: one short line each.');
      }
      const title = optional(args.title, 'The title', DECK_LIMITS.title);
      if (
        args.image !== undefined &&
        args.image !== null &&
        args.image !== ''
      ) {
        // Bullets beside a picture: the decks library's artifact slide.
        const alt = optional(args.image_alt, 'The picture’s description');
        const caption = optional(args.caption, 'The caption');
        return {
          type: 'artifact',
          title: text(args.title, 'The title of a slide with a picture'),
          visual: {
            src: deckImage(args.image),
            ...(alt ? { alt } : {}),
            ...(caption ? { caption } : {}),
          },
          items,
          ...said,
        };
      }
      return { type: 'bullets', ...(title ? { title } : {}), items, ...said };
    }
    case 'statement': {
      const attribution = optional(args.attribution, 'The attribution');
      return {
        type: 'statement',
        statement: text(args.statement, 'The statement', DECK_LIMITS.statement),
        ...(attribution ? { attribution } : {}),
        ...said,
      };
    }
    case 'closing': {
      const cta = optional(args.cta, 'The call to action');
      return {
        type: 'closing',
        title: text(args.title, 'The title'),
        ...(cta ? { cta } : {}),
        ...said,
      };
    }
    case 'metrics': {
      const title = optional(args.title, 'The title', DECK_LIMITS.title);
      return {
        type: 'metrics',
        ...(title ? { title } : {}),
        metrics: metricsOf(args.metrics),
        ...said,
      };
    }
    case 'image': {
      const title = optional(args.title, 'The title', DECK_LIMITS.title);
      const alt = optional(args.image_alt, 'The picture’s description');
      const caption = optional(args.caption, 'The caption');
      return {
        type: 'image',
        src: deckImage(args.image),
        ...(title ? { title } : {}),
        ...(alt ? { alt } : {}),
        ...(caption ? { caption } : {}),
        ...said,
      };
    }
    default:
      throw new Error(`A slide is one of ${DECK_PAGE_SLIDE_KINDS.join(', ')}.`);
  }
}

export const withTitle = (
  state: DeckState,
  title: string,
  subtitle?: string,
): DeckState => {
  const under = optional(subtitle, 'The subtitle');
  return {
    spec: {
      ...state.spec,
      deck: {
        ...state.spec.deck,
        title: text(title, 'The title'),
        ...(under ? { subtitle: under } : {}),
      },
    },
    moves: state.moves + 1,
  };
};

/** A new deck under a title: the slides of the one before are gone. */
export const withNewDeck = (
  state: DeckState,
  title: string,
  subtitle?: string,
): DeckState => ({
  ...withTitle(emptyDeck(), title, subtitle),
  moves: state.moves + 1,
});

/** A slide's place from what a tool said: 1-based, among `count` places. */
const placeOf = (value: unknown, count: number, what: string): number => {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`${what} is a slide's number, from 1.`);
  }
  if (value < 1 || value > count) {
    throw new Error(
      count === 0
        ? 'The deck has no slide yet.'
        : `${what} is between 1 and ${count}; the deck has ${DECK_WORDS.slides(count)}.`,
    );
  }
  return value - 1;
};

/** A slide added at the end, or before the slide numbered `at`. */
export const withSlide = (
  state: DeckState,
  args: DeckSlideArgs,
  at?: number,
): DeckState => {
  const slides = state.spec.slides;
  if (slides.length >= DECK_LIMITS.slides) {
    throw new Error(
      `A deck holds ${DECK_LIMITS.slides} slides at most, and this one has them: replace or delete a slide instead.`,
    );
  }
  const slide = slideOf(args);
  const index =
    at === undefined || at === null
      ? slides.length
      : placeOf(at, slides.length + 1, 'The place');
  return {
    spec: {
      ...state.spec,
      slides: [...slides.slice(0, index), slide, ...slides.slice(index)],
    },
    moves: state.moves + 1,
    shown: index + 1,
  };
};

/** The slide numbered `slide` replaced by another, whole. */
export const withSlideReplaced = (
  state: DeckState,
  slide: number,
  args: DeckSlideArgs,
): DeckState => {
  const index = placeOf(slide, state.spec.slides.length, 'The slide');
  const next = slideOf(args);
  return {
    spec: {
      ...state.spec,
      slides: state.spec.slides.map((each, at) => (at === index ? next : each)),
    },
    moves: state.moves + 1,
    shown: index + 1,
  };
};

export const withSlideMoved = (
  state: DeckState,
  slide: number,
  to: number,
): DeckState => {
  const count = state.spec.slides.length;
  const from = placeOf(slide, count, 'The slide');
  const target = placeOf(to, count, 'Its new place');
  const slides = [...state.spec.slides];
  const [moved] = slides.splice(from, 1);
  slides.splice(target, 0, moved);
  return {
    spec: { ...state.spec, slides },
    moves: state.moves + 1,
    shown: target + 1,
  };
};

export const withSlideDeleted = (
  state: DeckState,
  slide: number,
): DeckState => {
  const index = placeOf(slide, state.spec.slides.length, 'The slide');
  return {
    spec: {
      ...state.spec,
      slides: state.spec.slides.filter((_, at) => at !== index),
    },
    moves: state.moves + 1,
    shown: Math.max(1, Math.min(index + 1, state.spec.slides.length - 1)),
  };
};

export type DeckThemeArgs = {
  template?: string;
  theme?: string;
  color_mode?: string;
};

const oneOf = <T extends string>(
  value: unknown,
  among: readonly T[],
  what: string,
): T | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (!among.includes(value as T)) {
    throw new Error(`${what} is one of ${among.join(', ')}.`);
  }
  return value as T;
};

/** The deck's look: its template, and the theme and colour mode it is drawn in. */
export const withTheme = (state: DeckState, args: DeckThemeArgs): DeckState => {
  only(args, ['template', 'theme', 'color_mode'], 'The theme');
  const template = oneOf(args.template, DECK_TEMPLATES, 'The template');
  const theme = oneOf(args.theme, DECK_THEMES, 'The theme');
  const colorMode = oneOf(args.color_mode, DECK_COLOR_MODES, 'The colour mode');
  if (!template && !theme && !colorMode) {
    throw new Error(
      `Name a template (${DECK_TEMPLATES.join(', ')}), a theme (${DECK_THEMES.join(', ')}) or a color_mode (${DECK_COLOR_MODES.join(', ')}).`,
    );
  }
  return {
    spec: {
      ...state.spec,
      deck: {
        ...state.spec.deck,
        ...(template ? { template } : {}),
        ...(theme ? { theme } : {}),
        ...(colorMode ? { colorMode } : {}),
      },
    },
    moves: state.moves + 1,
    ...(state.shown ? { shown: state.shown } : {}),
  };
};

/** One slide in words. */
function slideSays(slide: SlideSpec): string {
  const noted = slide.notes ? ' (notes)' : '';
  switch (slide.type) {
    case 'bullets':
      return `bullets${slide.title ? ` “${slide.title}”` : ''}: ${slide.items.join('; ')}${noted}`;
    case 'artifact':
      return `bullets with a picture “${slide.title}”: ${(slide.items ?? []).join('; ')}${noted}`;
    case 'statement':
      return `statement: ${slide.statement}${noted}`;
    case 'closing':
      return `closing: ${slide.title}${slide.cta ? ` — ${slide.cta}` : ''}${noted}`;
    case 'metrics':
      return `metrics${slide.title ? ` “${slide.title}”` : ''}: ${slide.metrics
        .map(metric => `${metric.value} ${metric.label}`)
        .join('; ')}${noted}`;
    case 'image':
      return `image${slide.title ? ` “${slide.title}”` : ''}${slide.caption ? `: ${slide.caption}` : ''}${noted}`;
    default:
      return `${slide.type}: ${'title' in slide ? (slide.title ?? '') : ''}${noted}`;
  }
}

/** The deck in words a model reads back. */
export function deckSays(state: DeckState): string {
  const { deck, slides } = state.spec;
  const lines = slides.map(
    (slide, index) => `${index + 1}. ${slideSays(slide)}`,
  );
  return [
    `Deck “${deck.title}”${deck.subtitle ? ` — ${deck.subtitle}` : ''}, ${DECK_WORDS.slides(slides.length)}.`,
    ...lines,
  ].join('\n');
}

/** How a deck is driven: the state read and changed by the tools. */
export type DeckHandle = {
  read: () => DeckState;
  change: (next: (state: DeckState) => DeckState) => DeckState;
};

/** The three tools a Battle's deck arena plays with. */
export const DECK_ARENA_TOOL_NAMES = [
  'deck_set_title',
  'deck_add_slide',
  'deck_read',
] as const;

/** Every deck tool, in the order an agent would call them. */
export const DECK_TOOL_NAMES = [
  'deck_create',
  'deck_set_title',
  'deck_add_slide',
  'deck_update_slide',
  'deck_move_slide',
  'deck_delete_slide',
  'deck_set_theme',
  'deck_read',
] as const;

export type DeckToolName = (typeof DECK_TOOL_NAMES)[number];

/** The tools that change the deck: what a restored conversation replays. */
export const DECK_WRITE_TOOL_NAMES: readonly DeckToolName[] =
  DECK_TOOL_NAMES.filter(name => name !== 'deck_read');

const slideProperties = (
  kinds: readonly string[],
): Record<string, unknown> => ({
  type: { type: 'string', enum: [...kinds], description: 'The kind of slide.' },
  title: { type: 'string', maxLength: DECK_LIMITS.title },
  subtitle: { type: 'string', maxLength: DECK_LIMITS.line },
  items: {
    type: 'array',
    maxItems: DECK_LIMITS.items,
    items: { type: 'string', maxLength: DECK_LIMITS.line },
    description: 'The bullets, one short line each.',
  },
  statement: { type: 'string', maxLength: DECK_LIMITS.statement },
  attribution: { type: 'string', maxLength: DECK_LIMITS.line },
  cta: {
    type: 'string',
    maxLength: DECK_LIMITS.line,
    description: 'What to do next, on a closing slide.',
  },
  ...(kinds.includes('metrics')
    ? {
        metrics: {
          type: 'array',
          maxItems: DECK_LIMITS.metrics,
          description: 'The figures of a metrics slide.',
          items: {
            type: 'object',
            properties: {
              value: {
                type: 'string',
                description: 'The figure, as shown: "4.2%", "1,280".',
              },
              label: { type: 'string', description: 'What it counts.' },
              detail: { type: 'string', description: 'One line under it.' },
            },
            required: ['value', 'label'],
            additionalProperties: false,
          },
        },
      }
    : {}),
  ...(kinds.includes('image')
    ? {
        image: {
          type: 'string',
          description:
            'The https:// address of a picture: the whole of an image slide, or beside the bullets.',
        },
        image_alt: { type: 'string', description: 'What the picture shows.' },
        caption: {
          type: 'string',
          description: 'A line under the picture: its credit.',
        },
      }
    : {}),
  notes: {
    type: 'string',
    maxLength: DECK_LIMITS.notes,
    description: 'Speaker notes: what to say over the slide.',
  },
});

const kindsSaid = (kinds: readonly string[]): string => {
  const said = [
    'a `title` (title, subtitle)',
    'a `section` (title)',
    '`bullets` (title, items: three to five short lines' +
      (kinds.includes('image')
        ? ', and an image beside them if there is one)'
        : ')'),
    'a `statement` (statement, attribution)',
    'a `closing` (title, cta)',
    ...(kinds.includes('metrics')
      ? ['`metrics` (title, metrics: a value and a label each)']
      : []),
    ...(kinds.includes('image')
      ? ['an `image` (image, image_alt, caption)']
      : []),
  ];
  return `${said.slice(0, -1).join(', ')}, or ${said[said.length - 1]}`;
};

const SLIDE_NUMBER = {
  type: 'integer',
  minimum: 1,
  description: 'The slide’s number, from 1.',
};

/** What a slide tool was given besides the slide itself. */
const slideArgs = (
  args: Record<string, unknown>,
  besides: readonly string[],
): DeckSlideArgs => {
  const slide: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (!besides.includes(key)) {
      slide[key] = value;
    }
  }
  return slide as DeckSlideArgs;
};

/**
 * The deck's tools, bound to one deck. `kinds` are the slides it may add:
 * a Battle's five by default, a chat's seven (`DECK_PAGE_SLIDE_KINDS`).
 */
export function deckTools(
  handle: DeckHandle,
  kinds: readonly DeckSlideKind[] = DECK_PAGE_SLIDE_KINDS,
): FrontendToolDefinition[] {
  const slide = (args: DeckSlideArgs): DeckSlideArgs => {
    if (!kinds.includes(args.type)) {
      throw new Error(`A slide is one of ${kinds.join(', ')}.`);
    }
    return args;
  };
  const answer = (state: DeckState, more: Record<string, unknown> = {}) => ({
    ok: true,
    slides: state.spec.slides.length,
    ...more,
    deck: deckSays(state),
  });
  return [
    {
      name: 'deck_create',
      description:
        'Start a new deck in the page under a title, and a subtitle if there is one: the person sees it at once. A deck made before in this conversation is replaced.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            maxLength: DECK_LIMITS.title,
            description: 'The deck’s title.',
          },
          subtitle: {
            type: 'string',
            maxLength: DECK_LIMITS.line,
            description: 'One line under it.',
          },
        },
        required: ['title'],
        additionalProperties: false,
      },
      handler: async (args: Record<string, unknown>) => {
        only(args, ['title', 'subtitle'], 'A new deck');
        const { title, subtitle } = args as {
          title: string;
          subtitle?: string;
        };
        return answer(
          handle.change(previous => withNewDeck(previous, title, subtitle)),
        );
      },
    },
    {
      name: 'deck_set_title',
      description:
        'Set the deck’s title, and a subtitle if there is one. Call it once, first.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'The deck’s title.' },
          subtitle: { type: 'string', description: 'One line under it.' },
        },
        required: ['title'],
      },
      handler: async (args: Record<string, unknown>) => {
        const { title, subtitle } = args as {
          title: string;
          subtitle?: string;
        };
        const state = handle.change(previous =>
          withTitle(previous, title, subtitle),
        );
        return { ok: true, deck: deckSays(state) };
      },
    },
    {
      name: 'deck_add_slide',
      description: `Add a slide at the end of the deck${kinds.length > DECK_SLIDE_KINDS.length ? ', or before the slide numbered `at`' : ''}: ${kindsSaid(kinds)}.${kinds.length > DECK_SLIDE_KINDS.length ? ` Any slide takes notes. A deck holds ${DECK_LIMITS.slides} slides at most.` : ''}`,
      parameters: {
        type: 'object',
        properties: {
          ...slideProperties(kinds),
          ...(kinds.length > DECK_SLIDE_KINDS.length
            ? {
                at: {
                  ...SLIDE_NUMBER,
                  description:
                    'Add it before this slide; at the end when left out.',
                },
              }
            : {}),
        },
        required: ['type'],
      },
      handler: async (args: Record<string, unknown>) => {
        const at = args.at as number | undefined;
        const state = handle.change(previous =>
          withSlide(previous, slide(slideArgs(args, ['at'])), at),
        );
        return answer(state);
      },
    },
    {
      name: 'deck_update_slide',
      description: `Replace a slide of the deck, whole, by its number: give every field the new slide has, as for a new one (${kinds.join(', ')}).`,
      parameters: {
        type: 'object',
        properties: { slide: SLIDE_NUMBER, ...slideProperties(kinds) },
        required: ['slide', 'type'],
      },
      handler: async (args: Record<string, unknown>) => {
        const state = handle.change(previous =>
          withSlideReplaced(
            previous,
            args.slide as number,
            slide(slideArgs(args, ['slide'])),
          ),
        );
        return answer(state, { replaced: args.slide });
      },
    },
    {
      name: 'deck_move_slide',
      description:
        'Move a slide to another place in the deck: its number now, and the number it takes.',
      parameters: {
        type: 'object',
        properties: {
          slide: SLIDE_NUMBER,
          to: { ...SLIDE_NUMBER, description: 'The number it takes.' },
        },
        required: ['slide', 'to'],
        additionalProperties: false,
      },
      handler: async (args: Record<string, unknown>) => {
        only(args, ['slide', 'to'], 'A move');
        const state = handle.change(previous =>
          withSlideMoved(previous, args.slide as number, args.to as number),
        );
        return answer(state, { moved: args.slide, to: args.to });
      },
    },
    {
      name: 'deck_delete_slide',
      description:
        'Delete a slide of the deck by its number; the slides after it move up.',
      parameters: {
        type: 'object',
        properties: { slide: SLIDE_NUMBER },
        required: ['slide'],
        additionalProperties: false,
      },
      handler: async (args: Record<string, unknown>) => {
        only(args, ['slide'], 'A deletion');
        const state = handle.change(previous =>
          withSlideDeleted(previous, args.slide as number),
        );
        return answer(state, { deleted: args.slide });
      },
    },
    {
      name: 'deck_set_theme',
      description: `Set the deck’s look: its template (${DECK_TEMPLATES.join(', ')}; brand wears the theme’s brand colours), the theme it is drawn in (${DECK_THEMES.join(', ')}) and its colour mode (${DECK_COLOR_MODES.join(', ')}). Name one at least; what is left out stays.`,
      parameters: {
        type: 'object',
        properties: {
          template: { type: 'string', enum: [...DECK_TEMPLATES] },
          theme: { type: 'string', enum: [...DECK_THEMES] },
          color_mode: { type: 'string', enum: [...DECK_COLOR_MODES] },
        },
        additionalProperties: false,
      },
      handler: async (args: Record<string, unknown>) => {
        const state = handle.change(previous =>
          withTheme(previous, args as DeckThemeArgs),
        );
        const { template, theme, colorMode } = state.spec.deck;
        return {
          ok: true,
          template,
          ...(theme ? { theme } : {}),
          ...(colorMode ? { color_mode: colorMode } : {}),
        };
      },
    },
    {
      name: 'deck_read',
      description: 'The deck as it stands: its title and each slide, in order.',
      parameters: { type: 'object', properties: {} },
      handler: async () => ({ deck: deckSays(handle.read()) }),
    },
  ];
}

/** The deck arena's three tools, bound to one contestant's deck, with its five kinds of slide. */
export function deckArenaTools(handle: DeckHandle): FrontendToolDefinition[] {
  return deckTools(handle, DECK_SLIDE_KINDS).filter(tool =>
    (DECK_ARENA_TOOL_NAMES as readonly string[]).includes(tool.name),
  );
}

/**
 * One call applied to a deck: what a tool's handler does, by its name. How a
 * restored conversation builds its deck again from the calls it recorded.
 */
export function applyDeckCall(
  state: DeckState,
  name: string,
  args: Record<string, unknown>,
): DeckState {
  switch (name as DeckToolName) {
    case 'deck_create':
      return withNewDeck(
        state,
        args.title as string,
        args.subtitle as string | undefined,
      );
    case 'deck_set_title':
      return withTitle(
        state,
        args.title as string,
        args.subtitle as string | undefined,
      );
    case 'deck_add_slide':
      return withSlide(
        state,
        slideArgs(args, ['at']),
        args.at as number | undefined,
      );
    case 'deck_update_slide':
      return withSlideReplaced(
        state,
        args.slide as number,
        slideArgs(args, ['slide']),
      );
    case 'deck_move_slide':
      return withSlideMoved(state, args.slide as number, args.to as number);
    case 'deck_delete_slide':
      return withSlideDeleted(state, args.slide as number);
    case 'deck_set_theme':
      return withTheme(state, args as DeckThemeArgs);
    case 'deck_read':
      return state;
    default:
      throw new Error(`There is no deck tool named ${name}.`);
  }
}
