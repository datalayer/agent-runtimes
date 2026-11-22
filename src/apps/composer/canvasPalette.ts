/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Canvas's palette, read from Reactor: the blocks the enabled
 * plugins contribute to `loop.canvas.block` (agent-runtimes'
 * `apps/plugins/canvas-blocks`), and nothing else — what the palette lists and
 * what *Add* offers.
 *
 * Which plugins are off is the organization's: IAM keeps the UI specs of
 * the catalogue an organization has turned off (`plugins_off`, catalogue ids
 * such as `a2ui`), its owner switches them on its settings' *Components* tab,
 * and an application reads the list of the organization of its Space. An
 * application in a personal Space has none off. What an application's page
 * uses from a plugin that is off is said by its instant checks
 * (`instantChecksOf`, agent-runtimes' `checkAppspec` given the list).
 *
 * @module apps/composer/canvasPalette
 */

import {
  canvasBlocksOf,
  canvasBlocksReactorOf,
  unknownPluginsOff,
} from '../plugins/canvas-blocks';
import { listUI } from '../../specs/ui';
import type { ComponentSpec, UISpec } from '../../types/agentspecs';

/** The palette of each list of plugins off, built once. */
const PALETTES = new Map<string, ComponentSpec[]>();

/** The blocks the palette lists: what the enabled plugins contribute, the organization's turned off. */
export const paletteComponents = (
  pluginsOff: readonly string[],
): ComponentSpec[] => {
  const key = [...pluginsOff].sort().join(',');
  let palette = PALETTES.get(key);
  if (!palette) {
    palette = canvasBlocksOf(canvasBlocksReactorOf(pluginsOff));
    PALETTES.set(key, palette);
  }
  return palette;
};

/** The organization of an application's Space, or '' for a personal Space or one not found. */
export const organizationOfSpace = (
  spaces: readonly unknown[],
  spaceId: string | undefined,
): string => {
  const space = spaces.find(each => {
    const fields = each as Record<string, unknown>;
    return (
      Boolean(spaceId) && (fields.uid === spaceId || fields.id === spaceId)
    );
  }) as Record<string, unknown> | undefined;
  return typeof space?.organization_uid === 'string'
    ? space.organization_uid
    : '';
};

/** A UI plugin that renders components, as the organization's settings show it. */
export type PluginSwitch = {
  plugin: UISpec;
  on: boolean;
  /** What its switch says, in plain words. */
  says: string;
};

/**
 * The catalogue's UI plugins that render components — a set of the Canvas's
 * blocks each —, each on or off for an organization. A UI plugin that renders
 * none has no blocks to take off, and no switch here.
 */
export const pluginSwitches = (pluginsOff: readonly string[]): PluginSwitch[] =>
  listUI()
    .filter(plugin => plugin.components.length > 0)
    .map(plugin => {
      const on = !pluginsOff.includes(plugin.id);
      const blocks = plugin.components.length;
      const says = on
        ? `On: its ${blocks} components are on the Canvas.`
        : 'Off: its components are off the Canvas, and an application using one says so.';
      return { plugin, on, says };
    });

/** The list with one plugin switched: off when `on` is false, on otherwise; ids the catalogue lacks kept. */
export const switchPlugin = (
  pluginsOff: readonly string[],
  id: string,
  on: boolean,
): string[] =>
  on
    ? pluginsOff.filter(each => each !== id)
    : pluginsOff.includes(id)
      ? [...pluginsOff]
      : [...pluginsOff, id];

export { unknownPluginsOff };
