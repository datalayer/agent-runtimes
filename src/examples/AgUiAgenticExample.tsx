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
 * Backend: /api/v1/examples/agentic_chat/
 */

import React from 'react';
import { Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { DatalayerThemeProvider } from '@datalayer/core';
import { ChatFloating } from '../components/chat';

// AG-UI endpoint for agentic chat example
const AGENTIC_CHAT_ENDPOINT =
  'http://localhost:8765/api/v1/examples/agentic_chat/';

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
const AgUiAgenticExample: React.FC = () => {
  return (
    <DatalayerThemeProvider>
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
            conversation with an AI agent that can use tools.
          </Text>

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
              Available Tools
            </Text>
            <Box as="ul" sx={{ paddingLeft: 3 }}>
              <Box as="li" sx={{ marginBottom: 1 }}>
                <Text sx={{ fontFamily: 'mono', fontSize: 1 }}>
                  current_time()
                </Text>
                <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
                  {' '}
                  - Returns the current date and time
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
              Try asking: "What time is it?" or "What's the current date?"
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
        <ChatFloating
          endpoint={AGENTIC_CHAT_ENDPOINT}
          title="Agentic Chat"
          description="Chat with an AI agent that can use tools like getting the current time."
          position="bottom-right"
          brandColor="#7c3aed"
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
      </Box>
    </DatalayerThemeProvider>
  );
};

export default AgUiAgenticExample;
