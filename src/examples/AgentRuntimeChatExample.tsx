/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AgentRuntimeChatExample
 *
 * Demonstrates the unified Chat component with automatic agent creation.
 * On mount, it creates an agent from the codeai/simple spec via the
 * REST API, then renders a full-page Chat interface.
 *
 * This mirrors how agent.html works but inside the examples runner,
 * without requiring a CLI `--agent-id` flag at server startup.
 *
 * Backend: POST /api/v1/agents  →  /api/v1/ag-ui/{agentId}/
 */

import React, { useEffect, useState } from 'react';
import { Text, Spinner } from '@primer/react';
import { AlertIcon } from '@primer/octicons-react';
import { Box, setupPrimerPortals } from '@datalayer/primer-addons';
import { DatalayerThemeProvider } from '@datalayer/core';
import { Chat } from '../components/chat';

setupPrimerPortals();

const BASE_URL = 'http://localhost:8765';
const AGENT_SPEC_ID = 'codeai/simple';
const AGENT_NAME = 'simple';

const AgentRuntimeChatExample: React.FC = () => {
  const [agentId, setAgentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(true);

  // Create the agent on mount
  useEffect(() => {
    let cancelled = false;

    const ensureAgent = async () => {
      try {
        // First, check if the agent already exists
        const checkResponse = await fetch(
          `${BASE_URL}/api/v1/agents/${encodeURIComponent(AGENT_NAME)}`,
        );
        if (checkResponse.ok) {
          // Agent exists — reuse it (preserves conversation history)
          if (!cancelled) {
            setAgentId(AGENT_NAME);
            setIsCreating(false);
          }
          return;
        }

        // Agent doesn't exist — create it from the library spec
        const response = await fetch(`${BASE_URL}/api/v1/agents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: AGENT_NAME,
            agent_spec_id: AGENT_SPEC_ID,
            transport: 'ag-ui',
          }),
        });

        if (!response.ok) {
          const data = await response
            .json()
            .catch(() => ({ detail: 'Unknown error' }));
          // Race condition: agent was created between our check and POST
          if (
            response.status === 400 &&
            data.detail?.includes('already exists')
          ) {
            if (!cancelled) {
              setAgentId(AGENT_NAME);
              setIsCreating(false);
            }
            return;
          }
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

    ensureAgent();
    return () => {
      cancelled = true;
    };
  }, []);

  // Loading state while agent is being created
  if (isCreating) {
    return (
      <DatalayerThemeProvider>
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
      </DatalayerThemeProvider>
    );
  }

  // Error state
  if (error || !agentId) {
    return (
      <DatalayerThemeProvider>
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
          <AlertIcon size={48} />
          <Text sx={{ color: 'danger.fg', fontSize: 2 }}>
            Failed to start agent
          </Text>
          <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
            {error || 'No agent ID returned'}
          </Text>
        </Box>
      </DatalayerThemeProvider>
    );
  }

  // Agent is ready — render the Chat component
  return (
    <Chat
      transport="ag-ui"
      baseUrl={BASE_URL}
      agentId={agentId}
      title="Simple Agent"
      placeholder="Send a message..."
      description="Chat with a simple AI assistant"
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
          title: 'Hello',
          message: 'Hello, what can you do?',
        },
        {
          title: 'Help',
          message: 'What tools do you have available?',
        },
      ]}
      submitOnSuggestionClick
    />
  );
};

export default AgentRuntimeChatExample;
