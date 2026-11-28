/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/agent-plugin-agent-chooser` — the agents a host offers, behind
 * the apps grid at the trailing end of the chat's title bar
 * (`AgentSlots.chatHeaderEnd`): *Choose an agent (N)* opens them, by
 * category, in a modal dialog, and the one chosen is told to the host
 * (`AgentChooser`).
 *
 * A host makes it with what it offers and what a choice does —
 * `agentChooserPlugin({ groups: [{ name, agents: [specId…] }], onChoose })` —
 * and adds it to the application it shows
 * (`<AIApplication renderer={{ plugins: [chooser] }} />`); no Appspec names
 * it. Made once, outside a render: a new plugin restarts the workspace. An
 * agent offered that says no presentation is refused when it is made. Its
 * view loads lazily.
 *
 * @module apps/plugins/agent-chooser
 */

import { lazy, Suspense, type JSX } from 'react';
import { definePlugin } from '@datalayer/reactor';
import type { ReactorReactOutput } from '@datalayer/reactor/react';
import { AgentSlots, type AgentWorkspaceContext } from '../../core';
import { presentationOrFail } from '../agent-identity/agentOfWorkspace';
import type { AgentChooserOptions } from './chooser';

export * from './chooser';

export const AGENT_CHOOSER_PLUGIN_NAME =
  '@datalayer/agent-plugin-agent-chooser';

const LazyAgentChooser = lazy(() => import('./AgentChooser'));

/** The chooser's plugin, for what a host offers: make it once, outside a render. */
export function agentChooserPlugin(options: AgentChooserOptions) {
  if (options.groups.length === 0) {
    throw new Error('The agent chooser offers no agent: give it a group.');
  }
  for (const group of options.groups) {
    if (group.agents.length === 0) {
      throw new Error(`The agent chooser's group ${group.name} has no agent.`);
    }
    group.agents.forEach(presentationOrFail);
  }
  function AgentChooserSlot({
    workspace,
  }: {
    workspace?: AgentWorkspaceContext;
  }): JSX.Element {
    return (
      <Suspense fallback={null}>
        <LazyAgentChooser workspace={workspace} options={options} />
      </Suspense>
    );
  }
  return definePlugin<Record<string, never>, unknown, ReactorReactOutput>({
    name: AGENT_CHOOSER_PLUGIN_NAME,
    displayName: 'Agent chooser',
    description:
      "The agents offered, by category, behind the apps grid at the end of the chat's title bar.",
    octicon: 'apps',
    emoji: '\u{1F9ED}',
    build: () => ({
      components: [
        {
          slot: AgentSlots.chatHeaderEnd,
          id: 'agent-chooser',
          Component: AgentChooserSlot as never,
        },
      ],
    }),
  });
}

export default agentChooserPlugin;
