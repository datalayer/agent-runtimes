/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AgentNotebook
 *
 * Standalone notebook + chat interface served at /static/agent-notebook.html.
 * Connects to the agent-runtimes AG-UI endpoint and provides a Jupyter
 * notebook alongside the Chat component with notebook tools registered.
 *
 * The page is opened by codeai with a URL like:
 *   http://127.0.0.1:<port>/static/agent-notebook.html?agentId=<id>
 *
 * Query parameters:
 *   - agentId: the agent identifier (required, set by codeai)
 *   - jupyterBaseUrl: base URL for the Jupyter server (optional, falls back to jupyter-config-data)
 *   - jupyterToken: token for the Jupyter server (optional, falls back to jupyter-config-data)
 */

import React, { useEffect, useState } from 'react';
import { Text, Spinner } from '@primer/react';
import { AlertIcon } from '@primer/octicons-react';
import { Box, setupPrimerPortals } from '@datalayer/primer-addons';
import { DatalayerThemeProvider } from '@datalayer/core';
import {
  Notebook,
  JupyterReactTheme,
  loadJupyterConfig,
  createServerSettings,
  getJupyterServerUrl,
  getJupyterServerToken,
  setJupyterServerUrl,
  setJupyterServerToken,
} from '@datalayer/jupyter-react';
import { ServiceManager } from '@jupyterlab/services';
import { Chat } from './components/chat';
import { useNotebookTools } from './tools/adapters/agent-runtimes/notebookHooks';
import { DEFAULT_MODEL } from './specs';

import MatplotlibNotebook from './examples/stores/notebooks/Matplotlib.ipynb.json';

import '../style/primer-primitives.css';

setupPrimerPortals();

const BASE_URL = window.location.origin;
const NOTEBOOK_ID = 'agent-notebook';

function getQueryParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

function getAgentId(): string {
  return getQueryParam('agentId') || 'default';
}

/**
 * Initialise Jupyter configuration.
 *
 * Priority:
 *   1. Query parameters (jupyterBaseUrl / jupyterToken)
 *   2. <script id="jupyter-config-data"> block in the HTML page
 */
function initJupyterConfig() {
  // Load embedded config first
  loadJupyterConfig();

  // Override with query parameters when supplied by codeai
  const qBaseUrl = getQueryParam('jupyterBaseUrl');
  const qToken = getQueryParam('jupyterToken');

  if (qBaseUrl) setJupyterServerUrl(qBaseUrl);
  if (qToken) setJupyterServerToken(qToken);

  // Also check for jupyter-config-data embedded in the page (may contain
  // values injected at build/serve time)
  const el = document.getElementById('jupyter-config-data');
  if (el?.textContent) {
    try {
      const cfg = JSON.parse(el.textContent);
      if (!qBaseUrl && cfg.baseUrl) setJupyterServerUrl(cfg.baseUrl);
      if (!qToken && cfg.token) setJupyterServerToken(cfg.token);
    } catch {
      // ignore
    }
  }
}

// ─── Notebook panel ─────────────────────────────────────────────────────────

interface NotebookPanelProps {
  serviceManager: ServiceManager.IManager;
}

const NotebookPanel: React.FC<NotebookPanelProps> = ({ serviceManager }) => (
  <Box
    sx={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      borderRight: '1px solid',
      borderColor: 'border.default',
    }}
  >
    <JupyterReactTheme>
      <Box sx={{ height: '100vh' }}>
        <Notebook
          nbformat={MatplotlibNotebook as any}
          id={NOTEBOOK_ID}
          serviceManager={serviceManager}
          height="100vh"
          cellSidebarMargin={120}
          startDefaultKernel={true}
        />
      </Box>
    </JupyterReactTheme>
  </Box>
);

// ─── Chat panel with notebook tools ─────────────────────────────────────────

interface ChatPanelProps {
  agentId: string;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ agentId }) => {
  // Register notebook tools so the agent can manipulate cells
  const notebookTools = useNotebookTools(NOTEBOOK_ID);

  return (
    <Box
      sx={{
        width: '420px',
        minWidth: '320px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <Chat
        transport="ag-ui"
        baseUrl={BASE_URL}
        agentId={agentId}
        title="Agent Notebook"
        placeholder="Ask about the notebook..."
        description="Chat with the agent to manipulate the notebook"
        showHeader={true}
        height="100vh"
        showModelSelector={true}
        showToolsMenu={true}
        showSkillsMenu={true}
        showTokenUsage={true}
        showInformation={true}
        frontendTools={notebookTools}
        autoFocus
        runtimeId={agentId}
        historyEndpoint={`${BASE_URL}/api/v1/history`}
        suggestions={[
          {
            title: 'Add a cell',
            message: 'Insert a new code cell into the notebook',
          },
          {
            title: 'Run first cell',
            message: 'Run the first cell in the notebook',
          },
          {
            title: 'Show cells',
            message:
              'Show the notebook cells content and compute the number of cells',
          },
        ]}
        submitOnSuggestionClick
      />
    </Box>
  );
};

// ─── Main component ─────────────────────────────────────────────────────────

export const AgentNotebook: React.FC = () => {
  const [agentId] = useState(getAgentId);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serviceManager, setServiceManager] =
    useState<ServiceManager.IManager | null>(null);

  // Verify the agent exists AND initialise the Jupyter service manager
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        // 1. Ensure agent exists — create if missing
        const getResp = await fetch(
          `${BASE_URL}/api/v1/agents/${encodeURIComponent(agentId)}`,
        );
        if (!getResp.ok) {
          const createResp = await fetch(`${BASE_URL}/api/v1/agents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: agentId,
              description: 'Agent created by Agent Notebook page',
              agent_library: 'pydantic-ai',
              transport: 'ag-ui',
              model: DEFAULT_MODEL,
              system_prompt:
                'You are a helpful AI assistant that helps users work with Jupyter notebooks. You can help with code, explanations, and data analysis.',
            }),
          });
          if (!createResp.ok && createResp.status !== 400) {
            const d = await createResp.json().catch(() => ({}));
            throw new Error(
              d.detail || `Failed to create agent: ${createResp.status}`,
            );
          }
        }

        // 2. Initialise Jupyter
        initJupyterConfig();

        const serverSettings = createServerSettings(
          getJupyterServerUrl(),
          getJupyterServerToken(),
        );
        const manager = new ServiceManager({ serverSettings });
        await manager.ready;

        if (!cancelled) {
          setServiceManager(manager);
          setIsReady(true);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to initialise');
        }
      }
    };

    init();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  // Loading
  if (!isReady && !error) {
    return (
      <DatalayerThemeProvider>
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
          <Text sx={{ color: 'fg.muted' }}>Connecting to agent {agentId}…</Text>
        </Box>
      </DatalayerThemeProvider>
    );
  }

  // Error
  if (error) {
    return (
      <DatalayerThemeProvider>
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
          <AlertIcon size={48} />
          <Text sx={{ color: 'danger.fg', fontSize: 2 }}>
            Failed to connect
          </Text>
          <Text sx={{ color: 'fg.muted', fontSize: 1 }}>{error}</Text>
        </Box>
      </DatalayerThemeProvider>
    );
  }

  // Ready — notebook + chat side-by-side
  return (
    <DatalayerThemeProvider>
      <Box
        sx={{
          display: 'flex',
          height: '100vh',
          width: '100vw',
          overflow: 'hidden',
          bg: 'canvas.default',
        }}
      >
        {serviceManager && <NotebookPanel serviceManager={serviceManager} />}
        <ChatPanel agentId={agentId} />
      </Box>
    </DatalayerThemeProvider>
  );
};

export default AgentNotebook;
