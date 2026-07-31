/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Agent Runtime Notebook Example - Next generation chat with Jupyter Notebook.
 *
 * This example demonstrates using the chat component with:
 * - Jupyter Notebook integration
 * - Frontend tool execution for notebook operations
 * - AG-UI protocol support
 * - HITL (Human-in-the-loop) tool approval
 *
 * To run this example:
 * 1. Start the agent-runtimes server: `npm run start:ag-ui`
 * 2. Create a .env file with VITE_BASE_URL if not using defaults
 *
 * @module examples/NotebookAgentSidebarExample
 */

import { useEffect, useMemo, useState } from 'react';
import { Box } from '@datalayer/primer-addons';
import { ServiceManager } from '@jupyterlab/services';
import { Notebook, useJupyter } from '@datalayer/jupyter-react';
import { useNotebookTools } from '../tools/adapters/agent-runtimes/notebookHooks';
import { ThemedJupyterProvider } from './utils/themedProvider';
import { ChatSidebar } from '../chat';
import type { ProtocolConfig } from '../types';
import { DEFAULT_MODEL } from '../specs';
import { useExampleAgentRuntimesUrl } from './utils/useExampleAgentRuntimesUrl';
import { useExampleAgentRuntime } from './hooks/useExampleAgentRuntime';

import MatplotlibNotebook from './utils/notebooks/Matplotlib.ipynb.json';

// Fixed notebook ID
const NOTEBOOK_ID = 'chat-notebook-example';

// Use the imported Matplotlib notebook
const NOTEBOOK_CONTENT = MatplotlibNotebook;

// Default configuration
const DEFAULT_AGENT_ID =
  import.meta.env.VITE_AGENT_ID || 'notebook-sidebar-agent-runtime-example';

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
 * Notebook UI component
 */
interface NotebookUIProps {
  serviceManager?: ServiceManager.IManager;
}

function NotebookUI({ serviceManager }: NotebookUIProps) {
  if (!serviceManager) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'fg.muted',
        }}
      >
        Loading Simple services...
      </Box>
    );
  }

  return (
    <Notebook
      nbformat={NOTEBOOK_CONTENT}
      id={NOTEBOOK_ID}
      serviceManager={serviceManager}
      height="100%"
      cellSidebarMargin={120}
      startDefaultKernel={true}
    />
  );
}

/**
 * Agent Runtime Notebook Sidebar Example with Simple integration
 */
interface ChatJupyterNotebookExampleProps {
  serviceManager?: ServiceManager.IManager;
}

export function AgentRuntimeNotebookExampleInner({
  serviceManager,
}: ChatJupyterNotebookExampleProps) {
  const baseUrl = useExampleAgentRuntimesUrl();
  const vercelAiEndpoint = `${baseUrl}/api/v1/vercel-ai/${DEFAULT_AGENT_ID}`;
  const [createRequested, setCreateRequested] = useState(false);
  const jupyterSandboxUrl = useMemo(
    () => getJupyterSandboxUrl(serviceManager),
    [serviceManager],
  );

  const { agentId, isReady, status, error, createAgent } =
    useExampleAgentRuntime({
      exampleId: 'NotebookAgentSidebarExample',
      agentName: DEFAULT_AGENT_ID,
      autoCreateAgent: false,
      agentConfig: {
        name: DEFAULT_AGENT_ID,
        description: 'Demo agent for notebook sidebar example',
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
      name: DEFAULT_AGENT_ID,
      description: 'Demo agent for notebook sidebar example',
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

  // Get notebook tools for ChatSidebar
  const tools = useNotebookTools(NOTEBOOK_ID);

  // Build Vercel AI protocol config
  const protocolConfig = useMemo((): ProtocolConfig => {
    return {
      type: 'vercel-ai',
      endpoint: vercelAiEndpoint,
      agentId: DEFAULT_AGENT_ID,
      enableConfigQuery: true,
      configEndpoint: `${baseUrl}/api/v1/configure`,
    };
  }, [baseUrl, vercelAiEndpoint]);

  return (
    <>
      <Box
        sx={{
          height: 'calc(100vh - 70px)',
          width: '100vw',
          display: 'flex',
          overflow: 'hidden',
        }}
      >
        {/* Main content area */}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <Box
            sx={{
              p: 3,
              borderBottom: '1px solid',
              borderColor: 'border.default',
              bg: 'canvas.default',
            }}
          >
            <h1 style={{ margin: 0, fontSize: '1.5rem' }}>
              Agent Runtime Notebook Sidebar Example
            </h1>
            <p style={{ margin: '8px 0 0', color: 'var(--fgColor-muted)' }}>
              Next generation chat with Jupyter Notebook integration
            </p>
          </Box>

          {/* Notebook */}
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              overflow: 'hidden',
              bg: 'canvas.default',
              p: 3,
            }}
          >
            <Box
              sx={{
                flex: 1,
                border: '1px solid',
                borderColor: 'border.default',
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              <NotebookUI serviceManager={serviceManager} />
            </Box>
          </Box>
        </Box>

        {/* Chat sidebar */}
        {effectiveReady && (
          <ChatSidebar
            title="AI Assistant"
            protocol={protocolConfig}
            position="right"
            width={400}
            showNewChatButton={true}
            showClearButton={true}
            showSettingsButton={true}
            defaultOpen={true}
            panelProps={{
              protocol: protocolConfig,
              frontendTools: tools,
              useStore: false,
              showModelSelector: true,
              showToolsMenu: true,
              showSkillsMenu: true,
              suggestions: [
                {
                  title: '📓 Explain notebook',
                  message: 'Can you explain what this notebook does?',
                },
                {
                  title: '🔧 Fix errors',
                  message: 'Can you help me fix any errors in the notebook?',
                },
                {
                  title: '📊 Add visualization',
                  message: 'Can you add a visualization to the notebook?',
                },
                {
                  title: '✨ Improve code',
                  message: 'Can you suggest improvements for the code?',
                },
              ],
            }}
          />
        )}

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
              maxWidth: 320,
              zIndex: 999,
            }}
          >
            <strong>Error:</strong> {error}
          </Box>
        )}
      </Box>
    </>
  );
}

/**
 * Main example component with Simple wrapper
 */
export function AgentRuntimeNotebookAgentSidebarExample() {
  return (
    <ThemedJupyterProvider>
      <SimpleWrapper />
    </ThemedJupyterProvider>
  );
}

function SimpleWrapper() {
  const { serviceManager } = useJupyter();
  return <AgentRuntimeNotebookExampleInner serviceManager={serviceManager} />;
}

export default AgentRuntimeNotebookAgentSidebarExample;
