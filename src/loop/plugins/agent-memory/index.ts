/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-agent-memory` — the capacity, as a plugin.
 *
 * Mounts the `example-memory` agent and offers what it is worth asking. Cast
 * from the shared capacity mould; see `loop/plugins/agent-capacity`.
 *
 * @module loop/plugins/agent-memory
 */

import { defineAgentCapacityPlugin } from '../agent-capacity';

export const AGENT_MEMORY_PLUGIN_NAME = '@datalayer/loop-plugin-agent-memory';

export const AgentMemoryPlugin = defineAgentCapacityPlugin({
  key: 'memory',
  displayName: 'Agent Memory',
  description: 'Agent with persistent memory',
  specId: 'example-memory',
  octicon: 'database',
  emoji: '🧠',
  suggestions: [
    {
      text: 'Remember',
      message: 'My favourite colour is midnight blue.',
    },
    {
      text: 'Recall',
      message: 'What is my favourite colour?',
    },
    {
      text: 'Preference',
      message: 'I prefer reports in bullet-point format.',
    },
  ],
});

export default AgentMemoryPlugin;
