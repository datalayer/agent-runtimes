/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Agent
 *
 * Standalone chat interface served at /agent.html.
 * Connects to the agent-runtimes AG-UI endpoint.
 *
 * Based on AgUiHaikuGenUIExample — will be customised further.
 */

import React from 'react';
import { Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { DatalayerThemeProvider } from '@datalayer/core';
import { ChatFloating } from './components/chat';

// The AG-UI endpoint is relative to the server that serves this page.
// When served from the agent-runtimes FastAPI, the origin already points
// at the correct host/port, so we just use a relative path.
// The agent-id placeholder is replaced at runtime via a query-string
// parameter (?agent=<id>) or falls back to "default".
function getAgentEndpoint(): string {
  const params = new URLSearchParams(window.location.search);
  const agentId = params.get('agent') || 'default';
  return `${window.location.origin}/api/v1/ag-ui/${agentId}`;
}

const AGENT_ENDPOINT = getAgentEndpoint();

/**
 * Agent component — full-page chat interface
 */
const Agent: React.FC = () => {
  return (
    <DatalayerThemeProvider>
      <Box
        sx={{
          minHeight: '100vh',
          backgroundColor: 'canvas.default',
          padding: 4,
        }}
      >
        <Box
          sx={{
            maxWidth: '800px',
            margin: '0 auto',
          }}
        >
          <Text
            as="h1"
            sx={{
              fontSize: 4,
              fontWeight: 'bold',
              marginBottom: 2,
            }}
          >
            Agent Chat
          </Text>
          <Text
            as="p"
            sx={{
              fontSize: 2,
              color: 'fg.muted',
              marginBottom: 4,
            }}
          >
            Chat with your agent. Use the floating chat widget to start a
            conversation.
          </Text>
        </Box>

        {/* Floating chat widget */}
        <ChatFloating
          endpoint={AGENT_ENDPOINT}
          title="Agent"
          description="Chat with the agent"
          position="bottom-right"
          brandColor="#667eea"
          defaultOpen={true}
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
        />
      </Box>
    </DatalayerThemeProvider>
  );
};

export default Agent;
