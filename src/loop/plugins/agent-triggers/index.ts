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
  suggestions: [
    {
      text: 'Latest trigger run',
      message: 'Show me the output of the most recent triggered run.',
    },
    {
      text: 'Configured triggers',
      message:
        'Which triggers are configured for this agent — cron, webhook, events — and when does each fire?',
    },
  ],
});

export default AgentTriggersPlugin;
