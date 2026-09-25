/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-agent-a2a` — the capacity, as a plugin.
 *
 * Mounts the `example-a2a` agent: an orchestrator whose researcher and writer
 * are separate agents reached over the A2A protocol, launched beside it on
 * the local server or on Datalayer runtimes when it runs in the cloud. Cast
 * from the shared capacity mould; see `loop/plugins/agent-capacity`. The
 * openers are the spec's own: one list, kept where the agent is described.
 *
 * @module loop/plugins/agent-a2a
 */

import { defineAgentCapacityPlugin } from '../agent-capacity';

export const AGENT_A2A_PLUGIN_NAME = '@datalayer/loop-plugin-agent-a2a';

export const AgentA2APlugin = defineAgentCapacityPlugin({
  key: 'a2a',
  displayName: 'Agent A2A',
  description: 'Delegation to separate agents over the A2A protocol',
  specId: 'example-a2a',
  octicon: 'broadcast',
  emoji: '📡',
});

export default AgentA2APlugin;
