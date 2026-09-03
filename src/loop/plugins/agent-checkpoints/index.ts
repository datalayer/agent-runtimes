/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-agent-checkpoints` — checkpointing, as a capacity.
 *
 * Mounts the `monitor-sales-kpis` agent: a long-running monitor whose state
 * survives pause and resume through checkpoints. Cast from the shared
 * capacity mould.
 *
 * @module loop/plugins/agent-checkpoints
 */

import { defineAgentCapacityPlugin } from '../agent-capacity';

export const AGENT_CHECKPOINTS_PLUGIN_NAME =
  '@datalayer/loop-plugin-agent-checkpoints';

export const AgentCheckpointsPlugin = defineAgentCapacityPlugin({
  key: 'checkpoints',
  displayName: 'Agent Checkpoints',
  description: 'Monitor Sales KPI agent with pause/resume checkpointing.',
  specId: 'monitor-sales-kpis',
  octicon: 'versions',
  emoji: '💾',
  suggestions: [
    { text: 'KPIs', message: "Show me today's sales KPI dashboard" },
    { text: 'Trends', message: 'What are the current revenue trends?' },
  ],
});

export default AgentCheckpointsPlugin;
