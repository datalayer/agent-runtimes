/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/agent-plugin-agent-triggers` — triggers, as a capacity.
 *
 * Mounts the `one-shot-task` agent: an agent whose turns are started
 * by cron schedules, webhooks and event subscriptions rather than only by a
 * person typing. Cast from the shared capacity mould.
 *
 * The openers are the spec's own.
 *
 * @module apps/plugins/agent-triggers
 */

import { defineAgentCapacityPlugin } from '../agent-capacity';

export const AGENT_TRIGGERS_PLUGIN_NAME =
  '@datalayer/agent-plugin-agent-triggers';

export const AgentTriggersPlugin = defineAgentCapacityPlugin({
  key: 'triggers',
  displayName: 'Agent Triggers',
  description:
    'Turns started by cron schedules, webhooks and event subscriptions.',
  specId: 'one-shot-task',
  octicon: 'clock',
  emoji: '⏰',
});

export default AgentTriggersPlugin;
