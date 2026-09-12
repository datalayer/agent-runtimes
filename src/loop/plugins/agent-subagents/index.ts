/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-agent-subagents` — the capacity, as a plugin.
 *
 * Mounts the `example-subagents` agent and offers what it is worth asking. Cast
 * from the shared capacity mould; see `loop/plugins/agent-capacity`.
 *
 * The openers are the spec's own.
 *
 * @module loop/plugins/agent-subagents
 */

import { defineAgentCapacityPlugin } from '../agent-capacity';

export const AGENT_SUBAGENTS_PLUGIN_NAME =
  '@datalayer/loop-plugin-agent-subagents';

export const AgentSubagentsPlugin = defineAgentCapacityPlugin({
  key: 'subagents',
  displayName: 'Agent Subagents',
  description: 'Multi-agent delegation with researcher & writer',
  specId: 'example-subagents',
  octicon: 'people',
  emoji: '👥',
});

export default AgentSubagentsPlugin;
