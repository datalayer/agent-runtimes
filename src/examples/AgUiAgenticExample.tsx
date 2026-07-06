/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AgUiAgenticExample
 *
 * Demonstrates a floating chat popup that connects to the AG-UI
 * Agentic Chat example backend. The agent has access to tools like
 * getting the current time.
 *
 * This is the simplest AG-UI example showing basic chat with tool use.
 *
 * Backend: managed AG-UI agent runtime (agentspec: example-agentic-chat)
 */

import React, { useMemo } from 'react';
import { Spinner, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { ThemedProvider } from './utils/themedProvider';
import { ChatFloating } from '../chat';
import { useExampleAgentRuntimesUrl } from './utils/useExampleAgentRuntimesUrl';
import { uniqueAgentId } from './utils/agentId';
import { useExampleAgentRuntime } from './hooks/useExampleAgentRuntime';

/**
 * AgUiAgenticExample Component
 *
 * Shows a floating chat button that opens a chat popup connected to
 * the Agentic Chat AG-UI example.
 *
 * Features demonstrated:
 * - Basic AG-UI SSE streaming
 * - Tool calling (current_time tool)
 * - Floating popup interface
 */
const AGENT_NAME = 'ag-ui-agentic';
const AGENTSPEC_ID = 'example-agentic-chat';

const AgUiAgenticExample: React.FC = () => {
  const baseUrl = useExampleAgentRuntimesUrl();
  const agentName = useMemo(() => uniqueAgentId(AGENT_NAME), []);
  const { agentId, status, error, isReady } = useExampleAgentRuntime({
    exampleId: 'AgUiAgenticExample',
    agentName,
    specId: AGENTSPEC_ID,
    agentConfig: {
      protocol: 'ag-ui',
      agentSpecId: AGENTSPEC_ID,
    },
  });

  const agenticChatEndpoint =
    agentId != null ? `${baseUrl}/api/v1/ag-ui/${agentId}/` : undefined;
  const isLoading = !isReady && status !== 'error';

  return (
    <ThemedProvider>
      <Box
        sx={{
          minHeight: '100vh',
          backgroundColor: 'canvas.default',
          padding: 4,
        }}
      >
        {/* Page content */}
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
            AG-UI: Agentic Example
          </Text>
          <Text
            as="p"
            sx={{
              fontSize: 2,
              color: 'fg.muted',
              marginBottom: 4,
            }}
          >
            Click the chat button in the bottom-right corner to start a
            conversation with an AI agent. The runtime target (local or cloud)
            follows your selection in the examples header.
          </Text>

          {isLoading && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                marginBottom: 3,
              }}
            >
              <Spinner size="small" />
              <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
                Starting managed agent runtime...
              </Text>
            </Box>
          )}

          {error && (
            <Box
              sx={{
                padding: 3,
                marginBottom: 3,
                backgroundColor: 'danger.subtle',
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'danger.muted',
              }}
            >
              <Text sx={{ color: 'danger.fg', fontSize: 1 }}>
                Failed to initialize managed agent runtime: {error}
              </Text>
            </Box>
          )}

          <Box
            sx={{
              padding: 4,
              backgroundColor: 'canvas.subtle',
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'border.default',
            }}
          >
            <Text
              as="h2"
              sx={{ fontSize: 2, fontWeight: 'semibold', marginBottom: 2 }}
            >
              Runtime Mode
            </Text>
            <Box as="ul" sx={{ paddingLeft: 3 }}>
              <Box as="li" sx={{ marginBottom: 1 }}>
                <Text sx={{ fontFamily: 'mono', fontSize: 1 }}>
                  managed runtime + managed agent
                </Text>
                <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
                  {' '}
                  - Launches on cloud when the header target is set to cloud
                </Text>
              </Box>
            </Box>
            <Text
              as="p"
              sx={{
                fontSize: 1,
                color: 'fg.muted',
                marginTop: 3,
              }}
            >
              Try asking: "hi" or "what can you help with?"
            </Text>
          </Box>

          <Box
            sx={{
              marginTop: 4,
              padding: 4,
              backgroundColor: 'canvas.subtle',
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'border.default',
            }}
          >
            <Text
              as="h2"
              sx={{ fontSize: 2, fontWeight: 'semibold', marginBottom: 2 }}
            >
              About This Example
            </Text>
            <Text as="p" sx={{ fontSize: 1, color: 'fg.muted' }}>
              This example demonstrates the AG-UI (Agent User Interface)
              protocol for streaming AI interactions. The agent uses SSE
              (Server-Sent Events) to stream responses and tool calls in
              real-time.
            </Text>
            <Text as="p" sx={{ fontSize: 1, color: 'fg.muted', marginTop: 2 }}>
              <strong>Protocol Events:</strong> TEXT_MESSAGE_START,
              TEXT_MESSAGE_CONTENT, TEXT_MESSAGE_END, TOOL_CALL_START,
              TOOL_CALL_END
            </Text>
          </Box>
        </Box>

        {/* Floating chat */}
        {agenticChatEndpoint && (
          <ChatFloating
            protocol="ag-ui"
            endpoint={agenticChatEndpoint}
            title="Agentic Chat"
            description="Chat with a managed AG-UI agent runtime."
            position="bottom-right"
            defaultOpen={true}
            suggestions={[
              {
                title: 'What time is it?',
                message: 'What is the current time?',
              },
              {
                title: "Today's date",
                message: "What's the current date?",
              },
            ]}
          />
        )}
      </Box>
    </ThemedProvider>
  );
};

export default AgUiAgenticExample;
