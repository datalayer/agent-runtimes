/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/agent-plugin-agent-mcp` — the capacity, as a plugin.
 *
 * Mounts the `web-researcher` agent and offers what it is worth asking. Cast
 * from the shared capacity mould; see `apps/plugins/agent-capacity`.
 *
 * The openers are the spec's own.
 *
 * @module apps/plugins/agent-mcp
 */

import { defineAgentCapacityPlugin } from '../agent-capacity';

export const AGENT_MCP_PLUGIN_NAME = '@datalayer/agent-plugin-agent-mcp';

export const AgentMcpPlugin = defineAgentCapacityPlugin({
  key: 'mcp',
  displayName: 'Agent MCP',
  description: 'Agent MCP',
  specId: 'web-researcher',
  octicon: 'plug',
  emoji: '🔌',
});

export default AgentMcpPlugin;
