/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/agent-plugin-agent-subagents` — the capacity, as a plugin.
 *
 * Mounts the `research-writer` agent and offers what it is worth asking. Cast
 * from the shared capacity mould; see `apps/plugins/agent-capacity`.
 *
 * The openers are the spec's own.
 *
 * @module apps/plugins/agent-subagents
 */

import { defineAgentCapacityPlugin } from '../agent-capacity';

export const AGENT_SUBAGENTS_PLUGIN_NAME =
  '@datalayer/agent-plugin-agent-subagents';

export const AgentSubagentsPlugin = defineAgentCapacityPlugin({
  key: 'subagents',
  displayName: 'Agent Subagents',
  description: 'Multi-agent delegation with researcher & writer',
  specId: 'research-writer',
  octicon: 'people',
  emoji: '👥',
});

export default AgentSubagentsPlugin;
