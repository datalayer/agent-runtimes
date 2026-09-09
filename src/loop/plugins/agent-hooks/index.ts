/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-agent-hooks` — lifecycle hooks, as a capacity.
 *
 * Mounts the `example-hooks` agent: pre-hooks that ran before the loop (a
 * marker file, injected variables, a pip install), pydantic-style tool hooks
 * around every call (`before_tool_execute`, `after_tool_execute`,
 * `on_tool_execute_error`), and deferred tool calls for approval-gated
 * tools.
 *
 * The openers are the spec's own.
 *
 * @module loop/plugins/agent-hooks
 */

import { defineAgentCapacityPlugin } from '../agent-capacity';

export const AGENT_HOOKS_PLUGIN_NAME = '@datalayer/loop-plugin-agent-hooks';

export const AgentHooksPlugin = defineAgentCapacityPlugin({
  key: 'hooks',
  displayName: 'Agent Hooks',
  description:
    'Lifecycle hooks and pydantic-style tool hooks: before_tool_execute, after_tool_execute, on_tool_execute_error, deferred_tool_calls.',
  specId: 'example-hooks',
  octicon: 'sync',
  emoji: '\u{1F501}',
});

export default AgentHooksPlugin;
