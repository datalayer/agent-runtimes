/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `app-components` — the components an application's developer wrote (LOOP
 * P-17), registered as that application's A2UI contributions: each a block
 * of its Canvas's palette (`loop.canvas.block`, as a UI plugin's components
 * are) and a renderer of the catalog its page, its elements and its answers
 * are drawn with (`loop.a2ui.component`). One plugin per application, in its
 * workspace's preset only: the catalog grows for it, it does not open.
 *
 * Its components are reviewed before they get here — `checkAppspec` refuses
 * an invalid declaration — and drawn in a sandboxed frame of no origin
 * (`components/a2ui/custom`).
 *
 * @module loop/plugins/app-components
 */

import {
  contribution,
  definePlugin,
  type ReactorPlugin,
} from '@datalayer/reactor';
import type { AppSpec } from '../../../types/agentspecs';
import { customImplementation } from '../../../components/a2ui/custom';
import { customComponentEntry } from '../../apps/customComponents';
import { LoopA2uiComponent } from '../../core/a2uiComponents';
import { LoopCanvasBlock } from '../../core/canvasBlocks';

/** The name of the plugin that contributes an application's own components. */
export const appComponentsPluginName = (appId: string): string =>
  `@datalayer/loop-plugin-app-components-${appId}`;

/** Whether an application's developer wrote components of its own. */
export const hasCustomComponents = (app: Pick<AppSpec, 'interface'>): boolean =>
  (app.interface.customComponents ?? []).length > 0;

/**
 * The plugin contributing the components an application's developer wrote:
 * a block and a renderer for each. `fetcher` is how their modules are
 * fetched; the page's `fetch` unless given (tests).
 */
export function defineAppComponentsPlugin(
  app: Pick<AppSpec, 'id' | 'name' | 'version' | 'interface'>,
  fetcher?: typeof fetch,
): ReactorPlugin<Record<string, never>, unknown, unknown> {
  const own = app.interface.customComponents ?? [];
  if (own.length === 0) {
    throw new Error(`“${app.name}” has no component of its own to contribute.`);
  }
  return definePlugin({
    name: appComponentsPluginName(app.id),
    displayName: `${app.name}'s components`,
    description: `The components ${app.name}'s developer wrote: ${own.map(component => component.name).join(', ')}.`,
    octicon: 'apps',
    contributes: own.flatMap(component => [
      contribution(
        LoopCanvasBlock,
        {
          id: component.name,
          uiPlugin: `app:${app.id}`,
          component: customComponentEntry(component, app.version),
        },
        { id: component.name },
      ),
      contribution(
        LoopA2uiComponent,
        {
          id: component.name,
          app: app.id,
          implementation: customImplementation(component, app.version, fetcher),
        },
        { id: component.name },
      ),
    ]),
  }) as unknown as ReactorPlugin<Record<string, never>, unknown, unknown>;
}
