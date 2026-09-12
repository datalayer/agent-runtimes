/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-agent-outputs` — structured outputs, as a capacity.
 *
 * Mounts the `example-output` agent, which answers with exactly one
 * structured block — a Markdown table, a JSON object, an ECharts chart or a
 * downloadable file — for the example's side panel to detect and render.
 * Cast from the shared capacity mould; the openers are the spec's own.
 *
 * @module loop/plugins/agent-outputs
 */

import { defineAgentCapacityPlugin } from '../agent-capacity';

export const AGENT_OUTPUTS_PLUGIN_NAME = '@datalayer/loop-plugin-agent-outputs';

export const AgentOutputsPlugin = defineAgentCapacityPlugin({
  key: 'outputs',
  displayName: 'Agent Outputs',
  description:
    'Structured outputs: a table, JSON, a chart or a file per answer.',
  specId: 'example-output',
  octicon: 'log',
  emoji: '📤',
});

export default AgentOutputsPlugin;
