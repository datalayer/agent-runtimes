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
 * On mount it verifies the agent exists (codeai creates it before
 * opening the browser), then renders the unified Chat component.
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
const Agent: React.FC = () => {
  const [agentId] = useState(getAgentId);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Verify the agent exists on mount
  useEffect(() => {
    let cancelled = false;

    const checkAgent = async () => {
      try {
        const response = await fetch(
          `${BASE_URL}/api/v1/agents/${encodeURIComponent(agentId)}`,
        );
        if (!response.ok) {
          const data = await response
            .json()
            .catch(() => ({ detail: 'Unknown error' }));
          throw new Error(
            data.detail || `Agent "${agentId}" not found (${response.status})`,
          );
        }
        if (!cancelled) {
          setIsReady(true);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to reach agent',
          );
        }
      }
    };

    checkAgent();
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
