/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/agent-plugin-agent-identity` — who answers, in the chat's title
 * bar: the agent's emoji, its name and what it does, from its presentation
 * (`specs/agentPresentations`), in place of the name the chat draws itself
 * (`AgentSlots.chatHeaderTitle`). The agent is the one the workspace runs —
 * its application's (`AgentBlueprint`), else the workspace's agent id — and
 * one that says no presentation is refused. The status beside it (*Ready*)
 * and the (i) stay the chat's.
 *
 * A host adds it to the application it shows
 * (`<AIApplication renderer={{ plugins: [AgentIdentityPlugin] }} />`); no
 * Appspec names it. Its view loads lazily, so this module stays a manifest.
 *
 * @module apps/plugins/agent-identity
 */

import { lazy, Suspense, type JSX } from 'react';
import { definePlugin } from '@datalayer/reactor';
import type { ReactorReactOutput } from '@datalayer/reactor/react';
import { AgentSlots, type AgentWorkspaceContext } from '../../core';

export {
  bareAgentId,
  presentationOrFail,
  useWorkspaceAgentId,
} from './agentOfWorkspace';

export const AGENT_IDENTITY_PLUGIN_NAME =
  '@datalayer/agent-plugin-agent-identity';

const LazyAgentIdentity = lazy(() => import('./AgentIdentity'));

/** The lazy boundary, so the title bar needs no Suspense of its own. */
function AgentIdentitySlot(props: {
  workspace?: AgentWorkspaceContext;
}): JSX.Element {
  return (
    <Suspense fallback={null}>
      <LazyAgentIdentity {...props} />
    </Suspense>
  );
}

export const AgentIdentityPlugin = definePlugin<
  Record<string, never>,
  unknown,
  ReactorReactOutput
>({
  name: AGENT_IDENTITY_PLUGIN_NAME,
  displayName: 'Agent identity',
  description:
    "Who answers, in the chat's title bar: the agent's emoji, name and what it does, from its presentation.",
  octicon: 'person',
  emoji: '\u{1FAAA}',
  build: () => ({
    components: [
      {
        slot: AgentSlots.chatHeaderTitle,
        id: 'agent-identity',
        Component: AgentIdentitySlot as never,
      },
    ],
  }),
});

export default AgentIdentityPlugin;
