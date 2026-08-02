/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React, { useMemo } from 'react';
import { Text, Spinner } from '@primer/react';
import { SyncIcon } from '@primer/octicons-react';
import { Box, setupPrimerPortals } from '@datalayer/primer-addons';
import { ThemedProvider } from './utils/themedProvider';
import { uniqueAgentId } from './utils/agentId';
import { useExampleAgentRuntimesUrl } from './utils/useExampleAgentRuntimesUrl';
import { useExampleAgentRuntime } from './hooks/useExampleAgentRuntime';
import { ErrorView } from './components';
import { Chat } from '../chat';

setupPrimerPortals();

const AGENTSPEC_ID = 'example-hooks';
const AGENT_NAME = 'hooks-example-agent';

const AgentHooksExample: React.FC = () => {
  const baseUrl = useExampleAgentRuntimesUrl();
  const agentName = useMemo(() => uniqueAgentId(AGENT_NAME), []);
  const { agentId, error, status, isReady } = useExampleAgentRuntime({
    exampleId: 'AgentHooksExample',
    agentName,
    specId: AGENTSPEC_ID,
    agentConfig: {
      protocol: 'vercel-ai',
      agentSpecId: AGENTSPEC_ID,
    },
  });
  const isCreating = !isReady && status !== 'error';

  if (isCreating) {
    return (
      <ThemedProvider>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: 3,
            bg: 'canvas.default',
          }}
        >
          <Spinner size="large" />
          <Text sx={{ color: 'fg.muted' }}>
            Creating agent from {AGENTSPEC_ID}...
          </Text>
        </Box>
      </ThemedProvider>
    );
  }

  if (error || !agentId) {
    return (
      <ThemedProvider>
        <ErrorView
          error="Failed to start hooks agent"
          detail={error || 'No agent ID returned'}
        />
      </ThemedProvider>
    );
  }

  return (
    <Chat
      protocol="vercel-ai"
      baseUrl={baseUrl}
      agentId={agentId}
      title="Hooks Agent"
      brandIcon={<SyncIcon size={16} />}
      placeholder="Ask about lifecycle hooks..."
      description="Demonstrates lifecycle hooks and pydantic-style tool hooks: before_tool_execute, after_tool_execute, on_tool_execute_error, deferred_tool_calls"
      showHeader={true}
      kernelIndicatorPlacement="right"
      showModelSelector={true}
      showToolsMenu={true}
      showSkillsMenu={true}
      showTokenUsage={true}
      showInformation={true}
      autoFocus
      height="100vh"
      runtimeId={agentId}
      historyEndpoint={`${baseUrl}/api/v1/history`}
      suggestions={[
        {
          title: 'Read the pre-hook marker file',
          message:
            'Use execute_code to read /tmp/agent_runtimes_pre_hook_demo.txt and show its contents.',
        },
        {
          title: 'Verify hook variables',
          message:
            'Use execute_code to run this verification:\n```python\nassert isinstance(hook_name, str) and hook_name == "example-hooks:pre", f"❌ hook_name wrong: {hook_name!r}"\nassert isinstance(hook_ran_at, str) and len(hook_ran_at) > 0, f"❌ hook_ran_at wrong: {hook_ran_at!r}"\nassert isinstance(hook_env, dict) and len(hook_env) > 0, f"❌ hook_env wrong: {hook_env!r}"\nprint("✅ hook_name =", hook_name)\nprint("✅ hook_ran_at =", hook_ran_at)\nprint("✅ hook_env =", hook_env)\n```\nThrow an exception with a ❌ message if any variable is missing or has the wrong type, print ✅ lines if all pass.',
        },
        {
          title: "Verify 'rich' was installed",
          message:
            'Use execute_code to import rich and print its version — the pre-hook installed it via pip.',
        },
        {
          title: 'Explain the hook lifecycle',
          message:
            'What pre-hooks and post-hooks are configured for this agent, and when does each run?',
        },
        {
          title: 'Trigger function + python tool hooks',
          message:
            "Call runtime_sensitive_echo with text 'hello' and reason 'audit', then explain which before_tool_execute hooks ran (function and python).",
        },
        {
          title: 'Trigger deny in python hook',
          message:
            "Call runtime_sensitive_echo with text 'danger' and reason 'delete notebook', then explain why local Python policy denied it.",
        },
        {
          title: 'Read tool approval audit log',
          message:
            'Use execute_code to show the latest entries from /tmp/agent_runtimes_tool_approvals_audit.jsonl and summarize decision and execution status.',
        },
        {
          title: 'Explain deferred hook handling',
          message:
            'Explain how deferred_tool_calls works with approval-required tools and when inline resolution is used in this run.',
        },
      ]}
      submitOnSuggestionClick
    />
  );
};

export default AgentHooksExample;
