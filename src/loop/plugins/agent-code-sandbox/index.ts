/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-agent-code-sandbox` — the capacity, as a plugin.
 *
 * Mounts the `example-full` agent and offers what it is worth asking. Cast
 * from the shared capacity mould; see `loop/plugins/agent-capacity`.
 *
 * @module loop/plugins/agent-code-sandbox
 */

import { defineAgentCapacityPlugin } from '../agent-capacity';

export const AGENT_CODE_SANDBOX_PLUGIN_NAME =
  '@datalayer/loop-plugin-agent-code-sandbox';

export const AgentCodeSandboxPlugin = defineAgentCapacityPlugin({
  key: 'code-sandbox',
  displayName: 'Agent Code Sandbox',
  description: 'Agent Code Sandbox',
  specId: 'example-full',
  octicon: 'codespaces',
  emoji: '📦',
  suggestions: [
    {
      text: 'Run some Python',
      message:
        'Write a Python script that computes the first 20 Fibonacci numbers and prints them.',
    },
    {
      text: 'Generate a plot',
      message:
        'Write Python code to generate a matplotlib bar chart of the top 5 programming languages by popularity, and save it to chart.png.',
    },
    {
      text: 'Long-running task',
      message:
        'Write Python code that counts from 1 to 30 with a 1-second sleep between each number, printing each one.',
    },
  ],
});

export default AgentCodeSandboxPlugin;
