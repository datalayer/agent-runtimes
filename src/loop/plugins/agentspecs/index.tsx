/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-agentspecs` — which agentspec the session runs.
 *
 * The other half of the question `@datalayer/loop-plugin-agents` answers: that
 * one says *where* the agent runs, this one says *what* it is.
 *
 * @module loop/plugins/agents
 */

import { contribution, definePlugin } from '@datalayer/reactor';
import type { ReactorSlotComponent } from '@datalayer/reactor/react';
import { LoopCommand, LoopSlots } from '../../core';
import { AgentspecPicker } from './AgentspecPicker';

export const AGENTSPECS_PLUGIN_NAME = '@datalayer/loop-plugin-agentspecs';

export const AgentspecsPlugin = definePlugin<
  Record<string, never>,
  unknown,
  { components: ReactorSlotComponent[] }
>({
  name: AGENTSPECS_PLUGIN_NAME,
  displayName: 'Agentspecs',
  description: 'Pick the agentspec this session runs.',
  octicon: 'people',
  emoji: '\u{1F916}',
  build() {
    return {
      components: [
        {
          slot: LoopSlots.header,
          id: 'agent-picker',
          Component: AgentspecPicker as never,
        },
      ],
    };
  },
  contributes: [
    contribution(
      LoopCommand,
      {
        name: 'agents',
        aliases: ['agent'],
        description: 'Switch the agent this session is using',
        group: 'Agents',
        args: [{ name: 'agent-id', description: 'Agent to switch to' }],
        run: async ({ workspace, argv }) => {
          const agentId = argv.trim();
          if (!agentId) {
            return {
              content: 'Pick an agent from the header, or /agents <id>.',
            };
          }
          const response = await fetch(
            `${workspace.serverUrl}/api/v1/loop/sessions/${encodeURIComponent(
              workspace.conversationId || workspace.agentId || 'session',
            )}/agent`,
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ agent_id: agentId }),
            },
          );
          if (!response.ok) {
            return { content: `Unknown agent: ${agentId}` };
          }
          const payload = await response.json();
          return { content: `Now using ${payload.name ?? payload.agent_id}.` };
        },
      },
      { id: 'agents' },
    ),
  ],
});

export default AgentspecsPlugin;
