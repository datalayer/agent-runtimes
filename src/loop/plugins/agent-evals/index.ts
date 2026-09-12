/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-agent-evals` — the capacity, as a plugin.
 *
 * Mounts the `example-evals` agent and offers what it is worth asking. Cast
 * from the shared capacity mould; see `loop/plugins/agent-capacity`.
 *
 * The openers are the spec's own.
 *
 * @module loop/plugins/agent-evals
 */

import { defineAgentCapacityPlugin } from '../agent-capacity';

export const AGENT_EVALS_PLUGIN_NAME = '@datalayer/loop-plugin-agent-evals';

export const AgentEvalsPlugin = defineAgentCapacityPlugin({
  key: 'evals',
  displayName: 'Agent Evals',
  description: 'Agent Evals',
  specId: 'example-evals',
  octicon: 'beaker',
  emoji: '🧪',
});

export default AgentEvalsPlugin;
