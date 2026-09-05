/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-agent-mcp` — the capacity, as a plugin.
 *
 * Mounts the `example-mcp` agent and offers what it is worth asking. Cast
 * from the shared capacity mould; see `loop/plugins/agent-capacity`.
 *
 * @module loop/plugins/agent-mcp
 */

import { defineAgentCapacityPlugin } from '../agent-capacity';

export const AGENT_MCP_PLUGIN_NAME = '@datalayer/loop-plugin-agent-mcp';

export const AgentMcpPlugin = defineAgentCapacityPlugin({
  key: 'mcp',
  displayName: 'Agent MCP',
  description: 'Agent MCP',
  specId: 'example-mcp',
  octicon: 'plug',
  emoji: '🔌',
  suggestions: [
    {
      text: '🔍 Search the web',
      message: 'Search the web for recent news about AI agents.',
    },
    {
      text: '🐙 GitHub repos',
      message: 'Find trending open-source Python projects on GitHub.',
    },
    {
      text: '📚 Research topic',
      message: 'Research best practices for building RAG applications.',
    },
    {
      text: '⚡ Compare frameworks',
      message: 'Compare popular JavaScript frameworks in 2024.',
    },
    {
      text: '😄 Tell me a joke',
      message: 'Use your jokes skill to tell me a random joke.',
    },
  ],
});

export default AgentMcpPlugin;
