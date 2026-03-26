/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Agent Runtime Notebook Example with Agent-Runtimes Integration
 *
 * This example demonstrates using the agent-runtimes ChatFloating component
 * with notebook tools for AI-assisted notebook editing.
 *
 * To run this example:
 * 1. Start the agent-runtimes server: `npm run start:server`
 * 2. Start the frontend: `npm run dev`
 *
 * @module examples/AgentRuntimeNotebookExample
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Box } from '@datalayer/primer-addons';
import { SegmentedControl, Text } from '@primer/react';
import { ServiceManager } from '@jupyterlab/services';
import { Notebook } from '@datalayer/jupyter-react';
import { ThemedJupyterProvider } from './stores/themedProvider';

// Agent-runtimes imports
import { ChatFloating } from '../chat';
import { useNotebookTools } from '../tools/adapters/agent-runtimes/notebookHooks';

// Import Matplotlib notebook
import MatplotlibNotebook from './stores/notebooks/Matplotlib.ipynb.json';

import { DEFAULT_MODEL } from '../specs';

type TransportProtocol = 'ag-ui' | 'vercel-ai';

// Fixed notebook ID
const NOTEBOOK_ID = 'agui-notebook-example';

// Use the imported Matplotlib notebook
const NOTEBOOK_CONTENT = MatplotlibNotebook;

// Base URL for agent-runtimes server
const BASE_URL = 'http://localhost:8765';
const AGENT_ID = 'notebook-agent-runtime-example';

/**
 * Build the endpoint URL for a given transport protocol.
 * AG-UI endpoints need a trailing slash for mounted Starlette apps.
 */
function getEndpoint(protocol: TransportProtocol): string {
  if (protocol === 'ag-ui') {
    return `${BASE_URL}/api/v1/ag-ui/${AGENT_ID}/`;
  }
  return `${BASE_URL}/api/v1/vercel-ai/${AGENT_ID}`;
}

/**
 * Hook to ensure the demo-agent exists on the server.
 * Creates it if it doesn't exist.
 */
function useEnsureAgent(
  agentId: string,
  baseUrl: string,
  transport: TransportProtocol,
): {
  isReady: boolean;
  error: string | null;
} {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function ensureAgent() {
      try {
        // Try to create the agent (will fail if already exists, which is fine)
        const response = await fetch(`${baseUrl}/api/v1/agents`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: agentId,
            description: 'Demo agent for notebook example',
            agent_library: 'pydantic-ai',
            transport,
            model: DEFAULT_MODEL,
            system_prompt:
              'You are a helpful AI assistant that helps users work with Jupyter notebooks. You can help with code, explanations, and data analysis.',
          }),
        });

        if (mounted) {
          if (response.ok) {
            console.log(`[AgentRuntimeExample] Created agent: ${agentId}`);
            setIsReady(true);
          } else if (response.status === 400) {
            // Agent already exists, which is fine
            console.log(
              `[AgentRuntimeExample] Agent already exists: ${agentId}`,
            );
            setIsReady(true);
          } else {
            const errorData = await response.json().catch(() => ({}));
            setError(
              errorData.detail || `Failed to create agent: ${response.status}`,
            );
          }
        }
      } catch (err) {
        if (mounted) {
          console.error('[AgentRuntimeExample] Error creating agent:', err);
          setError(
            err instanceof Error ? err.message : 'Failed to connect to server',
          );
        }
      }
    }

    ensureAgent();

    return () => {
      mounted = false;
    };
  }, [agentId, baseUrl, transport]);

  return { isReady, error };
}

/**
 * Notebook UI component (without tool registration)
 */
interface NotebookUIProps {
  serviceManager?: ServiceManager.IManager;
  protocol: TransportProtocol;
  isSwitching: boolean;
  onProtocolChange: (index: number) => void;
}

const NotebookUI = React.memo(function NotebookUI({
  serviceManager,
  protocol,
  isSwitching,
  onProtocolChange,
}: NotebookUIProps): JSX.Element {
  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
        padding: 3,
      }}
    >
      <Box
        sx={{
          marginBottom: 3,
          paddingBottom: 3,
          borderBottom: '1px solid',
          borderColor: 'border.default',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Box as="h1" sx={{ margin: 0 }}>
            Agent Runtime Notebook Example
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Text sx={{ color: 'fg.muted', fontSize: 1 }}>Protocol:</Text>
            <SegmentedControl
              aria-label="Transport protocol"
              size="small"
              onChange={onProtocolChange}
            >
              <SegmentedControl.Button selected={protocol === 'ag-ui'}>
                AG-UI
              </SegmentedControl.Button>
              <SegmentedControl.Button selected={protocol === 'vercel-ai'}>
                Vercel AI
              </SegmentedControl.Button>
            </SegmentedControl>
            {isSwitching && (
              <Text sx={{ color: 'attention.fg', fontSize: 0 }}>
                Switching...
              </Text>
            )}
          </Box>
        </Box>
        <p>
          Platform-agnostic tool usage with agent-runtimes integration. Use the
          AI copilot to manipulate the notebook.
        </p>
      </Box>

      <Box
        sx={{
          border: '1px solid',
          borderColor: 'border.default',
          borderRadius: 2,
          padding: 3,
          backgroundColor: 'canvas.default',
        }}
      >
        {serviceManager ? (
          <ThemedJupyterProvider>
            <Notebook
              nbformat={NOTEBOOK_CONTENT}
              id={NOTEBOOK_ID}
              serviceManager={serviceManager}
              height="calc(100vh - 300px)"
              cellSidebarMargin={120}
              startDefaultKernel={true}
            />
          </ThemedJupyterProvider>
        ) : (
          <Box sx={{ padding: 3 }}>
            <p>Loading service manager...</p>
          </Box>
        )}
      </Box>
    </Box>
  );
});

/**
 * Component that renders the Notebook UI with ChatFloating and tool registration.
 */
interface NotebookWithChatProps {
  serviceManager?: ServiceManager.IManager;
}

function NotebookWithChat({
  serviceManager,
}: NotebookWithChatProps): JSX.Element {
  const [protocol, setProtocol] = useState<TransportProtocol>('vercel-ai');
  const [isSwitching, setIsSwitching] = useState(false);

  // Ensure the agent exists before rendering chat
  const { isReady, error } = useEnsureAgent(AGENT_ID, BASE_URL, protocol);

  // Get notebook tools for ChatFloating
  const frontendTools = useNotebookTools(NOTEBOOK_ID);

  // Compute endpoint from current protocol
  const endpoint = getEndpoint(protocol);

  // Handle protocol toggle
  const handleProtocolChange = useCallback(
    async (index: number) => {
      const newProtocol: TransportProtocol =
        index === 0 ? 'ag-ui' : 'vercel-ai';
      if (newProtocol === protocol) return;

      setIsSwitching(true);
      try {
        const response = await fetch(
          `${BASE_URL}/api/v1/agents/${AGENT_ID}/transport`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transport: newProtocol }),
          },
        );
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error(
            '[NotebookExample] Failed to switch transport:',
            errorData,
          );
          return;
        }
        console.log(
          `[NotebookExample] Switched transport: ${protocol} -> ${newProtocol}`,
        );
        setProtocol(newProtocol);
      } catch (err) {
        console.error('[NotebookExample] Error switching transport:', err);
      } finally {
        setIsSwitching(false);
      }
    },
    [protocol],
  );

  return (
    <Box
      sx={{
        height: '100vh',
        width: '100vw',
        display: 'flex',
        overflow: 'hidden',
      }}
    >
      <NotebookUI
        serviceManager={serviceManager}
        protocol={protocol}
        isSwitching={isSwitching}
        onProtocolChange={handleProtocolChange}
      />

      {error && (
        <Box
          sx={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            padding: 3,
            backgroundColor: 'danger.subtle',
            color: 'danger.fg',
            borderRadius: 2,
            maxWidth: 300,
          }}
        >
          <strong>Error:</strong> {error}
        </Box>
      )}

      {isReady && (
        <ChatFloating
          key={protocol}
          protocol={protocol}
          endpoint={endpoint}
          title="Notebook AI Agent Runtime"
          description="Hi! I can help you edit notebook cells. Try: 'Add a new code cell', 'Run cell 1', or 'Delete the last cell'"
          defaultOpen={true}
          defaultViewMode="panel"
          position="bottom-right"
          frontendTools={frontendTools}
          useStore={false}
          showModelSelector={true}
          showToolsMenu={true}
          showSkillsMenu={true}
          suggestions={[
            {
              title: 'Add a cell',
              message: 'Insert a random cell to the notebook',
            },
            {
              title: 'Run the first cell',
              message: 'Run the first cell in the notebook',
            },
            {
              title: 'Show cells',
              message:
                'Show the notebook cells content and compute the number of cells',
            },
          ]}
        />
      )}
    </Box>
  );
}

/**
 * Main Agent Runtime notebook example component
 */
interface AgentRuntimeNotebookExampleProps {
  serviceManager?: ServiceManager.IManager;
}

function AgentRuntimeNotebookExample({
  serviceManager,
}: AgentRuntimeNotebookExampleProps): JSX.Element {
  return <NotebookWithChat serviceManager={serviceManager} />;
}

export default AgentRuntimeNotebookExample;
