/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Canvas's palette as a contribution point (LOOP C-12): each UI plugin of
 * the catalogue that renders components (`agentspecs/ui-plugins`, C-13) is a
 * Reactor plugin contributing its components to `loop.canvas.block`. The
 * palette lists what the enabled plugins contribute, and nothing else; a
 * plugin disabled takes its blocks off it, and an application that uses one
 * of them says so in its setup notes (`blockSetupNotes`).
 *
 * A new kind of block arrives as a plugin contributing to the point, never as
 * a change to the Canvas.
 *
 * @module apps/plugins/canvas-blocks
 */

import {
  buildReactorFromPlugins,
  contribution,
  definePlugin,
  type ReactorPlatform,
  type ReactorPlugin,
} from '@datalayer/reactor';
import { listUIPlugins } from '../../../specs/uiPlugins';
import type {
  AppSpec,
  ComponentSpec,
  UIPluginSpec,
} from '../../../types/agentspecs';
import {
  LoopCanvasBlock,
  type CanvasBlockContribution,
} from '../../core/canvasBlocks';

/** What is read of a reactor here: its contributions to the point, and who is enabled. */
type BlocksReader = {
  getContributions: (
    point: typeof LoopCanvasBlock,
  ) => ReadonlyArray<{ value: CanvasBlockContribution }>;
};

/** The name of the Reactor plugin that contributes a UI plugin's blocks. */
export const canvasBlocksPluginName = (uiPlugin: string): string =>
  `@datalayer/loop-plugin-ui-${uiPlugin}`;

/** A UI plugin of the catalogue as the Reactor plugin contributing its components as blocks. */
export function uiPluginBlocks(
  uiPlugin: UIPluginSpec,
): ReactorPlugin<Record<string, never>, unknown, unknown> {
  return definePlugin({
    name: canvasBlocksPluginName(uiPlugin.id),
    displayName: uiPlugin.name,
    description: `The blocks of ${uiPlugin.name} on the Canvas: ${uiPlugin.components.map(component => component.name).join(', ')}.`,
    octicon: 'apps',
    contributes: uiPlugin.components.map(component =>
      contribution(
        LoopCanvasBlock,
        { id: component.id, uiPlugin: uiPlugin.id, component },
        { id: component.id },
      ),
    ),
  });
}

/**
 * The plugins of the catalogue's UI plugins that render components and may
 * be named today (`enabled` in the catalogue).
 */
export const CANVAS_BLOCK_PLUGINS: ReactorPlugin<
  Record<string, never>,
  unknown,
  unknown
>[] = listUIPlugins()
  .filter(uiPlugin => uiPlugin.enabled && uiPlugin.components.length > 0)
  .map(uiPluginBlocks);

/**
 * A reactor holding the block plugins given, started, with those named in
 * `disabled` switched off. A name no plugin has is an error.
 */
export function canvasBlocksReactor(
  disabled: readonly string[] = [],
  plugins: ReactorPlugin<any, any, any>[] = CANVAS_BLOCK_PLUGINS,
): ReactorPlatform {
  const reactor = buildReactorFromPlugins(plugins);
  reactor.start();
  for (const name of disabled) {
    if (!reactor.hasPlugin(name)) {
      throw new Error(
        `No plugin of the Canvas is named "${name}"; they are ${plugins.map(plugin => plugin.name).join(', ') || 'none'}.`,
      );
    }
    reactor.disable(name);
  }
  return reactor;
}

/**
 * The palette of an organization: the block plugins of the UI plugins it has
 * turned off (`plugins_off` in IAM, catalogue ids such as 'a2ui') switched
 * off. A UI plugin of the catalogue that contributes no block takes nothing
 * off; an id the catalogue does not have is said by `unknownPluginsOff`.
 */
export function canvasBlocksReactorOf(
  pluginsOff: readonly string[],
): ReactorPlatform {
  const blockPlugins = new Set(CANVAS_BLOCK_PLUGINS.map(plugin => plugin.name));
  return canvasBlocksReactor(
    pluginsOff
      .map(canvasBlocksPluginName)
      .filter(name => blockPlugins.has(name)),
  );
}

/** The ids an organization turns off that no UI plugin of the catalogue has. */
export function unknownPluginsOff(pluginsOff: readonly string[]): string[] {
  const known = new Set(listUIPlugins().map(uiPlugin => uiPlugin.id));
  return pluginsOff.filter(id => !known.has(id));
}

/**
 * What an application's page uses from a UI plugin its organization has
 * turned off, as its setup notes say it (`blockSetupNotes`, on the palette of
 * `canvasBlocksReactorOf`).
 */
export function pluginsOffSetupNotes(
  app: Pick<AppSpec, 'interface'>,
  pluginsOff: readonly string[],
): string[] {
  return pluginsOff.length > 0
    ? blockSetupNotes(app, canvasBlocksReactorOf(pluginsOff))
    : [];
}

/** The blocks the enabled plugins contribute, in contribution order: the palette. */
export function canvasBlocksOf(reactor: BlocksReader): ComponentSpec[] {
  return reactor
    .getContributions(LoopCanvasBlock)
    .map(entry => entry.value.component);
}

/** The components an application's page names: those it may use, and those its surface places. */
export function componentsUsedBy(app: Pick<AppSpec, 'interface'>): string[] {
  return [
    ...new Set([
      ...(app.interface.components ?? []),
      ...(app.interface.surface?.components ?? []).map(node =>
        String(node.component),
      ),
    ]),
  ];
}

/**
 * What an application's page uses that no enabled plugin contributes, as its
 * setup notes say it: one sentence per UI plugin of the catalogue whose
 * blocks it uses while its plugin is off. A component the catalogue does not
 * have is not a note but a problem of the instant checks.
 */
export function blockSetupNotes(
  app: Pick<AppSpec, 'interface'>,
  reactor: BlocksReader,
): string[] {
  const contributed = new Set(
    reactor.getContributions(LoopCanvasBlock).map(entry => entry.value.id),
  );
  const off = new Map<UIPluginSpec, string[]>();
  for (const name of componentsUsedBy(app)) {
    if (contributed.has(name)) {
      continue;
    }
    for (const uiPlugin of listUIPlugins()) {
      const component = uiPlugin.components.find(each => each.id === name);
      if (component) {
        off.set(uiPlugin, [...(off.get(uiPlugin) ?? []), component.name]);
      }
    }
  }
  return [...off.entries()].map(
    ([uiPlugin, names]) =>
      `The UI plugin “${uiPlugin.name}” is not enabled, and its page uses its ${names.length === 1 ? 'block' : 'blocks'} ${names.join(', ')}: ${names.length === 1 ? 'it is' : 'they are'} off the Canvas until it is.`,
  );
}
