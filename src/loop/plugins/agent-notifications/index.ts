/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-agent-notifications` — the capacity, as a plugin.
 *
 * Mounts the `example-notifications` agent and offers what it is worth asking. Cast
 * from the shared capacity mould; see `loop/plugins/agent-capacity`.
 *
 * The openers are the spec's own.
 *
 * @module loop/plugins/agent-notifications
 */

import { defineAgentCapacityPlugin } from '../agent-capacity';

export const AGENT_NOTIFICATIONS_PLUGIN_NAME =
  '@datalayer/loop-plugin-agent-notifications';

export const AgentNotificationsPlugin = defineAgentCapacityPlugin({
  key: 'notifications',
  displayName: 'Agent Notifications',
  description: '${unreadCount} unread notification${unreadCount !== 1 ? ',
  specId: 'example-notifications',
  octicon: 'bell',
  emoji: '🔔',
});

export default AgentNotificationsPlugin;
