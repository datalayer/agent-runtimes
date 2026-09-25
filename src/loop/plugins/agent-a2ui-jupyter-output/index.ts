/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-agent-a2ui-jupyter-output` — Jupyter outputs on
 * A2UI surfaces, as a capacity.
 *
 * Mounts the `example-a2ui-jupyter-output` agent: each demonstration runs
 * real code in the sandbox and lands its kernel outputs — streams, figures,
 * tables, tracebacks, widgets — on the conversation. On the browser target
 * the loop turns in the page and the blueprint is inert; on Local the same
 * plugin creates the agent server-side.
 *
 * @module loop/plugins/agent-a2ui-jupyter-output
 */

import { defineAgentCapacityPlugin } from '../agent-capacity';

export const AGENT_A2UI_JUPYTER_OUTPUT_PLUGIN_NAME =
  '@datalayer/loop-plugin-agent-a2ui-jupyter-output';

export const AgentA2uiJupyterOutputPlugin = defineAgentCapacityPlugin({
  key: 'a2ui-jupyter-output',
  displayName: 'Agent A2UI Jupyter Output',
  description:
    'Kernel outputs — streams, figures, tables, errors, widgets — rendered as surfaces.',
  specId: 'example-a2ui-jupyter-output',
  octicon: 'log',
  emoji: '📓',
  suggestions: [
    {
      text: 'Stream output',
      message: 'Run something in the code sandbox that prints as it goes.',
    },
    {
      text: 'Figure output',
      message: 'Plot a chart in the code sandbox and show me the image.',
    },
    {
      text: 'Table output',
      message:
        'Build a small DataFrame in the code sandbox and show it as a table.',
    },
    {
      text: 'Error output',
      message:
        'Run something in the code sandbox that fails, so I can see the traceback.',
    },
    {
      text: 'IPyWidgets output',
      message: 'Show me an interactive slider from the code sandbox.',
    },
    {
      text: 'Interactive output',
      message: 'Give me a surface with buttons I can press.',
    },
  ],
});

export default AgentA2uiJupyterOutputPlugin;
