/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-app-computer` — an application's computer, as a
 * plugin (LOOP R-23, R-01b): the sandbox its agent runs on, shown live in
 * the workspace's sidebar (`LoopSlots.sidebar`) — its parts on or off, what
 * ran on it, its files, *Take over* and *Hand back*.
 *
 * @module loop/plugins/app-computer
 */

import type { JSX } from 'react';
import { definePlugin, type ReactorPlugin } from '@datalayer/reactor';
import { DeviceDesktopIcon } from '@primer/octicons-react';
import type { AppSpec } from '../../../types/agentspecs';
import { LoopSlots, type LoopWorkspaceContext } from '../../core';
import { AppComputer } from './AppComputer';

export const APP_COMPUTER_PLUGIN_NAME = '@datalayer/loop-plugin-app-computer';

/** The plugin that shows an application's computer beside its page. */
export function defineAppComputerPlugin(
  app: AppSpec,
): ReactorPlugin<Record<string, never>, unknown, unknown> {
  // One component per plugin: the slot keeps it, and the application with it.
  function Computer({
    workspace,
  }: {
    workspace?: LoopWorkspaceContext;
  }): JSX.Element {
    return <AppComputer app={app} workspace={workspace} />;
  }
  const plugin = definePlugin({
    name: `${APP_COMPUTER_PLUGIN_NAME}-${app.id}`,
    displayName: `${app.name}: computer`,
    description: `The computer ${app.name} runs on: what ran on it, its files, and taking it over.`,
    octicon: 'device-desktop',
    build: () => ({
      components: [
        {
          id: 'app-computer',
          slot: LoopSlots.sidebar,
          order: 30,
          Component: Computer,
          // Its line icon on the workspace's rail (T-07).
          rail: { label: 'Computer', icon: DeviceDesktopIcon },
        },
      ],
    }),
  });
  return plugin as unknown as ReactorPlugin<
    Record<string, never>,
    unknown,
    unknown
  >;
}

export { AppComputer } from './AppComputer';
export { COMPUTER_WORDS } from '../../apps/computer';
export default defineAppComputerPlugin;
