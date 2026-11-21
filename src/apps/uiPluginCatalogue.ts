/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The UI plugins as a Reactor lists them, before any of their code is
 * fetched: one lazy plugin per UI spec on a platform that is never started,
 * so a host reads each plugin's manifest (`getManifest`) — what the
 * Agentspecs pages show — without loading the 74 plugin modules.
 *
 * A lazy plugin's reference *is* its manifest, and its `load` the entry
 * point: each reference here spreads the same `uiManifestOfSpec` its plugin
 * spreads into its own definition, under the name the plugin registers
 * under, and loads the module its spec's `implementation` names through a
 * literal `import()` (`UI_PLUGIN_MODULES`), so a bundler makes one chunk per
 * plugin and fetches it only when that plugin is loaded. agent-runtimes'
 * ui-plugin-catalogue test holds each manifest here to the one the loaded
 * plugin gives the reactor, and each loader to its spec's export.
 *
 * @module apps/uiPluginCatalogue
 */

import {
  buildReactorFromPlugins,
  defineLazyPlugin,
  type LazyPluginRef,
  type PluginManifest,
  type ReactorPlatform,
  type ReactorPlugin,
} from '@datalayer/reactor';
import { listUI } from '../specs/ui';
import type { UISpec } from '../types/agentspecs';
import {
  uiManifestMetadataOf,
  uiManifestOfSpec,
  type UiManifestMetadata,
} from './uiManifest';

/**
 * Each UI plugin's module, by its folder under `apps/plugins` — the
 * `lib/apps/plugins/<folder>` its spec's `implementation.module` names.
 * Literal imports, one per plugin: what a bundler splits on.
 */
export const UI_PLUGIN_MODULES: Record<
  string,
  () => Promise<Record<string, unknown>>
> = {
  a2ui: () => import('./plugins/a2ui'),
  'a2ui-surface': () => import('./plugins/a2ui-surface'),
  agentspecs: () => import('./plugins/agentspecs'),
  'analysis-header': () => import('./plugins/analysis-header'),
  'app-activity': () => import('./plugins/app-activity'),
  'app-components': () => import('./plugins/app-components'),
  'app-computer': () => import('./plugins/app-computer'),
  'app-elements': () => import('./plugins/app-elements'),
  'app-page': () => import('./plugins/app-page'),
  'app-rules': () => import('./plugins/app-rules'),
  'aws-header': () => import('./plugins/aws-header'),
  'aws-savings': () => import('./plugins/aws-savings'),
  'aws-savings-badge': () => import('./plugins/aws-savings-badge'),
  'bank-reconciliation': () => import('./plugins/bank-reconciliation'),
  'basket-total': () => import('./plugins/basket-total'),
  'bluesky-post-preview': () => import('./plugins/bluesky-post-preview'),
  'books-header': () => import('./plugins/books-header'),
  'browser-session': () => import('./plugins/browser-session'),
  'canvas-blocks': () => import('./plugins/canvas-blocks'),
  'canvas-parts': () => import('./plugins/canvas-parts'),
  chat: () => import('./plugins/chat'),
  'chat-extras': () => import('./plugins/chat-extras'),
  'chat-header': () => import('./plugins/chat-header'),
  'chat-view': () => import('./plugins/chat-view'),
  commands: () => import('./plugins/commands'),
  'composer-portal': () => import('./plugins/composer-portal'),
  document: () => import('./plugins/document'),
  'document-toolbar': () => import('./plugins/document-toolbar'),
  'document-view': () => import('./plugins/document-view'),
  'earth-area': () => import('./plugins/earth-area'),
  'earth-header': () => import('./plugins/earth-header'),
  'earth-index': () => import('./plugins/earth-index'),
  'earth-scenes': () => import('./plugins/earth-scenes'),
  'input-prompt': () => import('./plugins/input-prompt'),
  'linkedin-link': () => import('./plugins/linkedin-link'),
  'linkedin-post-preview': () => import('./plugins/linkedin-post-preview'),
  models: () => import('./plugins/models'),
  notebook: () => import('./plugins/notebook'),
  'notebook-header': () => import('./plugins/notebook-header'),
  'notebook-toolbar': () => import('./plugins/notebook-toolbar'),
  'notebook-view': () => import('./plugins/notebook-view'),
  notices: () => import('./plugins/notices'),
  'odoo-context': () => import('./plugins/odoo-context'),
  'page-deck': () => import('./plugins/page-deck'),
  'page-excalidraw': () => import('./plugins/page-excalidraw'),
  'page-layout': () => import('./plugins/page-layout'),
  'page-mermaid': () => import('./plugins/page-mermaid'),
  'page-sheet': () => import('./plugins/page-sheet'),
  'pap-purchase': () => import('./plugins/pap-purchase'),
  'pap-sign-in': () => import('./plugins/pap-sign-in'),
  'plugin-manager': () => import('./plugins/plugin-manager'),
  'product-cards': () => import('./plugins/product-cards'),
  'product-comparison': () => import('./plugins/product-comparison'),
  prompt: () => import('./plugins/prompt'),
  'shop-header': () => import('./plugins/shop-header'),
  'shopping-basket': () => import('./plugins/shopping-basket'),
  'side-panels': () => import('./plugins/side-panels'),
  'social-accounts': () => import('./plugins/social-accounts'),
  'social-header': () => import('./plugins/social-header'),
  spreadsheet: () => import('./plugins/spreadsheet'),
  'spreadsheet-view': () => import('./plugins/spreadsheet-view'),
  'stripe-checkout': () => import('./plugins/stripe-checkout'),
  'subagent-activity': () => import('./plugins/subagent-activity'),
  'trial-balance': () => import('./plugins/trial-balance'),
  'trip-budget': () => import('./plugins/trip-budget'),
  'trip-header': () => import('./plugins/trip-header'),
  'trip-itinerary': () => import('./plugins/trip-itinerary'),
  'trip-map': () => import('./plugins/trip-map'),
  'trip-options': () => import('./plugins/trip-options'),
  'trip-summary': () => import('./plugins/trip-summary'),
  'vat-summary': () => import('./plugins/vat-summary'),
  'window-frame': () => import('./plugins/window-frame'),
  'x-budget': () => import('./plugins/x-budget'),
  'x-post-preview': () => import('./plugins/x-post-preview'),
};

/**
 * What a UI spec's export is, fetched: its module, then the export it names.
 * Rejects for a folder `UI_PLUGIN_MODULES` does not have, or a module without
 * the export.
 */
export async function loadUiPluginExport(spec: UISpec): Promise<unknown> {
  const load = UI_PLUGIN_MODULES[spec.folder];
  if (!load) {
    throw new Error(
      `${spec.id}: no module for the plugin folder ${spec.folder}`,
    );
  }
  const module = await load();
  const exported = spec.implementation.export;
  if (!(exported in module)) {
    throw new Error(
      `${spec.id}: ${spec.implementation.module} exports no ${exported}`,
    );
  }
  return module[exported];
}

/**
 * The lazy plugin of a UI spec: its manifest, declared up-front, and the
 * module that is it. Only a spec whose export is the plugin (`kind: plugin`)
 * loads into one; a list of instances or a factory is mounted by its host,
 * with the application or the placement it is made for, and its load says so.
 */
export function uiPluginRefOf(spec: UISpec): LazyPluginRef {
  return defineLazyPlugin({
    name: spec.plugin,
    ...uiManifestOfSpec(spec),
    load: async () => {
      if (spec.implementation.kind !== 'plugin') {
        throw new Error(
          `${spec.id}: its ${spec.implementation.export} is a ${spec.implementation.kind === 'plugins' ? 'list of plugins, one per instance' : 'factory'}, mounted by its host`,
        );
      }
      return (await loadUiPluginExport(spec)) as ReactorPlugin<any, any, any>;
    },
  });
}

let platform: ReactorPlatform | undefined;

/**
 * The platform holding every UI plugin, lazy and never started: a reader
 * of manifests. Built once.
 */
export function uiPluginPlatform(): ReactorPlatform {
  platform ??= buildReactorFromPlugins(listUI().map(uiPluginRefOf));
  return platform;
}

/** A UI plugin's manifest, and what it says of its UI spec under `metadata.ui`. */
export type UiPluginManifest = PluginManifest & { ui: UiManifestMetadata };

const withUi = (
  manifest: PluginManifest | undefined,
): UiPluginManifest | undefined => {
  const ui = manifest ? uiManifestMetadataOf(manifest) : undefined;
  return manifest && ui ? { ...manifest, ui } : undefined;
};

/** Every UI plugin's manifest, as the reactor gives it, in the catalogue's order. */
export function uiPluginManifests(): UiPluginManifest[] {
  const reactor = uiPluginPlatform();
  return listUI()
    .map(spec => withUi(reactor.getManifest(spec.plugin)))
    .filter((manifest): manifest is UiPluginManifest => manifest !== undefined);
}

/** The manifest of the UI plugin whose spec is `id`, or undefined. */
export function uiPluginManifestOf(id: string): UiPluginManifest | undefined {
  return uiPluginManifests().find(manifest => manifest.ui.id === id);
}
