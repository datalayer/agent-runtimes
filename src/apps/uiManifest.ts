/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A UI plugin's Reactor manifest, from its UI spec (`agentspecs/ui`): what
 * the Agentspecs pages show of it, carried by the plugin itself (the user,
 * 21 November 2026: "all the informations we show on the pages … should be
 * present in the reactor plugin manifest").
 *
 * Its name and faces (`displayName`, `description`, `emoji`, `octicon`),
 * the npm `package` that ships it, its settings as `configSchema`, its
 * Slots, Contributions and Commands as `declares`, and the rest — the spec's
 * id and version, where its plugin is, `per`, the Contribution Points it
 * offers, its renderers, placements, header, what it supersedes, its catalog,
 * components and the frontend tools it contributes — under `metadata.ui`. Every plugin of a UI spec spreads it
 * after its own presentation, so a host listing the plugins
 * (`reactor.getManifest`) reads what the catalogue says; agent-runtimes'
 * ui-specs test resolves each spec's export and holds the manifest to it.
 *
 * @module apps/uiManifest
 */

import type { PluginDescription, PluginPresentation } from '@datalayer/reactor';
import { UI_CATALOGUE } from '../specs/ui';
import {
  uiFrontendToolsOf,
  type UiFrontendTool,
} from '../specs/uiFrontendTools';
import type { UISpec } from '../types/agentspecs';

/** Where a UI plugin's manifest keeps what its UI spec says beyond the reactor's own fields. */
export const UI_MANIFEST_KEY = 'ui';

/** What a UI plugin's manifest keeps under `metadata.ui`. */
export type UiManifestMetadata = Pick<
  UISpec,
  | 'id'
  | 'version'
  | 'plugin'
  | 'folder'
  | 'implementation'
  | 'per'
  | 'contributionPoints'
  | 'renderers'
  | 'placements'
  | 'header'
  | 'supersedes'
  | 'catalog'
  | 'components'
> & {
  /**
   * The frontend tools it hands the chat's agent, by name and description:
   * read from the plugin's own tool definitions at build time
   * (`specs/uiFrontendTools`), absent when it hands none.
   */
  frontendTools?: readonly UiFrontendTool[];
};

/** The manifest fields of a UI plugin: its presentation and its description. */
export type UiManifest = PluginPresentation &
  Required<Pick<PluginDescription, 'package' | 'declares' | 'metadata'>> &
  Pick<PluginDescription, 'configSchema'>;

/** A UI spec's manifest fields. */
export function uiManifestOfSpec(spec: UISpec): UiManifest {
  const ui: UiManifestMetadata = {
    id: spec.id,
    version: spec.version,
    plugin: spec.plugin,
    folder: spec.folder,
    implementation: spec.implementation,
    ...(spec.per ? { per: spec.per } : {}),
    contributionPoints: spec.contributionPoints,
    renderers: spec.renderers,
    ...(spec.placements ? { placements: spec.placements } : {}),
    ...(spec.header ? { header: spec.header } : {}),
    ...(spec.supersedes ? { supersedes: spec.supersedes } : {}),
    catalog: spec.catalog,
    components: spec.components,
  };
  const frontendTools = uiFrontendToolsOf(spec.id);
  if (frontendTools.length > 0) {
    ui.frontendTools = frontendTools;
  }
  return {
    displayName: spec.name,
    description: spec.description,
    emoji: spec.emoji,
    ...(spec.octicon ? { octicon: spec.octicon } : {}),
    package: spec.implementation.package,
    ...(Object.keys(spec.settings).length > 0
      ? { configSchema: spec.settings }
      : {}),
    declares: {
      slots: spec.contributions.slots,
      contributesTo: spec.contributions.points,
      commands: spec.contributions.commands,
    },
    metadata: { [UI_MANIFEST_KEY]: ui },
  };
}

/**
 * The manifest fields of the UI spec `id`, to spread into its plugin's
 * definition; nothing for an id the catalogue does not have (a tool card or
 * a chrome plugin that is no UI spec keeps its own presentation).
 */
export function uiManifestOf(id: string): Partial<UiManifest> {
  const spec = UI_CATALOGUE[id];
  return spec ? uiManifestOfSpec(spec) : {};
}

/** What a UI plugin's manifest says under `metadata.ui`, when it is one. */
export function uiManifestMetadataOf(manifest: {
  metadata?: Record<string, unknown>;
}): UiManifestMetadata | undefined {
  return manifest.metadata?.[UI_MANIFEST_KEY] as UiManifestMetadata | undefined;
}
