/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/agent-plugin-agent-memory` — the capacity, as a plugin.
 *
 * Mounts the `memory-agent` agent and offers what it is worth asking. Cast
 * from the shared capacity mould; see `apps/plugins/agent-capacity`.
 *
 * The openers are the spec's own.
 *
 * @module apps/plugins/agent-memory
 */

import { defineAgentCapacityPlugin } from '../agent-capacity';

export const AGENT_MEMORY_PLUGIN_NAME = '@datalayer/agent-plugin-agent-memory';

export const AgentMemoryPlugin = defineAgentCapacityPlugin({
  key: 'memory',
  displayName: 'Agent Memory',
  description: 'Agent with persistent memory',
  specId: 'memory-agent',
  octicon: 'database',
  emoji: '🧠',
});

export default AgentMemoryPlugin;
