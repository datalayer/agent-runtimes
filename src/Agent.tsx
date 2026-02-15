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
 * Uses the unified Chat component which handles:
 * - DatalayerThemeProvider theming
 * - AG-UI protocol configuration
 * - AgentDetails panel (via showInformation)
 * - Conversation history persistence
 * - Model/tools/skills selectors
 * - Error and loading states
 */

import React from 'react';
import { Chat } from './components/chat';

// The AG-UI endpoint is relative to the server that serves this page.
// When served from the agent-runtimes FastAPI, the origin already points
// at the correct host/port, so we just use a relative path.
// The agent-id placeholder is replaced at runtime via a query-string
// parameter (?agent=<id>) or falls back to "default".
function getAgentId(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('agent') || 'default';
}

const AGENT_ID = getAgentId();
const BASE_URL = window.location.origin;

/**
 * Agent component — full-page chat interface
 */
const Agent: React.FC = () => {
  return (
    <Chat
      transport="ag-ui"
      baseUrl={BASE_URL}
      agentId={AGENT_ID}
      title="Agent"
      placeholder="Send a message..."
      description="Chat with the agent"
      showHeader={true}
      showModelSelector={true}
      showToolsMenu={true}
      showSkillsMenu={true}
      showTokenUsage={true}
      showInformation={true}
      autoFocus
      runtimeId={AGENT_ID}
      historyEndpoint={`${BASE_URL}/api/v1/history?agent_id=${encodeURIComponent(AGENT_ID)}`}
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

export default Agent;
