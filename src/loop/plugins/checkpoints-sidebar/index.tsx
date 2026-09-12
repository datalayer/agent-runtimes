/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-checkpoints-sidebar` — the agent's conversation
 * checkpoints, at the side of the workspace.
 *
 * The agent snapshots its conversation as it runs; this lists the snapshots
 * with how they were taken, lets a person save one between turns, rewind
 * the conversation to one — the chat reloads its transcript — and drop one.
 *
 * @module loop/plugins/checkpoints-sidebar
 */

import { definePlugin } from '@datalayer/reactor';
import type { ReactorReactOutput } from '@datalayer/reactor/react';
import { LoopSlots, type LoopWorkspaceContext } from '../../core';
import { CheckpointsSidebar } from './CheckpointsSidebar';

export const CHECKPOINTS_SIDEBAR_PLUGIN_NAME =
  '@datalayer/loop-plugin-checkpoints-sidebar';

export const CheckpointsSidebarPlugin = definePlugin<
  Record<string, never>,
  unknown,
  ReactorReactOutput
>({
  name: CHECKPOINTS_SIDEBAR_PLUGIN_NAME,
  displayName: 'Checkpoints sidebar',
  description: 'The conversation checkpoints, and the way back to any of them.',
  octicon: 'versions',
  emoji: '\u{1F4BE}',
  build: () => ({
    components: [
      {
        id: 'checkpoints-sidebar',
        slot: LoopSlots.sidebar,
        // Part of the work, so above the plugins panel (900).
        order: 100,
        Component: ({ workspace }: { workspace?: LoopWorkspaceContext }) => (
          <CheckpointsSidebar workspace={workspace} />
        ),
      },
    ],
  }),
});

export { CheckpointsSidebar } from './CheckpointsSidebar';

export default CheckpointsSidebarPlugin;
