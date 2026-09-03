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
  suggestions: [
    {
      text: 'Read the pre-hook marker file',
      message:
        'Use execute_code to read /tmp/agent_runtimes_pre_hook_demo.txt and show its contents.',
    },
    {
      text: 'Verify hook variables',
      message:
        'Use execute_code to run this verification:\n```python\nassert isinstance(hook_name, str) and hook_name == "example-hooks:pre", f"❌ hook_name wrong: {hook_name!r}"\nassert isinstance(hook_ran_at, str) and len(hook_ran_at) > 0, f"❌ hook_ran_at wrong: {hook_ran_at!r}"\nassert isinstance(hook_env, dict) and len(hook_env) > 0, f"❌ hook_env wrong: {hook_env!r}"\nprint("✅ hook_name =", hook_name)\nprint("✅ hook_ran_at =", hook_ran_at)\nprint("✅ hook_env =", hook_env)\n```\nThrow an exception with a ❌ message if any variable is missing or has the wrong type, print ✅ lines if all pass.',
    },
    {
      text: "Verify 'rich' was installed",
      message:
        'Use execute_code to import rich and print its version — the pre-hook installed it via pip.',
    },
    {
      text: 'Explain the hook lifecycle',
      message:
        'What pre-hooks and post-hooks are configured for this agent, and when does each run?',
    },
    {
      text: 'Trigger function + python tool hooks',
      message:
        "Call runtime_sensitive_echo with text 'hello' and reason 'audit', then explain which before_tool_execute hooks ran (function and python).",
    },
    {
      text: 'Trigger deny in python hook',
      message:
        "Call runtime_sensitive_echo with text 'danger' and reason 'delete notebook', then explain why local Python policy denied it.",
    },
    {
      text: 'Read tool approval audit log',
      message:
        'Use execute_code to show the latest entries from /tmp/agent_runtimes_tool_approvals_audit.jsonl and summarize decision and execution status.',
    },
    {
      text: 'Explain deferred hook handling',
      message:
        'Explain how deferred_tool_calls works with approval-required tools and when inline resolution is used in this run.',
    },
  ],
});

export default AgentHooksPlugin;
