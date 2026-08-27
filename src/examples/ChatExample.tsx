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

import React, { useMemo } from 'react';
import { Text, Spinner } from '@primer/react';
import { Box, setupPrimerPortals } from '@datalayer/primer-addons';
import { ThemedProvider } from './utils/themedProvider';
import { uniqueAgentId } from './utils/agentId';
import { useExampleAgentRuntime } from './hooks/useExampleAgentRuntime';
import { ErrorView } from './components';
import { Chat } from '../chat';

setupPrimerPortals();

const AGENTSPEC_ID = 'example-simple';
const AGENT_NAME = 'simple';

const AgentRuntimeChatExample: React.FC = () => {
  const agentName = useMemo(() => uniqueAgentId(AGENT_NAME), []);
  const { agentId, baseUrl, error, status, isReady } = useExampleAgentRuntime({
    exampleId: 'ChatExample',
    agentName,
    specId: AGENTSPEC_ID,
    agentConfig: {
      protocol: 'ag-ui',
      agentSpecId: AGENTSPEC_ID,
    },
  });
  const isCreating = !isReady && status !== 'error';

  // Loading state while agent is being created
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
            Creating agent from {AGENTSPEC_ID}...
          </Text>
        </Box>
      </ThemedProvider>
    );
  }

  // Error state
  if (error || !agentId) {
    return (
      <ThemedProvider>
        <ErrorView
          error="Failed to start agent"
          detail={error || 'No agent ID returned'}
        />
      </ThemedProvider>
    );
  }

  // Agent is ready — render the Chat component
  return (
    <Chat
      protocol="ag-ui"
      baseUrl={baseUrl}
      agentId={agentId}
      title="Simple Agent"
      placeholder="Send a message..."
      description="Chat with a simple AI assistant"
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
