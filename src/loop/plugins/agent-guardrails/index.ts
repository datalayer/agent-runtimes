/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-agent-guardrails` — the capacity, as a plugin.
 *
 * Mounts the `example-guardrails` agent and offers what it is worth asking. Cast
 * from the shared capacity mould; see `loop/plugins/agent-capacity`.
 *
 * @module loop/plugins/agent-guardrails
 */

import { defineAgentCapacityPlugin } from '../agent-capacity';

export const AGENT_GUARDRAILS_PLUGIN_NAME =
  '@datalayer/loop-plugin-agent-guardrails';

export const AgentGuardrailsPlugin = defineAgentCapacityPlugin({
  key: 'guardrails',
  displayName: 'Agent Guardrails',
  description:
    'Cost guardrail with OTEL-backed gauge and hook-aware approvals (before_tool_execute, after_tool_execute, on_tool_execute_error, deferred_tool_calls)',
  specId: 'example-guardrails',
  octicon: 'shield-lock',
  emoji: '🚧',
  suggestions: [
    {
      text: 'Update CRM',
      message: 'Update the CRM records for Q3',
    },
    {
      text: 'Trigger before_tool_execute',
      message:
        "Call runtime_sensitive_echo with text 'hello' and reason 'audit', then explain the before_tool_execute authorization decision.",
    },
    {
      text: 'Trigger deny policy',
      message:
        "Call runtime_sensitive_echo with text 'danger' and reason 'delete CRM rows', then explain why policy denied it.",
    },
    {
      text: 'Explain deferred flow',
      message:
        'Explain how deferred_tool_calls and manual approvals interact in this guardrails run.',
    },
  ],
});

export default AgentGuardrailsPlugin;
