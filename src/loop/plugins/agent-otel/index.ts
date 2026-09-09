/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-agent-otel` — observability, as a capacity.
 *
 * Mounts the `example-otel` agent: a conversation over the workspace's own
 * traces, logs and metrics. Cast from the shared capacity mould.
 *
 * The openers are the spec's own.
 *
 * @module loop/plugins/agent-otel
 */

import { defineAgentCapacityPlugin } from '../agent-capacity';

export const AGENT_OTEL_PLUGIN_NAME = '@datalayer/loop-plugin-agent-otel';

export const AgentOtelPlugin = defineAgentCapacityPlugin({
  key: 'otel',
  displayName: 'Agent OTel',
  description:
    'Connect an agent to your traces, logs, and metrics and chat about them.',
  specId: 'example-otel',
  octicon: 'telescope',
  emoji: '🔭',
});

export default AgentOtelPlugin;
