/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React, { useEffect, useState } from 'react';
import { Text, Spinner } from '@primer/react';
import { Box, setupPrimerPortals } from '@datalayer/primer-addons';
import { ThemedProvider } from './utils/themedProvider';
import { uniqueAgentId } from './utils/agentId';
import { ErrorView } from './components';
import { Chat } from '../chat';

setupPrimerPortals();

const BASE_URL = 'http://localhost:8765';
const AGENT_SPEC_ID = 'demo-hooks';
const AGENT_NAME = 'hooks-demo';

const AgentHooksExample: React.FC = () => {
  const [agentId, setAgentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const name = uniqueAgentId(AGENT_NAME);

    const createAgent = async () => {
      try {
        const response = await fetch(`${BASE_URL}/api/v1/agents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            agent_spec_id: AGENT_SPEC_ID,
            transport: 'vercel-ai',
          }),
        });

        if (!response.ok) {
          const data = await response
            .json()
            .catch(() => ({ detail: 'Unknown error' }));
          throw new Error(
            data.detail || `Failed to create agent: ${response.status}`,
          );
        }

        const data = await response.json();
        if (!cancelled) {
          setAgentId(data.id);
          setIsCreating(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to create agent',
          );
          setIsCreating(false);
        }
      }
    };

    createAgent();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (!agentId) {
        return;
      }
      void fetch(`${BASE_URL}/api/v1/agents/${encodeURIComponent(agentId)}`, {
        method: 'DELETE',
      }).catch(() => {
        // Ignore teardown failures in example mode.
      });
    };
  }, [agentId]);

  if (isCreating) {
    return (
      <ThemedProvider>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            gap: 3,
            bg: 'canvas.default',
          }}
        >
          <Spinner size="large" />
          <Text sx={{ color: 'fg.muted' }}>
            Creating agent from {AGENT_SPEC_ID}...
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
      baseUrl={BASE_URL}
      agentId={agentId}
      title="Hooks Agent"
      placeholder="Ask about lifecycle hooks..."
      description="Pre-hook installed 'rich', wrote a marker file, and set hook_name / hook_ran_at / hook_env variables in the sandbox"
      showHeader={true}
      showModelSelector={true}
      showToolsMenu={true}
      showSkillsMenu={true}
      showTokenUsage={true}
      showInformation={true}
      autoFocus
      height="100vh"
      runtimeId={agentId}
      historyEndpoint={`${BASE_URL}/api/v1/history`}
      suggestions={[
        {
          title: 'Read the pre-hook marker file',
          message:
            'Use execute_code to read /tmp/agent_runtimes_pre_hook_demo.txt and show its contents.',
        },
        {
          title: 'Verify hook variables',
          message:
            'Use execute_code to run this verification:\n```python\nassert isinstance(hook_name, str) and hook_name == "demo-hooks:pre", f"❌ hook_name wrong: {hook_name!r}"\nassert isinstance(hook_ran_at, str) and len(hook_ran_at) > 0, f"❌ hook_ran_at wrong: {hook_ran_at!r}"\nassert isinstance(hook_env, dict) and len(hook_env) > 0, f"❌ hook_env wrong: {hook_env!r}"\nprint("✅ hook_name =", hook_name)\nprint("✅ hook_ran_at =", hook_ran_at)\nprint("✅ hook_env =", hook_env)\n```\nThrow an exception with a ❌ message if any variable is missing or has the wrong type, print ✅ lines if all pass.',
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
      ]}
      submitOnSuggestionClick
    />
  );
};

export default AgentHooksExample;
