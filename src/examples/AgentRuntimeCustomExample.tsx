/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useCallback, useEffect, useState } from 'react';
import { Spinner, Text } from '@primer/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Box } from '@datalayer/primer-addons';
import { DatalayerThemeProvider } from '@datalayer/core';
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

const AGENT_NAME = 'datalayer-assistant';
const BASE_URL = 'http://localhost:8765';

/**
 * Hook to ensure the agent exists on the server
 * Creates the agent if it doesn't exist
 */
function useEnsureAgent() {
  const [agentId, setAgentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const createAgent = useCallback(async (): Promise<string | null> => {
    try {
      const response = await fetch(`${BASE_URL}/api/v1/agents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: AGENT_NAME,
          description: 'Datalayer AI Assistant - Your helpful coding companion',
          agent_library: 'pydantic-ai',
          transport: 'ag-ui',
          model: 'openai:gpt-4o-mini',
          system_prompt: `You are Datalayer Assistant, a helpful AI assistant specialized in data science, Python programming, and Jupyter notebooks.

You can help users with:
- Writing and debugging Python code
- Data analysis with pandas, numpy, and other libraries
- Creating visualizations with matplotlib, plotly, etc.
- Machine learning with scikit-learn, pytorch, etc.
- General programming questions

Be concise, helpful, and provide working code examples when appropriate.`,
        }),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ detail: 'Unknown error' }));
        throw new Error(
          errorData.detail || `Failed to create agent: ${response.status}`,
        );
      }

      const data = await response.json();
      console.log('[AgentRuntimeCustomExample] Agent created:', data);
      return data.id;
    } catch (err) {
      console.error('[AgentRuntimeCustomExample] Error creating agent:', err);
      throw err;
    }
  }, []);

  const checkOrCreateAgent = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // First, try to find existing agent by name
      const listResponse = await fetch(`${BASE_URL}/api/v1/agents`);
      if (listResponse.ok) {
        const data = await listResponse.json();
        // API may return { agents: [...] } or just [...]
        const agents = Array.isArray(data) ? data : data.agents || [];
        const existingAgent = agents.find(
          (a: { name: string }) => a.name === AGENT_NAME,
        );
        if (existingAgent) {
          console.log(
            '[AgentRuntimeCustomExample] Found existing agent:',
            existingAgent.id,
          );
          setAgentId(existingAgent.id);
          setIsLoading(false);
          return;
        }
      }

      // Agent doesn't exist, create it
      console.log('[AgentRuntimeCustomExample] Creating new agent...');
      const newAgentId = await createAgent();
      if (newAgentId) {
        setAgentId(newAgentId);
      } else {
        setError('Failed to create agent');
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to initialize agent';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [createAgent]);

  useEffect(() => {
    checkOrCreateAgent();
  }, [checkOrCreateAgent]);

  return { agentId, isLoading, error, retry: checkOrCreateAgent };
}

/**
 * Agent Runtime Custom Example Component
 *
 * Demonstrates the unified Chat component with AG-UI transport
 * and all necessary providers:
 * - QueryClientProvider for data fetching
 * - Auto-creates agent on the server if it doesn't exist
 */
const AgentRuntimeCustomExample: React.FC = () => {
  const { agentId, isLoading, error, retry } = useEnsureAgent();

  return (
    <QueryClientProvider client={queryClient}>
      <DatalayerThemeProvider>
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
              Datalayer Assistant
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
                transport="ag-ui"
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
      </DatalayerThemeProvider>
    </QueryClientProvider>
  );
};

export default AgentRuntimeCustomExample;
