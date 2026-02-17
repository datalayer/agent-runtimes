/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Agent
 *
 * Standalone chat interface served at /static/agent.html.
 * Connects to the agent-runtimes AG-UI endpoint.
 *
 * The page is opened by codeai with a URL like:
 *   http://127.0.0.1:<port>/static/agent.html?agentId=<id>
 *
 * On mount it ensures the agent exists — creating it automatically
 * if it doesn't — then renders the unified Chat component.
 *
 * Uses the unified Chat component which handles:
 * - AG-UI protocol configuration
 * - AgentDetails panel (via showInformation)
 * - Conversation history persistence
 * - Model/tools/skills selectors
 * - Error and loading states
 */

import React, { useEffect, useState } from 'react';
import { Text, Spinner } from '@primer/react';
import { AlertIcon } from '@primer/octicons-react';
import { Box, setupPrimerPortals } from '@datalayer/primer-addons';
import { DatalayerThemeProvider } from '@datalayer/core';
import { Chat } from './components/chat';
import { DEFAULT_MODEL } from './specs';

import '../style/primer-primitives.css';

setupPrimerPortals();

const BASE_URL = window.location.origin;

function getAgentId(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('agentId') || 'default';
}

/**
 * Agent component — full-page chat interface.
 *
 * Reads the `agentId` query-string parameter, waits for the agent
 * to be available, then renders the Chat.
 */
export const Agent: React.FC = () => {
  const [agentId] = useState(getAgentId);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ensure the agent exists on mount — create it if it doesn't
  useEffect(() => {
    let cancelled = false;

    const ensureAgent = async () => {
      try {
        // First check if the agent already exists
        const getResp = await fetch(
          `${BASE_URL}/api/v1/agents/${encodeURIComponent(agentId)}`,
        );
        if (getResp.ok) {
          if (!cancelled) setIsReady(true);
          return;
        }

        // Agent doesn't exist — create it
        const createResp = await fetch(`${BASE_URL}/api/v1/agents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: agentId,
            description: 'Agent created by Agent page',
            agent_library: 'pydantic-ai',
            transport: 'ag-ui',
            model: DEFAULT_MODEL,
            system_prompt:
              'You are a helpful AI assistant. You can help with code, explanations, and data analysis.',
          }),
        });

        if (createResp.ok || createResp.status === 400) {
          // 400 means agent already exists (race condition), which is fine
          if (!cancelled) setIsReady(true);
        } else {
          const errorData = await createResp.json().catch(() => ({}));
          throw new Error(
            errorData.detail || `Failed to create agent: ${createResp.status}`,
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to reach agent',
          );
        }
      }
    };

    ensureAgent();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  // Loading state while verifying agent
  if (!isReady && !error) {
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
            Connecting to agent {agentId}...
          </Text>
        </Box>
      </DatalayerThemeProvider>
    );
  }

  // Error state
  if (error) {
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
            Failed to connect to agent
          </Text>
          <Text sx={{ color: 'fg.muted', fontSize: 1 }}>{error}</Text>
        </Box>
      </DatalayerThemeProvider>
    );
  }

  // Agent is ready — render the Chat component
  return (
    <DatalayerThemeProvider>
      <Chat
        transport="ag-ui"
        baseUrl={BASE_URL}
        agentId={agentId}
        title="Agent"
        placeholder="Send a message..."
        description="Chat with the agent"
        showHeader={true}
        height={'100vh'}
        showModelSelector={true}
        showToolsMenu={true}
        showSkillsMenu={true}
        showTokenUsage={true}
        showInformation={true}
        autoFocus
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
    </DatalayerThemeProvider>
  );
};

export default Agent;
