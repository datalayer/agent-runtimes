/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useMemo } from 'react';
import { Spinner, Text } from '@primer/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Box } from '@datalayer/primer-addons';
import { ThemedProvider } from './utils/themedProvider';
import { uniqueAgentId } from './utils/agentId';
import { useExampleAgentRuntime } from './hooks/useExampleAgentRuntime';
import { Chat } from '../chat';

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

const AGENT_NAME = 'datalayer-assistant';

/**
 * Agent Runtime Custom Example Component
 *
 * Demonstrates the unified Chat component with AG-UI transport
 * and all necessary providers:
 * - QueryClientProvider for data fetching
 * - Auto-creates agent on the server if it doesn't exist
 */
const AgentRuntimeCustomExample: React.FC = () => {
  const agentName = useMemo(() => uniqueAgentId(AGENT_NAME), []);
  const { agentId, status, error, isReady } = useExampleAgentRuntime({
    exampleId: 'ChatCustomExample',
    agentName,
    agentConfig: {
      description: 'Datalayer AI Assistant - Your helpful coding companion',
      agentLibrary: 'pydantic-ai',
      protocol: 'ag-ui',
      model: 'bedrock:us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      systemPrompt: `You are custom chat assistant, a helpful AI assistant specialized in data science, Python programming, and Jupyter notebooks.

You can help users with:
- Writing and debugging Python code
- Data analysis with pandas, numpy, and other libraries
- Creating visualizations with matplotlib, plotly, etc.
- Machine learning with scikit-learn, pytorch, etc.
- General programming questions

Be concise, helpful, and provide working code examples when appropriate.`,
    },
  });
  const isLoading = !isReady && status !== 'error';
  const retry = () => window.location.reload();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemedProvider>
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
              Custom Chat Example
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
            {isLoading ? (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  gap: 3,
                }}
              >
                <Spinner size="large" />
                <Text sx={{ color: 'fg.muted' }}>Initializing agent...</Text>
              </Box>
            ) : error ? (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  gap: 3,
                  p: 4,
                }}
              >
                <Text sx={{ color: 'danger.fg', fontWeight: 'bold' }}>
                  Failed to initialize agent
                </Text>
                <Text sx={{ color: 'fg.muted', textAlign: 'center' }}>
                  {error}
                </Text>
                <Text
                  as="button"
                  onClick={retry}
                  sx={{
                    color: 'accent.fg',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    border: 'none',
                    background: 'none',
                  }}
                >
                  Retry
                </Text>
              </Box>
            ) : agentId ? (
              <Chat
                protocol="ag-ui"
                agentId={agentId}
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
            ) : null}
          </Box>
        </Box>
      </ThemedProvider>
    </QueryClientProvider>
  );
};

export default AgentRuntimeCustomExample;
