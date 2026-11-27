/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/agent-plugin-agent-evals` — the capacity, as a plugin.
 *
 * Mounts the `text-normalizer` agent and offers what it is worth asking. Cast
 * from the shared capacity mould; see `apps/plugins/agent-capacity`.
 *
 * The openers are the spec's own.
 *
 * @module apps/plugins/agent-evals
 */

import { defineAgentCapacityPlugin } from '../agent-capacity';

export const AGENT_EVALS_PLUGIN_NAME = '@datalayer/agent-plugin-agent-evals';

export const AgentEvalsPlugin = defineAgentCapacityPlugin({
  key: 'evals',
  displayName: 'Agent Evals',
  description: 'Agent Evals',
  specId: 'text-normalizer',
  octicon: 'beaker',
  emoji: '🧪',
});

export default AgentEvalsPlugin;
