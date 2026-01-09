/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { Text } from '@primer/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Box } from '@datalayer/primer-addons';
import { datalayerTheme, DatalayerThemeProvider } from '@datalayer/core';
import { Chat } from '../components/chat';

// Create a query client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 10, // 10 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Agent Runtime Custom Example Component
 *
 * Demonstrates the unified Chat component with Simple transport
 * and all necessary providers:
 * - QueryClientProvider for data fetching
 */
const AgentRuntimeCustomExample: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <DatalayerThemeProvider theme={datalayerTheme}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            backgroundColor: 'canvas.default',
          }}
        >
          <Box
            as="header"
            sx={{
              borderBottom: '1px solid',
              borderColor: 'border.default',
              padding: 3,
            }}
          >
            <Text
              sx={{
                fontSize: 3,
                fontWeight: 'bold',
                display: 'block',
                marginBottom: 1,
              }}
            >
              Agent Runtime Custom Example
            </Text>
            <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
              Interactive chat interface with AI assistance
            </Text>
          </Box>
          <Box
            as="main"
            sx={{
              flex: 1,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <Chat
              transport="vercel-ai-jupyter"
              showModelSelector={true}
              showToolsMenu={true}
              height="100%"
              suggestions={[
                {
                  title: '👋 Say hello',
                  message: 'Hello! What can you help me with today?',
                },
                {
                  title: '💡 Explain concepts',
                  message: 'Can you explain how AI agents work?',
                },
                {
                  title: '🔧 Help with code',
                  message: 'Can you help me write some Python code?',
                },
                {
                  title: '📊 Data analysis',
                  message: 'How do I analyze data with pandas?',
                },
              ]}
            />
          </Box>
        </Box>
      </DatalayerThemeProvider>
    </QueryClientProvider>
  );
};

export default AgentRuntimeCustomExample;
