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
 * @module examples/NotebookAgentExample
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box } from '@datalayer/primer-addons';
import { ServiceManager, Session } from '@jupyterlab/services';
import { Notebook, OnSessionConnection } from '@datalayer/jupyter-react';
import type { IKernelConnection } from '@jupyterlab/services/lib/kernel/kernel';
import { ThemedJupyterProvider } from './utils/themedProvider';

// Agent-runtimes imports
import { ChatFloating } from '../chat';
import { useNotebookTools } from '../tools/adapters/agent-runtimes/notebookHooks';
import { useExampleAgentRuntimesUrl } from './utils/useExampleAgentRuntimesUrl';
import { useExampleAgentRuntime } from './hooks/useExampleAgentRuntime';

// Import Matplotlib notebook
import MatplotlibNotebook from './utils/notebooks/Matplotlib.ipynb.json';

import { DEFAULT_MODEL } from '../specs';

// Fixed notebook ID
const NOTEBOOK_ID = 'agui-notebook-example';

// Use the imported Matplotlib notebook
const NOTEBOOK_CONTENT = MatplotlibNotebook;

const AGENT_ID = 'notebook-agent-runtime-example';

function getJupyterSandboxUrl(
  serviceManager?: ServiceManager.IManager,
): string | undefined {
  const envUrl = import.meta.env.VITE_JUPYTER_SANDBOX_URL;
  if (envUrl) {
    return envUrl;
  }

  const baseUrl = serviceManager?.serverSettings?.baseUrl?.replace(/\/$/, '');
  if (!baseUrl) {
    return undefined;
  }

  if (baseUrl.includes('token=')) {
    return baseUrl;
  }

  const token = serviceManager?.serverSettings?.token;
  if (!token) {
    return baseUrl;
  }

  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}token=${encodeURIComponent(token)}`;
}

/**
 * Notebook UI component (without tool registration)
 */
interface NotebookUIProps {
  serviceManager?: ServiceManager.IManager;
  onSessionConnection?: OnSessionConnection;
}

const NotebookUI = React.memo(function NotebookUI({
  serviceManager,
  onSessionConnection,
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
        <Box as="h1" sx={{ margin: 0 }}>
          Agent Runtime Notebook Example
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
              onSessionConnection={onSessionConnection}
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
  const baseUrl = useExampleAgentRuntimesUrl();
  const jupyterSandboxUrl = useMemo(
    () => getJupyterSandboxUrl(serviceManager),
    [serviceManager],
  );
  const [createRequested, setCreateRequested] = useState(false);
  const [notebookKernel, setNotebookKernel] =
    useState<IKernelConnection | null>(null);

  const { agentId, isReady, status, error, createAgent } =
    useExampleAgentRuntime({
      exampleId: 'NotebookAgentExample',
      agentName: AGENT_ID,
      autoCreateAgent: false,
      agentConfig: {
        name: AGENT_ID,
        description: 'Demo agent for notebook example',
        protocol: 'vercel-ai',
        model: DEFAULT_MODEL,
        systemPrompt:
          'You are a helpful AI assistant that helps users work with Jupyter notebooks. For notebook operations, always use the notebook frontend tools (runCell, readAllCells, readCell, insertCell, updateCell, deleteCells) so actions happen in the live notebook UI. Use executeCode only for temporary inspection code that should not modify notebook cells.',
        enableCodemode: false,
        sandboxVariant: 'jupyter',
        jupyterSandbox: jupyterSandboxUrl,
      },
    });

  useEffect(() => {
    if (!jupyterSandboxUrl || createRequested || agentId) {
      return;
    }
    setCreateRequested(true);
    void createAgent({
      name: AGENT_ID,
      description: 'Demo agent for notebook example',
      protocol: 'vercel-ai',
      model: DEFAULT_MODEL,
      systemPrompt:
        'You are a helpful AI assistant that helps users work with Jupyter notebooks. For notebook operations, always use the notebook frontend tools (runCell, readAllCells, readCell, insertCell, updateCell, deleteCells) so actions happen in the live notebook UI. Use executeCode only for temporary inspection code that should not modify notebook cells.',
      enableCodemode: false,
      sandboxVariant: 'jupyter',
      jupyterSandbox: jupyterSandboxUrl,
    }).catch(() => {
      setCreateRequested(false);
    });
  }, [jupyterSandboxUrl, createRequested, agentId, createAgent]);

  const effectiveReady = isReady || status === 'ready';

  const handleSessionConnection = useCallback(
    (session: Session.ISessionConnection | undefined) => {
      setNotebookKernel(session?.kernel ?? null);
    },
    [],
  );

  const protocolConfig = useMemo(
    () => ({
      type: 'vercel-ai' as const,
      endpoint: `${baseUrl}/api/v1/vercel-ai/${AGENT_ID}`,
      agentId: AGENT_ID,
      enableConfigQuery: true,
      configEndpoint: `${baseUrl}/api/v1/configure`,
    }),
    [baseUrl],
  );

  // Get notebook tools for ChatFloating
  const frontendTools = useNotebookTools(NOTEBOOK_ID);

  return (
    <Box
      sx={{
        height: '100%',
        width: '100%',
        display: 'flex',
        overflow: 'hidden',
      }}
    >
      <NotebookUI
        serviceManager={serviceManager}
        onSessionConnection={handleSessionConnection}
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

      {effectiveReady && (
        <ChatFloating
          protocol={protocolConfig}
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
          panelProps={{
            kernel: notebookKernel,
          }}
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
            {
              title: 'Analyze Titanic',
              message:
                'Analyze the Titanic dataset and provide insights about the passengers and survival rates',
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
