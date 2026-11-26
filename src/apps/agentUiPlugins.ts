/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The UI plugins an agent brings with it, by the ids its spec (or its
 * application) names under `ui` (the user, 15 November 2026: "make sure we
 * have fine grained plugins to be injected in the various seed agents we
 * focus on").
 *
 * The preset mounts what every chat needs; these are each one agent's own —
 * the Marketer's linked accounts, X budget and post previews, the Shopper's
 * comparison, basket and purchase approval, the Accountant's
 * reconciliation, trial balance and VAT, the Traveller's options, itinerary
 * and budget, Terra's scenes and index, the Steward's savings. Each draws
 * one tool or one fact, so an agent that names it gets it and every other
 * chat stays as it was.
 *
 * - `agentPlugins` adds them for `uiPlugins`, or for the spec it creates
 *   (`datalayerAgentSpecId`, `localAgentSpec`);
 * - `appPreset` adds them for an application's `ui`;
 * - `Chat` mounts them on a platform of its own for `uiPlugins`.
 *
 * An anonymous visitor gets only those that need no connection of the
 * person's (`needsConnection: false`): the cards that draw what the agent
 * passed, never the linked accounts, the X budget, a post or a purchase.
 * What needs one and has a place in the chat's chrome is drawn locked
 * instead, not hidden (the user, 14–15 November 2026: "if tools/features
 * are not available, indicate it visually so user is tempted to sign up /
 * sign in"): its entry's `locked` words, one chip each in the title bar,
 * each signing the visitor in (`lockedUiOf`, `lockedUiPluginsFor`,
 * `apps/plugins/locked-ui`).
 *
 * @module apps/agentUiPlugins
 */

import type { ComponentType } from 'react';
import type { PluginRef } from '@datalayer/reactor';
import { UI_CATALOGUE } from '../specs/ui';
import type { UiChoice } from '../types/agentspecs';
import { ANONYMOUS_WORDS } from '../chat/anonymous/anonymousMode';
import {
  CHROME_SLOTS,
  isChromePlacement,
  isSidePlacement,
  type SidePlacement,
  type ChromeComponentProps,
  type ChromePlacement,
} from './toolCards/chrome';
import { awsHeaderPlugin } from './plugins/aws-header';
import { AwsSavingsPlugin } from './plugins/aws-savings';
import {
  AwsSavingsBadge,
  awsSavingsBadgePlugin,
} from './plugins/aws-savings-badge';
import { BankReconciliationPlugin } from './plugins/bank-reconciliation';
import {
  ComposerPortalButton,
  composerPortalPlugin,
} from './plugins/composer-portal';
import { pluginManagerPlugin } from './plugins/plugin-manager';
import { BasketTotalChip, basketTotalPlugin } from './plugins/basket-total';
import { booksHeaderPlugin } from './plugins/books-header';
import { BlueskyPostPreviewPlugin } from './plugins/bluesky-post-preview';
import { EarthAreaChip, earthAreaPlugin } from './plugins/earth-area';
import { earthHeaderPlugin } from './plugins/earth-header';
import { EarthIndexPlugin } from './plugins/earth-index';
import { EarthScenesPlugin } from './plugins/earth-scenes';
import {
  LinkedInLinkButton,
  linkedInLinkPlugin,
} from './plugins/linkedin-link';
import { LinkedInPostPreviewPlugin } from './plugins/linkedin-post-preview';
import { lockedUiPlugin } from './plugins/locked-ui';
import { notebookHeaderPlugin } from './plugins/notebook-header';
import { analysisHeaderPlugin } from './plugins/analysis-header';
import { OdooContextChip, odooContextPlugin } from './plugins/odoo-context';
import { NoticesPlugin } from './plugins/notices';
import { pageNotebookSidePlugin } from './plugins/page-notebook';
import { pageDocumentSidePlugin } from './plugins/page-document';
import { PageDeckPlugin, pageDeckSidePlugin } from './plugins/page-deck';
import {
  PageExcalidrawPlugin,
  pageExcalidrawSidePlugin,
} from './plugins/page-excalidraw';
import {
  PageMermaidPlugin,
  pageMermaidSidePlugin,
} from './plugins/page-mermaid';
import {
  PageReactFlowPlugin,
  pageReactFlowSidePlugin,
} from './plugins/page-react-flow';
import { PageSheetPlugin, pageSheetSidePlugin } from './plugins/page-sheet';
import { PapPurchasePlugin } from './plugins/pap-purchase';
import { ProductCardsPlugin } from './plugins/product-cards';
import { ProductComparisonPlugin } from './plugins/product-comparison';
import { PublicLibraryPlugin } from './plugins/public-library';
import { shopHeaderPlugin } from './plugins/shop-header';
import { ShoppingBasketPlugin } from './plugins/shopping-basket';
import { SidePanelsPlugin } from './plugins/side-panels';
import { spacesSidePlugin } from './plugins/spaces';
import {
  SocialAccountsChips,
  SocialAccountsMessagePlugin,
  socialAccountsPlugin,
} from './plugins/social-accounts';
import { socialHeaderPlugin } from './plugins/social-header';
import { StripeCheckoutPlugin } from './plugins/stripe-checkout';
import { TrialBalancePlugin } from './plugins/trial-balance';
import { TripBudgetPlugin } from './plugins/trip-budget';
import { tripHeaderPlugin } from './plugins/trip-header';
import { TripItineraryPlugin } from './plugins/trip-itinerary';
import { TripMapPlugin } from './plugins/trip-map';
import { TripOptionsPlugin } from './plugins/trip-options';
import { TripSummaryChip, tripSummaryPlugin } from './plugins/trip-summary';
import { VatSummaryPlugin } from './plugins/vat-summary';
import { XBudgetChip } from './plugins/x-budget/XBudgetChip';
import { xBudgetPlugin } from './plugins/x-budget';
import { XPostPreviewPlugin } from './plugins/x-post-preview';

export type { UiPlacement, ChromePlacement } from './toolCards/chrome';

export type AgentUiPlugin = {
  /** Whether it needs the person's own connection: kept from a visitor. */
  needsConnection: boolean;
  /**
   * What it says, drawn locked for a visitor, when it needs a connection and
   * has a place in the chat's chrome: its chip signs the visitor in.
   */
  locked?: string;
  /** Its card in the conversation, when it has one. */
  message?: PluginRef;
  /**
   * Its card's live view in a side panel, its calls a line each in the
   * conversation (a deck, a sheet built in the page), when it can go there.
   */
  side?: (side: SidePlacement, tab?: string) => PluginRef;
  /** Its plugin for a chrome placement, when it has one (an Agent workspace). */
  chrome?: (placement: ChromePlacement, tab?: string) => PluginRef;
  /** What it draws in the chat's chrome (`Chat`, outside an Agent workspace). */
  Chrome?: ComponentType<ChromeComponentProps>;
};

/** Each agent UI plugin, by its UI spec's id. */
export const AGENT_UI_PLUGINS: Readonly<Record<string, AgentUiPlugin>> = {
  /*
   * The page's notebook and document live in a side panel only: their editor
   * and its kernel are the panel's, and a card in the conversation had
   * neither (the code-running tools waited for a kernel that never came).
   * Their UI specs place them `right` or `left`, `right` by default.
   */
  'page-notebook': {
    needsConnection: false,
    side: pageNotebookSidePlugin,
  },
  // Every public seed agent can browse the public Library. Publishing still
  // needs the signed-in owner and a confirmation in the page.
  'public-library': {
    needsConnection: false,
    message: PublicLibraryPlugin,
  },
  // The Marketer.
  'social-accounts': {
    needsConnection: true,
    locked: ANONYMOUS_WORDS.locked.social,
    chrome: socialAccountsPlugin,
    Chrome: SocialAccountsChips,
    message: SocialAccountsMessagePlugin,
  },
  'x-budget': {
    needsConnection: true,
    locked: ANONYMOUS_WORDS.locked.x,
    chrome: xBudgetPlugin,
    Chrome: () => XBudgetChip({}),
  },
  'x-post-preview': { needsConnection: true, message: XPostPreviewPlugin },
  'bluesky-post-preview': {
    needsConnection: true,
    message: BlueskyPostPreviewPlugin,
  },
  'linkedin-post-preview': {
    needsConnection: true,
    message: LinkedInPostPreviewPlugin,
  },
  'linkedin-link': {
    needsConnection: true,
    locked: ANONYMOUS_WORDS.locked.linkedin,
    chrome: linkedInLinkPlugin,
    Chrome: () => LinkedInLinkButton({}),
  },

  // The Shopper.
  'product-comparison': {
    needsConnection: false,
    message: ProductComparisonPlugin,
  },
  'shopping-basket': { needsConnection: false, message: ShoppingBasketPlugin },
  'basket-total': {
    needsConnection: false,
    chrome: basketTotalPlugin,
    Chrome: BasketTotalChip,
  },
  'pap-purchase': { needsConnection: true, message: PapPurchasePlugin },
  // The demo shop, in its own chat and in the Shopper's.
  'product-cards': { needsConnection: false, message: ProductCardsPlugin },
  // The Accountant.
  'bank-reconciliation': {
    needsConnection: false,
    message: BankReconciliationPlugin,
  },
  'trial-balance': { needsConnection: false, message: TrialBalancePlugin },
  'vat-summary': { needsConnection: false, message: VatSummaryPlugin },
  'odoo-context': {
    needsConnection: false,
    chrome: odooContextPlugin,
    Chrome: OdooContextChip,
  },
  // The Traveller.
  'trip-options': { needsConnection: false, message: TripOptionsPlugin },
  'trip-itinerary': { needsConnection: false, message: TripItineraryPlugin },
  'trip-map': { needsConnection: false, message: TripMapPlugin },
  'trip-budget': { needsConnection: false, message: TripBudgetPlugin },
  'trip-summary': {
    needsConnection: false,
    chrome: tripSummaryPlugin,
    Chrome: TripSummaryChip,
  },
  // Terra.
  'earth-scenes': { needsConnection: false, message: EarthScenesPlugin },
  'earth-index': { needsConnection: false, message: EarthIndexPlugin },
  'earth-area': {
    needsConnection: false,
    chrome: earthAreaPlugin,
    Chrome: EarthAreaChip,
  },
  // The Cloud Steward.
  'aws-savings': { needsConnection: false, message: AwsSavingsPlugin },
  'aws-savings-badge': {
    needsConnection: false,
    chrome: awsSavingsBadgePlugin,
    Chrome: AwsSavingsBadge,
  },
  /*
   * Each seed agent's title bar (18 November 2026): buttons, drop-downs and
   * indicators, declared by its UI spec's `header` and set by the agent with
   * the header's frontend tool (`toolCards/headerItems`). None needs a
   * connection of the person's: a visitor's demo has them. An Agent
   * workspace's (an Application's); `Chat` does not draw them.
   */
  'social-header': { needsConnection: false, chrome: socialHeaderPlugin },
  'shop-header': { needsConnection: false, chrome: shopHeaderPlugin },
  'books-header': { needsConnection: false, chrome: booksHeaderPlugin },
  'trip-header': { needsConnection: false, chrome: tripHeaderPlugin },
  'earth-header': { needsConnection: false, chrome: earthHeaderPlugin },
  'aws-header': { needsConnection: false, chrome: awsHeaderPlugin },
  'notebook-header': { needsConnection: false, chrome: notebookHeaderPlugin },
  'analysis-header': { needsConnection: false, chrome: analysisHeaderPlugin },
  /*
   * What an agent builds in the conversation with frontend tools run in the
   * page (18 November 2026): the Marketer's deck, the Accountant's sheet.
   * Each hands the chat's agent its tool set and draws the calls. Neither
   * needs a connection of the person's: a visitor's demo has them.
   */
  'page-deck': {
    needsConnection: false,
    message: PageDeckPlugin,
    side: pageDeckSidePlugin,
  },
  'page-document': {
    needsConnection: false,
    side: pageDocumentSidePlugin,
  },
  /*
   * The person's Datalayer Spaces (the user, 24 November 2026): their
   * documents and notebooks listed, opened in tabs of a side panel and saved
   * back, with their own sign-in. Kept from a visitor, who has no Spaces.
   */
  spaces: {
    needsConnection: true,
    side: spacesSidePlugin,
  },
  'page-sheet': {
    needsConnection: false,
    message: PageSheetPlugin,
    side: pageSheetSidePlugin,
  },
  // The Functional Analyst's canvas and diagrams (19 November 2026): the tools of
  // @datalayer/reactor-excalidraw and @datalayer/reactor-mermaid, in the page.
  'page-excalidraw': {
    needsConnection: false,
    message: PageExcalidrawPlugin,
    side: pageExcalidrawSidePlugin,
  },
  'page-mermaid': {
    needsConnection: false,
    message: PageMermaidPlugin,
    side: pageMermaidSidePlugin,
  },
  'page-react-flow': {
    needsConnection: false,
    message: PageReactFlowPlugin,
    side: pageReactFlowSidePlugin,
  },
  /*
   * Every agent's: it opens and closes the side panels (`side-panels`), and
   * slides a short notice in from an edge (`notices`), with frontend tools
   * run in the page (18 November 2026). Nothing needs a connection.
   */
  'side-panels': { needsConnection: false, message: SidePanelsPlugin },
  notices: { needsConnection: false, message: NoticesPlugin },
  /*
   * How the application is built, from its chat (the user, 21 November
   * 2026): a button in the toolbar opening its Composer full screen — its
   * Canvas, its spec and its Python, read only. Nothing needs a connection:
   * a visitor has it.
   */
  'composer-portal': {
    needsConnection: false,
    chrome: composerPortalPlugin,
    Chrome: ComposerPortalButton,
  },
  /*
   * The plugins of the page, from a button in the footer (the user,
   * 21 November 2026): Reactor's plugins manager in a dialog. An Agent
   * workspace's only — it lists the workspace's platform; a `Chat` outside
   * one has no platform of the page's to list, so no `Chrome`. Nothing needs
   * a connection: a visitor has it.
   */
  'plugin-manager': { needsConnection: false, chrome: pluginManagerPlugin },
  // Stripe (test mode).
  'stripe-checkout': { needsConnection: true, message: StripeCheckoutPlugin },
};

/**
 * UI the preset mounts in every chat, which a spec may still name: never
 * mounted twice. `browser-session` is drawn by its own plugin in the Agent workspace
 * workspace and by `Chat` itself (its button) once a spec brings it.
 */
export const PRESET_UI = new Set([
  'chat',
  'a2ui-surface',
  'pap-sign-in',
  'browser-session',
]);

/**
 * What a visitor sees locked of the preset's UI a spec names (it has no
 * `AGENT_UI_PLUGINS` entry): the linkedin MCP server's browser session.
 */
export const PRESET_UI_LOCKED: Readonly<Record<string, string>> = {
  'browser-session': ANONYMOUS_WORDS.locked.linkedin,
};

import { placementOf, type AgentUiChoice } from './agentUiChoices';

// The agent's UI choices, read from its spec without loading any plugin
// (`apps/agentUiChoices`): kept apart so that a page listing them (the
// Canvas) does not load every plugin.
export {
  agentUiChoicesOf,
  agentUiIdsOf,
  placementOf,
  uiPluginIdsOfSpec,
  type AgentUiChoice,
  type AgentUiComponents,
} from './agentUiChoices';

/**
 * These choices without the UI another of them stands in for (a UI spec's
 * `supersedes`: `shop-header` for `basket-total`…), whoever brought it: the
 * fact is said once in the title bar. Only a UI that is drawn stands in for
 * another (`drawn`): where a header UI is not (`Chat`, which draws the
 * chips), the chip stays.
 */
export function withoutSuperseded<T extends { plugin: string }>(
  choices: readonly T[],
  drawn: (plugin: string) => boolean = () => true,
): T[] {
  const superseded = new Set(
    choices
      .filter(choice => drawn(choice.plugin))
      .flatMap(choice => UI_CATALOGUE[choice.plugin]?.supersedes ?? []),
  );
  return superseded.size > 0
    ? choices.filter(choice => !superseded.has(choice.plugin))
    : [...choices];
}

const asChoice = (given: string | UiChoice | AgentUiChoice): AgentUiChoice =>
  typeof given === 'string'
    ? { plugin: given, placement: placementOf({ plugin: given }) }
    : { ...given, placement: placementOf(given) };

/**
 * The Reactor plugins of these UIs, each once, in the order named, each for
 * its placement: a message UI's card plugin, a chrome UI's plugin in its
 * placement's slot. Ids the preset mounts anyway (`chat`, `a2ui-surface`…),
 * or unknown are passed over. A message UI placed in a side panel draws its
 * live view there (`side`), a chrome UI its component.
 * For an anonymous visitor, only those that need no connection.
 */
export function agentUiPluginsFor(
  given: ReadonlyArray<string | UiChoice | AgentUiChoice> | undefined,
  options: { anonymous?: boolean } = {},
): PluginRef[] {
  const seen = new Set<string>();
  const plugins: PluginRef[] = [];
  for (const choice of withoutSuperseded((given ?? []).map(asChoice), plugin =>
    Boolean(
      AGENT_UI_PLUGINS[plugin]?.chrome &&
      !(options.anonymous && AGENT_UI_PLUGINS[plugin].needsConnection),
    ),
  )) {
    const entry = AGENT_UI_PLUGINS[choice.plugin];
    if (
      !entry ||
      seen.has(choice.plugin) ||
      (options.anonymous && entry.needsConnection)
    ) {
      continue;
    }
    let plugin: PluginRef | undefined;
    if (choice.placement === 'message') {
      plugin = entry.message;
    } else if (isSidePlacement(choice.placement) && entry.side) {
      plugin = entry.side(choice.placement, choice.tab);
    } else if (
      isChromePlacement(choice.placement) &&
      CHROME_SLOTS[choice.placement]
    ) {
      plugin = entry.chrome?.(choice.placement, choice.tab);
    }
    if (plugin) {
      seen.add(choice.plugin);
      plugins.push(plugin);
    }
  }
  return plugins;
}

/** The chrome UIs of these choices, by placement, for a `Chat` to draw. */
export function agentUiChromeOf(
  given: ReadonlyArray<string | UiChoice | AgentUiChoice> | undefined,
  options: { anonymous?: boolean } = {},
): Record<ChromePlacement, string[]> {
  const placed: Record<ChromePlacement, string[]> = {
    header: [],
    toolbar: [],
    footer: [],
    banner: [],
    left: [],
    right: [],
  };
  for (const choice of withoutSuperseded((given ?? []).map(asChoice), plugin =>
    Boolean(AGENT_UI_PLUGINS[plugin]?.Chrome),
  )) {
    if (!isChromePlacement(choice.placement)) {
      continue;
    }
    const entry = AGENT_UI_PLUGINS[choice.plugin];
    const preset = PRESET_UI.has(choice.plugin);
    if (
      (!entry?.Chrome && !preset) ||
      (options.anonymous && (entry?.needsConnection ?? true))
    ) {
      continue;
    }
    if (!placed[choice.placement].includes(choice.plugin)) {
      placed[choice.placement].push(choice.plugin);
    }
  }
  return placed;
}

/**
 * What a visitor sees locked of these UIs (the user, 15 November 2026): the
 * `locked` words of each that needs a connection and goes in the chat's
 * chrome, each once, in the order named. Message UIs (a post preview, a
 * purchase) have no place before the agent answers, and are left out.
 */
export function lockedUiOf(
  given: ReadonlyArray<string | UiChoice | AgentUiChoice> | undefined,
): string[] {
  const labels: string[] = [];
  for (const choice of (given ?? []).map(asChoice)) {
    const entry = AGENT_UI_PLUGINS[choice.plugin];
    const locked = entry
      ? entry.needsConnection
        ? entry.locked
        : undefined
      : PRESET_UI_LOCKED[choice.plugin];
    if (
      locked &&
      isChromePlacement(choice.placement) &&
      !labels.includes(locked)
    ) {
      labels.push(locked);
    }
  }
  return labels;
}

/**
 * For a visitor, the plugin drawing these UIs' locked chips in the chat's
 * title bar (`@datalayer/agent-plugin-locked-ui`); none when nothing is
 * locked.
 */
export function lockedUiPluginsFor(
  given: ReadonlyArray<string | UiChoice | AgentUiChoice> | undefined,
): PluginRef[] {
  const labels = lockedUiOf(given);
  return labels.length > 0 ? [lockedUiPlugin(labels)] : [];
}

/**
 * What a visitor does not get of these UIs, by their UI specs' names, each
 * once, in the order named (the user, 20 November 2026): each that needs the
 * person's own connection, wherever it goes — what the limited-preview
 * indicator names as disabled (`apps/plugins/limited-preview`).
 */
export function disabledUiOf(
  given: ReadonlyArray<string | UiChoice | AgentUiChoice> | undefined,
): string[] {
  const names: string[] = [];
  for (const choice of (given ?? []).map(asChoice)) {
    const entry = AGENT_UI_PLUGINS[choice.plugin];
    const kept = entry
      ? entry.needsConnection
      : choice.plugin in PRESET_UI_LOCKED;
    const name = kept ? UI_CATALOGUE[choice.plugin]?.name : undefined;
    if (name && !names.includes(name)) {
      names.push(name);
    }
  }
  return names;
}

/** The plugin of a UI at its default placement: what its UI spec says it registers. */
export function defaultPluginOf(id: string): PluginRef | undefined {
  return agentUiPluginsFor([id])[0];
}
