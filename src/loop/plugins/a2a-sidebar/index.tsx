/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-a2a-sidebar` — the agents reached over A2A, at the
 * side of the workspace.
 *
 * The chat boxes a delegated run under its tool card; this keeps the same box
 * in view while the chat scrolls, and lists every A2A agent the chat's agent
 * can reach with where it runs, its card, and what it is doing.
 *
 * @module loop/plugins/a2a-sidebar
 */

import { definePlugin } from '@datalayer/reactor';
import type { ReactorReactOutput } from '@datalayer/reactor/react';
import { LoopSlots, type LoopWorkspaceContext } from '../../core';
import { A2ASidebar } from './A2ASidebar';

export const A2A_SIDEBAR_PLUGIN_NAME = '@datalayer/loop-plugin-a2a-sidebar';

export const A2ASidebarPlugin = definePlugin<
  Record<string, never>,
  unknown,
  ReactorReactOutput
>({
  name: A2A_SIDEBAR_PLUGIN_NAME,
  displayName: 'A2A sidebar',
  description: 'The agents reached over A2A, and the run under way.',
  octicon: 'broadcast',
  emoji: '\u{1F4E1}',
  build: () => ({
    components: [
      {
        id: 'a2a-sidebar',
        slot: LoopSlots.sidebar,
        // Part of the work, so above the plugins panel (900).
        order: 100,
        Component: ({ workspace }: { workspace?: LoopWorkspaceContext }) => (
          <A2ASidebar workspace={workspace} />
        ),
      },
    ],
  }),
});

export {
  A2ASidebar,
  describeRemoteAgents,
  remoteStatusOf,
  type A2ARemoteAgentView,
  type A2ARemoteStatus,
} from './A2ASidebar';

export default A2ASidebarPlugin;
