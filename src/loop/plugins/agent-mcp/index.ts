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
 * The openers are the spec's own.
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
});

export default AgentMcpPlugin;
