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
      description="Demonstrates pre-hooks and post-hooks running in sandbox lifecycle"
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
          title: 'What hooks ran?',
          message: 'Explain which pre-hooks executed when you started.',
        },
        {
          title: 'Use runtime echo',
          message: "Call runtime_echo with text 'hooks-ready'.",
        },
      ]}
      submitOnSuggestionClick
    />
  );
};

export default AgentHooksExample;
