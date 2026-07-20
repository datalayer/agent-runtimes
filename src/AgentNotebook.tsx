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
import {
  AppearanceControlsWithStore,
  Box,
  createThemeStore,
  DatalayerThemeProvider,
  setupPrimerPortals,
  themeConfigs,
  useSystemColorMode,
} from '@datalayer/primer-addons';
import {
  Notebook,
  JupyterReactTheme,
  notebookStore,
  disposeServiceManager,
  loadJupyterConfig,
  getJupyterServerUrl,
  getJupyterServerToken,
  setJupyterServerUrl,
  setJupyterServerToken,
} from '@datalayer/jupyter-react';
import { ServiceManager, ServerConnection } from '@jupyterlab/services';
import type { IKernelConnection } from '@jupyterlab/services/lib/kernel/kernel';
import { Chat } from './chat';
import { useNotebookTools } from './tools/adapters/agent-runtimes/notebookHooks';
import { DEFAULT_MODEL } from './specs';

import EmptyNotebook from './examples/utils/notebooks/Empty.ipynb.json';

import '../style/primer-primitives.css';

setupPrimerPortals();

const BASE_URL = window.location.origin;
const NOTEBOOK_ID = 'agent-notebook';
const NOTEBOOK_THEME_STORAGE_KEY = 'agent-runtimes-agent-notebook-theme';

// Fixed height (px) of the top appearance bar. The notebook fills the
// remaining viewport height via calc(100vh - TOP_BAR_HEIGHT) so it does not
// depend on a `height: 100%` chain (JupyterReactTheme renders an intermediate
// auto-height div that would collapse the notebook to 0).
const TOP_BAR_HEIGHT = 49;

const useAgentNotebookThemeStore = createThemeStore(
  NOTEBOOK_THEME_STORAGE_KEY,
  {
    colorMode: 'auto',
    theme: 'earth',
  },
);

function getQueryParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

function getAgentId(): string {
  return getQueryParam('agentId') || 'default';
}

function getKernelId(): string | undefined {
  const kernelId = getQueryParam('kernelId') || getQueryParam('kernel_id');
  return kernelId || undefined;
}

interface ResolvedJupyterConfig {
  baseUrl: string;
  token: string;
}

async function fetchStartupKernelId(): Promise<string | undefined> {
  try {
    const resp = await fetch(`${BASE_URL}/health/startup`);
    if (!resp.ok) {
      return undefined;
    }
    const payload = await resp.json();
    const sandbox = payload?.sandbox;
    if (sandbox?.variant !== 'jupyter') {
      return undefined;
    }
    const kernelId = sandbox?.kernel_id;
    return typeof kernelId === 'string' && kernelId.length > 0
      ? kernelId
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Initialise Jupyter configuration.
 *
 * Priority:
 *   1. Query parameters (jupyterBaseUrl / jupyterToken)
 *   2. <script id="jupyter-config-data"> block in the HTML page
 */
function initJupyterConfig(): ResolvedJupyterConfig {
  // Load embedded config first
  loadJupyterConfig();

  // Override with query parameters when supplied by codeai
  const qBaseUrl = getQueryParam('jupyterBaseUrl');
  const qToken = getQueryParam('jupyterToken') || getQueryParam('token');

  if (qBaseUrl) setJupyterServerUrl(qBaseUrl);
  if (qToken) setJupyterServerToken(qToken);

  let resolvedBaseUrl = qBaseUrl || getJupyterServerUrl();
  let resolvedToken = qToken || getJupyterServerToken();

  // Also check for jupyter-config-data embedded in the page (may contain
  // values injected at build/serve time)
  const el = document.getElementById('jupyter-config-data');
  if (el?.textContent) {
    try {
      const cfg = JSON.parse(el.textContent);
      if (!qBaseUrl && cfg.baseUrl) {
        setJupyterServerUrl(cfg.baseUrl);
        resolvedBaseUrl = cfg.baseUrl;
      }
      if (!qToken && cfg.token) {
        setJupyterServerToken(cfg.token);
        resolvedToken = cfg.token;
      }
    } catch {
      // ignore
    }
  }

  return {
    baseUrl: resolvedBaseUrl,
    token: resolvedToken,
  };
}

function buildServerSettings(
  baseUrl: string,
  token: string,
): ServerConnection.ISettings {
  const wsUrl = baseUrl.replace(/^http/, 'ws');
  const authenticatedFetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (!token) {
      return fetch(input, init);
    }
    const headers = new Headers(init?.headers || undefined);
    headers.set('Authorization', `token ${token}`);
    return fetch(input, { ...init, headers });
  };

  return ServerConnection.makeSettings({
    baseUrl,
    wsUrl,
    token,
    appendToken: !!token,
    fetch: authenticatedFetch,
  });
}

// ─── Notebook kernel tracking ───────────────────────────────────────────────

/**
 * Track the live kernel connection of the notebook running on the sandbox.
 *
 * The kernel connection is created asynchronously by the `<Notebook>` adapter
 * after it mounts (and can change on restart), so we read it from the notebook
 * store, polling and subscribing to store mutations. The resolved connection is
 * fed to the chat header's `<KernelIndicator>` so it reflects the sandbox.
 */
function useNotebookKernel(
  notebookId: string,
  active: boolean,
): IKernelConnection | null {
  const [kernel, setKernel] = useState<IKernelConnection | null>(null);
  useEffect(() => {
    if (!active) {
      setKernel(null);
      return;
    }
    const readKernel = (): IKernelConnection | null => {
      const notebook = notebookStore.getState().selectNotebook(notebookId);
      const adapter = notebook?.adapter as
        { kernel?: IKernelConnection | null } | undefined;
      return adapter?.kernel ?? null;
    };
    const sync = () => {
      const next = readKernel();
      setKernel(prev => (prev?.id === next?.id ? prev : next));
    };
    sync();
    const intervalId = window.setInterval(sync, 750);
    const unsubscribe = notebookStore.subscribe(sync);
    return () => {
      window.clearInterval(intervalId);
      unsubscribe();
    };
  }, [notebookId, active]);
  return kernel;
}

// ─── Notebook panel ─────────────────────────────────────────────────────────

interface NotebookPanelProps {
  serviceManager: ServiceManager.IManager;
  kernelId?: string;
  colormode: 'light' | 'dark';
  backgroundColor?: string;
}

const NotebookPanel: React.FC<NotebookPanelProps> = ({
  serviceManager,
  kernelId,
  colormode,
  backgroundColor,
}) => (
  <Box
    sx={{
      flex: 1,
      minWidth: '360px',
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      borderRight: '1px solid',
      borderColor: 'border.default',
    }}
  >
    <JupyterReactTheme colormode={colormode} backgroundColor={backgroundColor}>
      <Notebook
        nbformat={EmptyNotebook as any}
        id={NOTEBOOK_ID}
        serviceManager={serviceManager}
        kernelId={kernelId}
        height={`calc(100vh - ${TOP_BAR_HEIGHT}px)`}
        cellSidebarMargin={120}
        startDefaultKernel={!kernelId}
      />
    </JupyterReactTheme>
  </Box>
);

// ─── Chat panel with notebook tools ─────────────────────────────────────────

interface ChatPanelProps {
  agentId: string;
  kernel?: IKernelConnection | null;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ agentId, kernel }) => {
  // Register notebook tools so the agent can manipulate cells
  const notebookTools = useNotebookTools(NOTEBOOK_ID);

  return (
    <Box
      sx={{
        width: '420px',
        minWidth: '320px',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <Chat
        protocol="ag-ui"
        baseUrl={BASE_URL}
        agentId={agentId}
        title="Agent Notebook"
        placeholder="Ask about the notebook..."
        description="Chat with the agent to manipulate the notebook"
        showHeader={true}
        height="100%"
        showModelSelector={true}
        showToolsMenu={true}
        showSkillsMenu={true}
        showTokenUsage={true}
        showInformation={true}
        disableInternalJupyterTheme={true}
        frontendTools={notebookTools}
        autoFocus
        runtimeId={agentId}
        kernel={kernel}
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
  const [kernelId, setKernelId] = useState<string | undefined>(getKernelId);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serviceManager, setServiceManager] =
    useState<ServiceManager.IManager | null>(null);
  const { colorMode, theme } = useAgentNotebookThemeStore();
  const themeConfig = themeConfigs[theme];
  const systemMode = useSystemColorMode();
  const resolvedMode = colorMode === 'auto' ? systemMode : colorMode;
  const modeStyles =
    resolvedMode === 'dark'
      ? themeConfig.themeStyles.dark
      : themeConfig.themeStyles.light;
  const themeBackground =
    (modeStyles as Record<string, string>).backgroundColor ?? '';

  // Live kernel connection from the notebook running on the sandbox, wired to
  // the chat header's kernel indicator.
  const notebookKernel = useNotebookKernel(
    NOTEBOOK_ID,
    Boolean(serviceManager),
  );

  // Verify the agent exists AND initialise the Jupyter service manager
  useEffect(() => {
    let cancelled = false;
    let managerForCleanup: ServiceManager.IManager | null = null;

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
        const jupyterConfig = initJupyterConfig();
        const serverSettings = buildServerSettings(
          jupyterConfig.baseUrl,
          jupyterConfig.token,
        );
        const manager = new ServiceManager({ serverSettings });
        managerForCleanup = manager;
        await manager.ready;

        if (!cancelled) {
          setServiceManager(manager);
          setIsReady(true);
        } else {
          disposeServiceManager(manager);
          managerForCleanup = null;
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
      if (managerForCleanup) {
        disposeServiceManager(managerForCleanup);
        managerForCleanup = null;
      }
    };
  }, [agentId]);

  // If kernelId is not provided via URL, reuse the startup sandbox kernel when
  // available so notebook/editor and agent runtime share the same execution context.
  useEffect(() => {
    if (kernelId) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const startupKernelId = await fetchStartupKernelId();
      if (!cancelled && startupKernelId) {
        setKernelId(startupKernelId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kernelId]);

  // Loading
  if (!isReady && !error) {
    return (
      <DatalayerThemeProvider
        colorMode={colorMode}
        theme={themeConfig.primerTheme}
        themeStyles={themeConfig.themeStyles}
      >
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
      <DatalayerThemeProvider
        colorMode={colorMode}
        theme={themeConfig.primerTheme}
        themeStyles={themeConfig.themeStyles}
      >
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
    <DatalayerThemeProvider
      colorMode={colorMode}
      theme={themeConfig.primerTheme}
      themeStyles={themeConfig.themeStyles}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          width: '100vw',
          overflow: 'hidden',
          bg: 'canvas.default',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            px: 3,
            height: `${TOP_BAR_HEIGHT}px`,
            boxSizing: 'border-box',
            borderBottom: '1px solid',
            borderColor: 'border.default',
            flexShrink: 0,
          }}
        >
          <AppearanceControlsWithStore useStore={useAgentNotebookThemeStore} />
        </Box>
        <Box
          sx={{
            display: 'flex',
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {serviceManager && (
            <NotebookPanel
              serviceManager={serviceManager}
              kernelId={kernelId}
              colormode={resolvedMode}
              backgroundColor={themeBackground}
            />
          )}
          <ChatPanel agentId={agentId} kernel={notebookKernel} />
        </Box>
      </Box>
    </DatalayerThemeProvider>
  );
};

export default AgentNotebook;
