/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-agents` — which agent the session is talking to.
 *
 * @module loop/plugins/agents
 */

import { contribution, defineExtension } from '@datalayer/reactor';
import type { ReactorSlotComponent } from '@datalayer/reactor/react';
import { LoopCommand, LoopSlots } from '../../core';
import { AgentPicker } from './AgentPicker';

export const AGENTS_EXTENSION_NAME = '@datalayer/loop-plugin-agents';

export const AgentsExtension = defineExtension<
  Record<string, never>,
  unknown,
  { components: ReactorSlotComponent[] }
>({
  name: AGENTS_EXTENSION_NAME,
  build() {
    return {
      components: [
        {
          slot: LoopSlots.header,
          id: 'agent-picker',
          Component: AgentPicker as never,
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
            return { content: 'Pick an agent from the header, or /agents <id>.' };
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

export default AgentsExtension;
