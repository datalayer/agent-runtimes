/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-agent-tool-approvals` — the capacity, as a plugin.
 *
 * Mounts the `example-tool-approvals` agent and offers what it is worth asking. Cast
 * from the shared capacity mould; see `loop/plugins/agent-capacity`.
 *
 * @module loop/plugins/agent-tool-approvals
 */

import { defineAgentCapacityPlugin } from '../agent-capacity';

export const AGENT_TOOL_APPROVALS_PLUGIN_NAME =
  '@datalayer/loop-plugin-agent-tool-approvals';

export const AgentToolApprovalsPlugin = defineAgentCapacityPlugin({
  key: 'tool-approvals',
  displayName: 'Agent Tool Approvals',
  description: 'Agent Tool Approvals',
  specId: 'example-tool-approvals',
  octicon: 'shield-check',
  emoji: '🛡️',
  suggestions: [
    {
      text: 'List your tools',
      message: 'list your tools',
    },
    {
      text: 'Sensitive tool with delegated allow',
      message:
        "Call the runtime_sensitive_echo tool with text 'hello' and reason 'audit', then explain the before_tool_execute decision and reply with the tool result.",
    },
    {
      text: 'Sensitive tool denied by Python hook',
      message:
        "Call the runtime_sensitive_echo tool with text 'danger' and reason 'delete project', then explain why it was denied.",
    },
    {
      text: 'Non-sensitive tool baseline',
      message:
        "Call the runtime_echo tool with text 'hello world', then reply with the tool result.",
    },
    {
      text: 'Inspect audit entries',
      message:
        'Use execute_code to print the latest entries from /tmp/agent_runtimes_tool_approvals_audit.jsonl and summarize decision + execution status.',
    },
    {
      text: 'Explain deferred approvals hook',
      message:
        'Explain how deferred_tool_calls resolves approval-required tool requests inline when a decision is already available.',
    },
  ],
});

export default AgentToolApprovalsPlugin;
