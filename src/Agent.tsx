/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Agent
 *
 * Standalone chat interface served at /agent.html.
 * Connects to the agent-runtimes AG-UI endpoint.
 */

import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Box } from '@datalayer/primer-addons';
import { DatalayerThemeProvider } from '@datalayer/core';
import { ChatFloating } from './components/chat';
import { AgentDetails } from './components/chat/components/AgentDetails';

const queryClient = new QueryClient();

// The AG-UI endpoint is relative to the server that serves this page.
// When served from the agent-runtimes FastAPI, the origin already points
// at the correct host/port, so we just use a relative path.
// The agent-id placeholder is replaced at runtime via a query-string
// parameter (?agent=<id>) or falls back to "default".
function getAgentId(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('agent') || 'default';
}

function getAgentEndpoint(): string {
  return `${window.location.origin}/api/v1/ag-ui/${getAgentId()}`;
}

const AGENT_ID = getAgentId();
const AGENT_ENDPOINT = getAgentEndpoint();
const BASE_URL = window.location.origin;

/**
 * Agent component — full-page chat interface
 */
const Agent: React.FC = () => {
  const [showDetails, setShowDetails] = useState(false);
  const [messageCount, setMessageCount] = useState(0);

  return (
    <DatalayerThemeProvider>
      <Box
        sx={{
          minHeight: '100vh',
          backgroundColor: 'canvas.default',
        }}
      >
        {/* Floating chat widget */}
        <ChatFloating
          endpoint={AGENT_ENDPOINT}
          title="Agent"
          description="Chat with the agent"
          position="bottom-right"
          brandColor="#667eea"
          defaultOpen={true}
          showInformation={true}
          onInformationClick={() => setShowDetails(true)}
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
          panelProps={{
            onMessagesChange: messages => setMessageCount(messages.length),
            backgroundColor: 'canvas.default',
          }}
        />

        {/* Agent Details overlay */}
        {showDetails && (
          <QueryClientProvider client={queryClient}>
            <Box
              sx={{
                position: 'fixed',
                top: 0,
                right: 0,
                bottom: 0,
                width: '400px',
                zIndex: 1002,
                bg: 'canvas.default',
                borderLeft: '1px solid',
                borderColor: 'border.default',
                boxShadow: 'shadow.large',
                overflow: 'auto',
              }}
            >
              <AgentDetails
                name="Agent"
                protocol="ag-ui"
                url={AGENT_ENDPOINT}
                messageCount={messageCount}
                agentId={AGENT_ID}
                apiBase={BASE_URL}
                onBack={() => setShowDetails(false)}
              />
            </Box>
          </QueryClientProvider>
        )}
      </Box>
    </DatalayerThemeProvider>
  );
};

export default Agent;
