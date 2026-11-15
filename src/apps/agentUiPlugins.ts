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
 *
 * @module apps/agentUiPlugins
 */

import type { PluginRef } from '@datalayer/reactor';
import { AGENTSPECS } from '../specs/agents';
import { getSkillSpec } from '../specs/skills';
import type { UiChoice } from '../types/agentspecs';
import { AwsSavingsPlugin } from './plugins/aws-savings';
import { BankReconciliationPlugin } from './plugins/bank-reconciliation';
import { BlueskyPostPreviewPlugin } from './plugins/bluesky-post-preview';
import { EarthIndexPlugin } from './plugins/earth-index';
import { EarthScenesPlugin } from './plugins/earth-scenes';
import { LinkedInLinkPlugin } from './plugins/linkedin-link';
import { LinkedInPostPreviewPlugin } from './plugins/linkedin-post-preview';
import { PapPurchasePlugin } from './plugins/pap-purchase';
import { ProductComparisonPlugin } from './plugins/product-comparison';
import { ShoppingBasketPlugin } from './plugins/shopping-basket';
import { SocialAccountsPlugin } from './plugins/social-accounts';
import { StripeCheckoutPlugin } from './plugins/stripe-checkout';
import { TrialBalancePlugin } from './plugins/trial-balance';
import { TripBudgetPlugin } from './plugins/trip-budget';
import { TripItineraryPlugin } from './plugins/trip-itinerary';
import { TripOptionsPlugin } from './plugins/trip-options';
import { VatSummaryPlugin } from './plugins/vat-summary';
import { XBudgetPlugin } from './plugins/x-budget';
import { XPostPreviewPlugin } from './plugins/x-post-preview';

export type AgentUiPlugin = {
  plugin: PluginRef;
  /** Whether it needs the person's own connection: kept from a visitor. */
  needsConnection: boolean;
};

/** Each agent UI plugin, by its UI spec's id. */
export const AGENT_UI_PLUGINS: Readonly<Record<string, AgentUiPlugin>> = {
  // The Marketer.
  'social-accounts': { plugin: SocialAccountsPlugin, needsConnection: true },
  'x-budget': { plugin: XBudgetPlugin, needsConnection: true },
  'x-post-preview': { plugin: XPostPreviewPlugin, needsConnection: true },
  'bluesky-post-preview': {
    plugin: BlueskyPostPreviewPlugin,
    needsConnection: true,
  },
  'linkedin-post-preview': {
    plugin: LinkedInPostPreviewPlugin,
    needsConnection: true,
  },
  'linkedin-link': { plugin: LinkedInLinkPlugin, needsConnection: true },
  // Stripe (test mode).
  'stripe-checkout': { plugin: StripeCheckoutPlugin, needsConnection: true },
  // The Shopper.
  'product-comparison': {
    plugin: ProductComparisonPlugin,
    needsConnection: false,
  },
  'shopping-basket': { plugin: ShoppingBasketPlugin, needsConnection: false },
  'pap-purchase': { plugin: PapPurchasePlugin, needsConnection: true },
  // The Accountant.
  'bank-reconciliation': {
    plugin: BankReconciliationPlugin,
    needsConnection: false,
  },
  'trial-balance': { plugin: TrialBalancePlugin, needsConnection: false },
  'vat-summary': { plugin: VatSummaryPlugin, needsConnection: false },
  // The Voyager.
  'trip-options': { plugin: TripOptionsPlugin, needsConnection: false },
  'trip-itinerary': { plugin: TripItineraryPlugin, needsConnection: false },
  'trip-budget': { plugin: TripBudgetPlugin, needsConnection: false },
  // Terra.
  'earth-scenes': { plugin: EarthScenesPlugin, needsConnection: false },
  'earth-index': { plugin: EarthIndexPlugin, needsConnection: false },
  // The Steward for AWS.
  'aws-savings': { plugin: AwsSavingsPlugin, needsConnection: false },
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

/** Ids, each once, in the order first named. */
function once(ids: Iterable<string>): string[] {
  return [...new Set(ids)];
}

const pluginsOf = (choices: readonly UiChoice[] | undefined): string[] =>
  (choices ?? []).map(choice => choice.plugin);

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
 * The chat's UI, by id (the user, 15 November 2026: "Add the ability for
 * the mcp and skills to define a list of ui that will also be injected"):
 * the agent's own `ui`, then the `ui` of each MCP server running, then that
 * of each skill enabled, then that of each backend tool it carries — each
 * once, in that order. An optional server or skill left out brings none.
 */
export function agentUiIdsOf(
  specId: string | undefined,
  components: AgentUiComponents = {},
): string[] {
  const spec = specId ? AGENTSPECS[specId] : undefined;
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
  return once([
    ...pluginsOf(spec.ui),
    ...servers.flatMap(server => pluginsOf(server.ui)),
    ...skills.flatMap(skill => pluginsOf(getSkillSpec(skill.id)?.ui)),
    ...((spec.backendTools ?? []) as Array<{ ui?: UiChoice[] } | undefined>)
      .filter(Boolean)
      .flatMap(tool => pluginsOf(tool?.ui)),
  ]);
}

/** The UI plugin ids of an agent spec: its own and its components'. */
export function uiPluginIdsOfSpec(specId: string | undefined): string[] {
  return agentUiIdsOf(specId);
}

/**
 * The agent UI plugins among these ids, each once, in the order named; ids
 * the preset mounts anyway (`chat`, `a2ui-surface`…) or unknown are passed
 * over. For an anonymous visitor, only those that need no connection.
 */
export function agentUiPluginsFor(
  ids: readonly string[] | undefined,
  options: { anonymous?: boolean } = {},
): PluginRef[] {
  const seen = new Set<string>();
  const plugins: PluginRef[] = [];
  for (const id of ids ?? []) {
    const entry = AGENT_UI_PLUGINS[id];
    if (
      !entry ||
      seen.has(id) ||
      (options.anonymous && entry.needsConnection)
    ) {
      continue;
    }
    seen.add(id);
    plugins.push(entry.plugin);
  }
  return plugins;
}
