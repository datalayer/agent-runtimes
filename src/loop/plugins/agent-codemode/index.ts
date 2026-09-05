/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-agent-codemode` — codemode, as a capacity.
 *
 * Two plugins from one mould, because codemode is best understood as a
 * comparison: {@link AgentCodemodePlugin} mounts the `example-codemode`
 * agent, whose MCP tools are converted into programmatic tools the model
 * composes in code; {@link AgentNoCodemodePlugin} mounts
 * `example-no-codemode`, the same tools raw. The codemode example mounts
 * both side by side and hands each pane the same task.
 *
 * @module loop/plugins/agent-codemode
 */

import { defineAgentCapacityPlugin } from '../agent-capacity';

export const AGENT_CODEMODE_PLUGIN_NAME =
  '@datalayer/loop-plugin-agent-codemode';
export const AGENT_NO_CODEMODE_PLUGIN_NAME =
  '@datalayer/loop-plugin-agent-no-codemode';

export const AgentCodemodePlugin = defineAgentCapacityPlugin({
  key: 'codemode',
  displayName: 'Agent Codemode',
  description: 'MCP tools converted into programmatic tools.',
  specId: 'example-codemode',
  octicon: 'code-square',
  emoji: '🧑‍💻',
  codemode: true,
  suggestions: [
    {
      text: 'Datalayer extraction',
      message:
        'Extract information from the https://datalayer.ai website and assign it to the variable "about_datalayer", all in one step using the sandbox',
    },
  ],
});

export const AgentNoCodemodePlugin = defineAgentCapacityPlugin({
  key: 'no-codemode',
  displayName: 'Agent MCP Tools (No Codemode)',
  description: 'Raw MCP tools without codemode conversion.',
  specId: 'example-no-codemode',
  octicon: 'tools',
  emoji: '🔧',
  codemode: false,
  suggestions: [
    {
      text: 'Datalayer extraction',
      message:
        'Use the MCP extract tool to extract information from https://datalayer.ai, then use your sandbox to persist that information in a variable named "about_datalayer".',
    },
  ],
});

export default AgentCodemodePlugin;
