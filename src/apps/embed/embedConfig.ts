/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application in another product's page, as its host writes it (LOOP
 * D-07, D-08, D-11, T-13): one script tag and one element, `<datalayer-app>`,
 * whose attributes — or, for the theme, the host's CSS variables — say what
 * it shows and how it looks.
 *
 * Pure: what the element's attributes mean, the four modes and the chat each
 * floats in, what a host may override and how it is checked, and the snippet
 * the *Ship* tab copies. Nothing here touches the DOM, so all of it is read
 * and tested without one.
 *
 * @module apps/embed/embedConfig
 */

import type {
  AppAccent,
  AppEmbedMode,
  AppSpec,
  AppThemeVariant,
} from '../../types/agentspecs';
import {
  APP_ACCENTS,
  APP_EMBED_MODES,
  type ParsedAppspec,
} from '../apps/appspec';
import { LANGUAGE_TAG } from '../apps/language';

/** The element's name: the one a host writes. */
export const EMBED_TAG = 'datalayer-app';

/** Where the script is served on a Datalayer origin; the stylesheet beside it. */
export const EMBED_SCRIPT_PATH = '/embed/datalayer-app.js';
export const EMBED_STYLESHEET_PATH = '/embed/datalayer-app.css';

/**
 * The element's attributes, each in a sentence — what the documentation and
 * the element's own refusals say.
 */
export const EMBED_ATTRIBUTES = {
  app: 'The application’s id on Datalayer.',
  origin:
    'Where Datalayer is; the origin the script was loaded from by default.',
  token:
    'An embed token for an application that is not public, issued to your server for each visit.',
  spec: 'The address of an Appspec (YAML or JSON) to run, in place of `app`.',
  mode: 'inline, bubble, panel or assistant; the Appspec’s `deployment.embedded.mode` by default, then inline.',
  accent:
    'green, rose, sky, lime, sun or violet; the Appspec’s `interface.accent` by default, else the theme’s own colours.',
  theme: 'light, dark or auto (the visitor’s system); auto by default.',
  font: 'A CSS font family for the application’s text; Inter, then the system’s sans-serif, by default.',
  server:
    'An agent-runtimes server the application’s agent runs on; a Datalayer runtime by default.',
  api: 'Datalayer’s API, where an application is read with its token; the platform’s by default.',
  height: 'The height of an inline application, in pixels; 640 by default.',
  resume:
    'true or false: whether a visit’s conversation is picked up again after the page reloads, kept in the page’s storage; true by default.',
  language:
    'The language the visitor reads the application in, as BCP 47 tags it (fr, pt-BR): its translation into it, and the chat’s own words; the visitor’s browser’s by default.',
  'user-token':
    'A token your server signed with the deployment’s secret, naming your user (HS256: sub, name, exp at most an hour away): what an application that says user: signed opens its session with.',
} as const;

export type EmbedAttribute = keyof typeof EMBED_ATTRIBUTES;

/** Every attribute the element watches. */
export const EMBED_OBSERVED_ATTRIBUTES = Object.keys(
  EMBED_ATTRIBUTES,
) as EmbedAttribute[];

/**
 * What a host may set from its own stylesheet, on the element or above it
 * (D-11): the accent, the face and the mode. An attribute says the same and
 * wins over the variable.
 */
export const EMBED_HOST_VARIABLES = {
  accent: '--datalayer-app-accent',
  font: '--datalayer-app-font',
  theme: '--datalayer-app-theme',
} as const;

export type EmbedColorMode = 'light' | 'dark' | 'auto';

export const EMBED_COLOR_MODES: EmbedColorMode[] = ['light', 'dark', 'auto'];

/** The chat each floating mode is drawn as (`ChatFloating`'s view modes). */
export type EmbedFloatingView = 'floating-small' | 'panel' | 'assistant';

/**
 * The four modes (D-07), and the chat they float in: a **bubble** is the
 * round button that opens a popup — the copilot pattern; a **panel** is the
 * conversation at the page's right edge, at full height; the **assistant** is
 * the character that speaks in a balloon (§6.9). **Inline** has no chat of
 * its own to float: the application, its page and its conversation, sit in
 * the host's page where the element is.
 */
export const EMBED_FLOATING_VIEWS: Record<
  Exclude<AppEmbedMode, 'inline'>,
  EmbedFloatingView
> = {
  bubble: 'floating-small',
  panel: 'panel',
  assistant: 'assistant',
};

/** The chat a mode floats in; none for inline. */
export function floatingViewOf(
  mode: AppEmbedMode,
): EmbedFloatingView | undefined {
  return mode === 'inline' ? undefined : EMBED_FLOATING_VIEWS[mode];
}

/** A value the element refuses, said in a sentence for the page to show. */
export class EmbedAttributeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmbedAttributeError';
  }
}

/**
 * An application the embed can run, or a sentence saying why not: one with
 * an id, and an agent to answer — what the spec tolerates in a draft, an
 * embed cannot run.
 */
export function runnable({ app, problems }: ParsedAppspec): AppSpec {
  if (!app.id) {
    throw new EmbedAttributeError(
      `datalayer-app: the Appspec names no application${
        problems.length ? ` (${problems[0]})` : ''
      }.`,
    );
  }
  if (app.kind !== 'decision' && !app.agent) {
    throw new EmbedAttributeError(
      `datalayer-app: “${app.name || app.id}” names no agent to answer; an embedded application is run by an agent (a team is not supported yet).`,
    );
  }
  return app;
}

const listed = (values: readonly string[]): string =>
  `${values.slice(0, -1).join(', ')} or ${values[values.length - 1]}`;

function oneOf<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
  what: string,
): T | undefined {
  const text = value?.trim();
  if (!text) {
    return undefined;
  }
  if (!(allowed as readonly string[]).includes(text)) {
    throw new EmbedAttributeError(
      `datalayer-app: "${text}" is not ${what}; it is ${listed(allowed)}.`,
    );
  }
  return text as T;
}

/**
 * A font family a host names, checked: names, quotes, commas and spaces, as
 * a `font-family` is written — nothing that could close the declaration or
 * fetch anything (`;`, braces, `url(`).
 */
export function checkedFont(value: string | null | undefined): string {
  const text = value?.trim() ?? '';
  if (!text) {
    return '';
  }
  if (!/^[\w\s,"'.-]+$/u.test(text)) {
    throw new EmbedAttributeError(
      `datalayer-app: the font "${text}" is not a font family; write it as a CSS font-family is written, such as "Georgia, serif".`,
    );
  }
  return text;
}

/** What the element was told, as text: its attributes and the host's variables. */
export type EmbedInputs = {
  attributes: Partial<Record<EmbedAttribute, string | null>>;
  /** The host's CSS variables, read on the element (`EMBED_HOST_VARIABLES`). */
  variables?: Partial<Record<keyof typeof EMBED_HOST_VARIABLES, string>>;
};

/** How an application is shown and dressed in a host's page. */
export type EmbedLook = {
  mode: AppEmbedMode;
  /** The accent the host chose, or the application's own; none: the theme's own colours. */
  accent?: AppAccent;
  colorMode: EmbedColorMode;
  /** The host's face; empty for the theme's own. */
  font: string;
  /** The theme the application names (T-30); `loop` when it names none. */
  variant: AppThemeVariant;
};

/**
 * What the element shows and how, from what the host wrote and what the
 * application says: an attribute first, then the host's CSS variable, then
 * the Appspec, then the default. A value that is not one is refused with a
 * sentence (`EmbedAttributeError`), never quietly replaced.
 */
export function embedLookOf(
  inputs: EmbedInputs,
  app?: Pick<AppSpec, 'interface' | 'deployment'>,
): EmbedLook {
  const { attributes, variables = {} } = inputs;
  const mode =
    oneOf(attributes.mode, APP_EMBED_MODES, 'a mode') ??
    app?.deployment?.embedded?.mode ??
    'inline';
  const accent =
    oneOf(attributes.accent, APP_ACCENTS, 'an accent') ??
    oneOf(variables.accent, APP_ACCENTS, 'an accent') ??
    app?.interface?.accent;
  const colorMode =
    oneOf(attributes.theme, EMBED_COLOR_MODES, 'a theme') ??
    oneOf(variables.theme, EMBED_COLOR_MODES, 'a theme') ??
    app?.interface?.theme?.mode ??
    'auto';
  const font = checkedFont(attributes.font) || checkedFont(variables.font);
  const variant = app?.interface?.theme?.variant ?? 'loop';
  return { mode, accent, colorMode, font, variant };
}

/**
 * Whether a visit's conversation is picked up again after a reload (LOOP
 * D-13): on unless the host writes `resume="false"`. Anything else is
 * refused in a sentence.
 */
export function resumeOf(value: string | null | undefined): boolean {
  return (
    oneOf(value, ['true', 'false'] as const, 'a value of resume') !== 'false'
  );
}

/**
 * The language a host says its visitor reads (LOOP P-26), checked: a BCP 47
 * tag (`fr`, `pt-BR`), else refused in a sentence. Unsaid, none: the
 * visitor's browser's.
 */
export function languageOf(
  value: string | null | undefined,
): string | undefined {
  const text = value?.trim();
  if (!text) {
    return undefined;
  }
  if (!LANGUAGE_TAG.test(text)) {
    throw new EmbedAttributeError(
      `datalayer-app: "${text}" is not a language as BCP 47 tags it, such as fr or pt-BR.`,
    );
  }
  return text;
}

/** The height of an inline application, in pixels. */
export function inlineHeightOf(value: string | null | undefined): number {
  const height = Number.parseInt(value ?? '', 10);
  return Number.isFinite(height) && height >= 240 ? height : 640;
}

const attributeValue = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/** What a snippet says beside the application's id. */
export type EmbedSnippetOptions = {
  /** Where Datalayer is: the script's origin, and the element's. */
  origin: string;
  /** The application's id. */
  app: string;
  /** Written when given — the *Ship* tab writes the Appspec's own. */
  mode?: AppEmbedMode;
  /** An embed token, for an application that is not public. */
  token?: string;
  accent?: AppAccent;
  theme?: EmbedColorMode;
  font?: string;
};

/**
 * The snippet a host pastes (D-08): one script tag and one element. A public
 * application needs no token; a private one takes the token its owner was
 * issued for it, written as given, so the snippet works for as long as the
 * token lives — a host's own page writes the one its server is issued for
 * each visit.
 */
export function embedSnippetOf(options: EmbedSnippetOptions): string {
  const origin = options.origin.replace(/\/+$/, '');
  const attributes: Array<[string, string | undefined]> = [
    ['app', options.app],
    ['origin', origin],
    ['mode', options.mode],
    ['accent', options.accent],
    ['theme', options.theme],
    ['font', options.font ? checkedFont(options.font) : undefined],
    ['token', options.token],
  ];
  const written = attributes
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([name, value]) => ` ${name}="${attributeValue(value)}"`)
    .join('');
  return [
    `<script src="${attributeValue(origin + EMBED_SCRIPT_PATH)}" async></script>`,
    `<${EMBED_TAG}${written}></${EMBED_TAG}>`,
  ].join('\n');
}
