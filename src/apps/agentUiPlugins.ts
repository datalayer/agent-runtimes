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
 * reconciliation, trial balance and VAT, the Voyager's options, itinerary
 * and budget, Terra's scenes and index, the Steward's savings. Each draws
 * one tool or one fact, so an agent that names it gets it and every other
 * chat stays as it was.
 *
 * - `loopPlugins` adds them for `uiPlugins`, or for the spec it creates
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
import { AGENTSPECS } from '../specs/agents';
import { getSkillSpec } from '../specs/skills';
import { UI_CATALOGUE } from '../specs/ui';
import type { UiChoice } from '../types/agentspecs';
import { ANONYMOUS_WORDS } from '../chat/anonymous/anonymousMode';
import {
  CHROME_SLOTS,
  isChromePlacement,
  type ChromeComponentProps,
  type ChromePlacement,
  type UiPlacement,
} from './toolCards/chrome';
import { AwsSavingsPlugin } from './plugins/aws-savings';
import {
  AwsSavingsBadge,
  awsSavingsBadgePlugin,
} from './plugins/aws-savings-badge';
import { BankReconciliationPlugin } from './plugins/bank-reconciliation';
import { BasketTotalChip, basketTotalPlugin } from './plugins/basket-total';
import { BlueskyPostPreviewPlugin } from './plugins/bluesky-post-preview';
import { EarthAreaChip, earthAreaPlugin } from './plugins/earth-area';
import { EarthIndexPlugin } from './plugins/earth-index';
import { EarthScenesPlugin } from './plugins/earth-scenes';
import {
  LinkedInLinkButton,
  linkedInLinkPlugin,
} from './plugins/linkedin-link';
import { LinkedInPostPreviewPlugin } from './plugins/linkedin-post-preview';
import { lockedUiPlugin } from './plugins/locked-ui';
import { OdooContextChip, odooContextPlugin } from './plugins/odoo-context';
import { PapPurchasePlugin } from './plugins/pap-purchase';
import { ProductComparisonPlugin } from './plugins/product-comparison';
import { ShoppingBasketPlugin } from './plugins/shopping-basket';
import {
  SocialAccountsChips,
  SocialAccountsMessagePlugin,
  socialAccountsPlugin,
} from './plugins/social-accounts';
import { StripeCheckoutPlugin } from './plugins/stripe-checkout';
import { TrialBalancePlugin } from './plugins/trial-balance';
import { TripBudgetPlugin } from './plugins/trip-budget';
import { TripItineraryPlugin } from './plugins/trip-itinerary';
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
  /** Its plugin for a chrome placement, when it has one (a Loop workspace). */
  chrome?: (placement: ChromePlacement) => PluginRef;
  /** What it draws in the chat's chrome (`Chat`, outside a Loop workspace). */
  Chrome?: ComponentType<ChromeComponentProps>;
};

/** Each agent UI plugin, by its UI spec's id. */
export const AGENT_UI_PLUGINS: Readonly<Record<string, AgentUiPlugin>> = {
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
  // The Voyager.
  'trip-options': { needsConnection: false, message: TripOptionsPlugin },
  'trip-itinerary': { needsConnection: false, message: TripItineraryPlugin },
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
  // The Steward for AWS.
  'aws-savings': { needsConnection: false, message: AwsSavingsPlugin },
  'aws-savings-badge': {
    needsConnection: false,
    chrome: awsSavingsBadgePlugin,
    Chrome: AwsSavingsBadge,
  },
  // Stripe (test mode).
  'stripe-checkout': { needsConnection: true, message: StripeCheckoutPlugin },
};

/**
 * UI the preset mounts in every chat, which a spec may still name: never
 * mounted twice. `browser-session` is drawn by its own plugin in a Loop
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

/** A UI the chat injects, where it goes. */
export type AgentUiChoice = {
  plugin: string;
  placement: UiPlacement;
  renderer?: string;
};

/** Where a UI goes: its declaration's placement, else its spec's first, else a message. */
export function placementOf(choice: UiChoice): UiPlacement {
  return (
    choice.placement ??
    UI_CATALOGUE[choice.plugin]?.placements?.[0] ??
    'message'
  );
}

/** What the chat knows of the agent's components while it runs. */
export type AgentUiComponents = {
  /** The MCP servers running, by id; unsaid, the spec's, but those left out. */
  running?: readonly string[];
  /** The skills enabled, by id; unsaid, the spec's, but those left out. */
  skills?: readonly string[];
  /** The optional servers and skills left out (their secret missing), by id. */
  leftOut?: readonly string[];
};

const bare = (id: string): string => id.split(':')[0];

/**
 * The chat's UI, each where it goes (the user, 15 November 2026: "Add the
 * ability for the mcp and skills to define a list of ui that will also be
 * injected", then "make sure ui can be used to be injected in the chat
 * itself (toolbar, header...) or as chat message (a2ui)"): the agent's own
 * `ui`, then the `ui` of each MCP server running, of each skill enabled, of
 * each backend tool it carries — each plugin once, at the first placement
 * named. An optional server or skill left out brings none.
 */
export function agentUiChoicesOf(
  specId: string | undefined,
  components: AgentUiComponents = {},
): AgentUiChoice[] {
  // By its id, with or without its version (`worker-marketer:0.0.1`).
  const spec = specId
    ? (AGENTSPECS[specId] ?? AGENTSPECS[bare(specId)])
    : undefined;
  if (!spec) {
    return [];
  }
  const leftOut = new Set((components.leftOut ?? []).map(bare));
  const running = components.running
    ? new Set(components.running.map(bare))
    : undefined;
  const enabledSkills = components.skills
    ? new Set(components.skills.map(bare))
    : undefined;
  const servers = (spec.mcpServers ?? []).filter(
    server =>
      server &&
      !leftOut.has(server.id) &&
      (running === undefined || running.has(server.id)),
  );
  const skills = (spec.skills ?? []).filter(
    skill =>
      skill &&
      !leftOut.has(skill.id) &&
      (enabledSkills === undefined || enabledSkills.has(skill.id)),
  );
  const named: UiChoice[] = [
    ...(spec.ui ?? []),
    ...servers.flatMap(server => server.ui ?? []),
    ...skills.flatMap(skill => getSkillSpec(skill.id)?.ui ?? []),
    ...(spec.backendTools ?? []).filter(Boolean).flatMap(tool => tool.ui ?? []),
  ];
  const seen = new Set<string>();
  const choices: AgentUiChoice[] = [];
  for (const choice of named) {
    if (seen.has(choice.plugin)) {
      continue;
    }
    seen.add(choice.plugin);
    choices.push({
      plugin: choice.plugin,
      placement: placementOf(choice),
      ...(choice.renderer ? { renderer: choice.renderer } : {}),
    });
  }
  return choices;
}

/** The chat's UI, by id, in order (`agentUiChoicesOf` without the placements). */
export function agentUiIdsOf(
  specId: string | undefined,
  components: AgentUiComponents = {},
): string[] {
  return agentUiChoicesOf(specId, components).map(choice => choice.plugin);
}

/** The UI plugin ids of an agent spec: its own and its components'. */
export function uiPluginIdsOfSpec(specId: string | undefined): string[] {
  return agentUiIdsOf(specId);
}

const asChoice = (given: string | UiChoice | AgentUiChoice): AgentUiChoice =>
  typeof given === 'string'
    ? { plugin: given, placement: placementOf({ plugin: given }) }
    : { ...given, placement: placementOf(given) };

/**
 * The Reactor plugins of these UIs, each once, in the order named, each for
 * its placement: a message UI's card plugin, a chrome UI's plugin in its
 * placement's slot. Ids the preset mounts anyway (`chat`, `a2ui-surface`…),
 * unknown, or placed where the chat has no slot (`panel`) are passed over.
 * For an anonymous visitor, only those that need no connection.
 */
export function agentUiPluginsFor(
  given: ReadonlyArray<string | UiChoice | AgentUiChoice> | undefined,
  options: { anonymous?: boolean } = {},
): PluginRef[] {
  const seen = new Set<string>();
  const plugins: PluginRef[] = [];
  for (const choice of (given ?? []).map(asChoice)) {
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
    } else if (
      isChromePlacement(choice.placement) &&
      CHROME_SLOTS[choice.placement]
    ) {
      plugin = entry.chrome?.(choice.placement);
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
    panel: [],
  };
  for (const choice of (given ?? []).map(asChoice)) {
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
 * title bar (`@datalayer/loop-plugin-locked-ui`); none when nothing is
 * locked.
 */
export function lockedUiPluginsFor(
  given: ReadonlyArray<string | UiChoice | AgentUiChoice> | undefined,
): PluginRef[] {
  const labels = lockedUiOf(given);
  return labels.length > 0 ? [lockedUiPlugin(labels)] : [];
}

/** The plugin of a UI at its default placement: what its UI spec says it registers. */
export function defaultPluginOf(id: string): PluginRef | undefined {
  return agentUiPluginsFor([id])[0];
}
