/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-agent-triggers` — triggers, as a capacity.
 *
 * Mounts the `example-one-trigger` agent: an agent whose turns are started
 * by cron schedules, webhooks and event subscriptions rather than only by a
 * person typing. Cast from the shared capacity mould.
 *
 * The openers are the spec's own.
 *
 * @module loop/plugins/agent-triggers
 */

import { defineAgentCapacityPlugin } from '../agent-capacity';

export const AGENT_TRIGGERS_PLUGIN_NAME =
  '@datalayer/loop-plugin-agent-triggers';

export const AgentTriggersPlugin = defineAgentCapacityPlugin({
  key: 'triggers',
  displayName: 'Agent Triggers',
  description:
    'Turns started by cron schedules, webhooks and event subscriptions.',
  specId: 'example-one-trigger',
  octicon: 'clock',
  emoji: '⏰',
});

export default AgentTriggersPlugin;
