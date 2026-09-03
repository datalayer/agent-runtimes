/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-agent-outputs` — the capacity, as a plugin.
 *
 * Mounts the `example-output` agent and offers what it is worth asking. Cast
 * from the shared capacity mould; see `loop/plugins/agent-capacity`.
 *
 * @module loop/plugins/agent-outputs
 */

import { defineAgentCapacityPlugin } from '../agent-capacity';

export const AGENT_OUTPUTS_PLUGIN_NAME = '@datalayer/loop-plugin-agent-outputs';

export const AgentOutputsPlugin = defineAgentCapacityPlugin({
  key: 'outputs',
  displayName: 'Agent Outputs',
  description: '${detected.length} detected output${detected.length !== 1 ? ',
  specId: 'example-output',
  octicon: 'log',
  emoji: '📤',
  suggestions: [
    {
      text: 'Table',
      message:
        'Generate a Markdown table of the top 5 US cities by population, with columns City, State, Population.',
    },
    {
      text: 'JSON',
      message:
        'Return a JSON object describing a fictitious product catalog with 3 items (id, name, price, tags).',
    },
    {
      text: 'Chart',
      message:
        'Produce a bar chart ECharts spec (valid JSON, with `// chart` on the first line of the fenced block) showing monthly sales for Jan–Jun.',
    },
    {
      text: 'File',
      message:
        'Create a downloadable CSV file with sample sales data for the last 7 days. Output it inside a ```csv fenced block whose first line is `# filename: sales.csv`.',
    },
  ],
});

export default AgentOutputsPlugin;
