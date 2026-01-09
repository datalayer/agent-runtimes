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
 * @module examples/ChatJupyterNotebookExample
 */

import { useMemo } from 'react';
import { Box } from '@datalayer/primer-addons';
import { ServiceManager } from '@jupyterlab/services';
import {
  Notebook,
  JupyterReactTheme,
  useJupyter,
} from '@datalayer/jupyter-react';

// Import Chat components
import {
  ChatSidebar,
  type ProtocolConfig,
  type FrontendToolDefinition,
} from '../components/chat';

// Import agent-runtimes notebook tools
import { useNotebookTools } from '../tools/adapters/agent-runtimes/notebookHooks';

// Import sample notebook
import MatplotlibNotebook from './stores/notebooks/Matplotlib.ipynb.json';

// Fixed notebook ID
const NOTEBOOK_ID = 'chat-notebook-example';

// Use the imported Matplotlib notebook
const NOTEBOOK_CONTENT = MatplotlibNotebook;

// Default configuration
const DEFAULT_BASE_URL =
  import.meta.env.VITE_BASE_URL || 'http://localhost:8765';
const DEFAULT_AGENT_ID = import.meta.env.VITE_AGENT_ID || 'agentic_chat';

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
  // Get notebook tools for ChatSidebar
  const tools = useNotebookTools(NOTEBOOK_ID);

  // Build AG-UI protocol config
  const protocolConfig = useMemo((): ProtocolConfig => {
    return {
      type: 'ag-ui',
      endpoint: `${DEFAULT_BASE_URL}/api/v1/examples/${DEFAULT_AGENT_ID}/`,
      agentId: DEFAULT_AGENT_ID,
    };
  }, []);

  return (
    <>
      <Box
        sx={{
          height: '100vh',
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
              bg: 'canvas.subtle',
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
        <ChatSidebar
          title="AI Assistant"
          position="right"
          width={400}
          showNewChatButton={true}
          showClearButton={true}
          showSettingsButton={true}
          defaultOpen={true}
          panelProps={{
            protocol: protocolConfig,
            frontendTools: tools as unknown as FrontendToolDefinition[],
            useStore: true,
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
      </Box>
    </>
  );
}

/**
 * Main example component with Simple wrapper
 */
export function AgentRuntimeNotebookSidebarExample() {
  return (
    <JupyterReactTheme>
      <SimpleWrapper />
    </JupyterReactTheme>
  );
}

function SimpleWrapper() {
  const { serviceManager } = useJupyter();
  return <AgentRuntimeNotebookExampleInner serviceManager={serviceManager} />;
}

export default AgentRuntimeNotebookSidebarExample;
