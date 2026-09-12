/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-agent-monitoring` — the capacity, as a plugin.
 *
 * Mounts the `example-monitoring` agent and offers what it is worth asking. Cast
 * from the shared capacity mould; see `loop/plugins/agent-capacity`.
 *
 * The openers are the spec's own.
 *
 * @module loop/plugins/agent-monitoring
 */

import { defineAgentCapacityPlugin } from '../agent-capacity';

export const AGENT_MONITORING_PLUGIN_NAME =
  '@datalayer/loop-plugin-agent-monitoring';

export const AgentMonitoringPlugin = defineAgentCapacityPlugin({
  key: 'monitoring',
  displayName: 'Agent Monitoring',
  description: '${alerts.length} active alert${alerts.length !== 1 ? ',
  specId: 'example-monitoring',
  octicon: 'pulse',
  emoji: '📈',
});

export default AgentMonitoringPlugin;
