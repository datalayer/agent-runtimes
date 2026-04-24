/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/// <reference types="vite/client" />

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  loadJupyterConfig,
  JupyterReactTheme,
  createServerSettings,
  setJupyterServerUrl,
  setJupyterServerToken,
  getJupyterServerUrl,
  getJupyterServerToken,
} from '@datalayer/jupyter-react';
import { INotebookContent } from '@jupyterlab/nbformat';
import { ServiceManager } from '@jupyterlab/services';
import {
  DatalayerThemeProvider,
  DatalayerLogoText,
  getLogoColors,
  themeConfigs,
  Box,
} from '@datalayer/primer-addons';
import { HomeIcon, SignInIcon, SignOutIcon } from '@primer/octicons-react';
import { Button } from '@primer/react';
import { AppearanceControlsWithStore } from '@datalayer/primer-addons/lib/components/appearance';
import {
  coreStore,
  iamStore,
  createDatalayerServiceManager,
} from '@datalayer/core';
import { SignInSimple } from '@datalayer/core/lib/views/iam';
import { UserBadge } from '@datalayer/core/lib/views/profile';
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import {
  agentRuntimeStore,
  useChatStore,
  useConversationStore,
} from '../stores';
import { OAuthCallback } from '../identity';
import {
  EXAMPLES,
  getExampleEntries,
  type ExampleEntry,
} from './example-selector';
import { useExampleThemeStore } from './utils/themeStore';
import { ExampleWrapper } from './components/ExampleWrapper';

import nbformatExample from './utils/notebooks/NotebookExample1.ipynb.json';

import '../../style/primer-primitives.css';

declare global {
  interface Window {
    __agentRuntimesExamplesRoot?: ReturnType<typeof createRoot>;
  }
}

// Load configurations from DOM
const loadConfigurations = () => {
  // Load Datalayer configuration
  const datalayerConfigElement = document.getElementById(
    'datalayer-config-data',
  );
  if (datalayerConfigElement?.textContent) {
    try {
      const datalayerConfig = JSON.parse(datalayerConfigElement.textContent);

      // If token is empty or still has placeholder, use environment variable from .env
      if (
        !datalayerConfig.token ||
        datalayerConfig.token.startsWith('%VITE_')
      ) {
        const envToken = import.meta.env.VITE_DATALAYER_API_KEY;
        if (envToken) {
          datalayerConfig.token = envToken;
        }
      }

      if (datalayerConfig.runUrl) {
        coreStore.getState().setConfiguration(datalayerConfig);

        // Also set the token in the IAM store for API authentication
        if (datalayerConfig.token) {
          // Use the setLogin method to set the token in IAM store
          // For now, we'll just set a minimal user object since we don't have full user data
          iamStore.getState().setLogin(
            {
              id: 'example-id',
              handle: 'example-user',
              email: 'example@datalayer.com',
              firstName: 'Example',
              lastName: 'User',
              initials: 'EU',
              displayName: 'Example User',
              avatarUrl: '',
              roles: [],
              setRoles: () => {},
              iamProviders: [],
              settings: {},
              unsubscribedFromOutbounds: false,
              onboarding: {
                clients: {
                  Platform: 0,
                  JupyterLab: 0,
                  CLI: 0,
                  VSCode: 0,
                },
                position: 'top' as const,
                tours: {},
              },
              events: [],
            },
            datalayerConfig.token,
          );
        }
      }
    } catch (e) {
      console.error('Failed to parse Datalayer config:', e);
    }
  }

  // Load Simple configuration
  loadJupyterConfig();

  // Also set Simple server URL and token if available in jupyter-config-data
  const jupyterConfigElement = document.getElementById('jupyter-config-data');
  if (jupyterConfigElement?.textContent) {
    try {
      const jupyterConfig = JSON.parse(jupyterConfigElement.textContent);
      if (jupyterConfig.baseUrl) {
        setJupyterServerUrl(jupyterConfig.baseUrl);
      }
      if (jupyterConfig.token) {
        setJupyterServerToken(jupyterConfig.token);
      }
    } catch (e) {
      console.error('Failed to parse Simple config:', e);
    }
  }
};

const getExampleEntriesList = () => getExampleEntries();

const getInitialSearchQuery = (): string => {
  const params = new URLSearchParams(window.location.search);
  return (params.get('q') || '').trim();
};

// Check if we're on the notebook-only route
const isNotebookOnlyRoute = () => {
  const path = window.location.pathname;
  const isNotebookRoute = path === '/datalayer/notebook';
  return isNotebookRoute;
};

// Check if we're handling an OAuth callback (code and state in URL params)
const isOAuthCallback = () => {
  const params = new URLSearchParams(window.location.search);
  const hasCode = params.has('code');
  const hasState = params.has('state');
  const hasError = params.has('error');
  return (hasCode && hasState) || hasError;
};

// Get the default example name from localStorage
const getDefaultExampleName = (): string => {
  const stored = localStorage.getItem('selectedExample');
  if (stored && EXAMPLES[stored]) {
    return stored;
  }
  return 'NotebookExample';
};

// Notebook-only component for iframe display - renders ONLY the notebook without any UI chrome
const NotebookOnlyApp: React.FC = () => {
  const [serviceManager, setServiceManager] =
    useState<ServiceManager.IManager | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nbformat] = useState(nbformatExample as INotebookContent);
  const [NotebookComponent, setNotebookComponent] =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useState<React.ComponentType<any> | null>(null);
  const [collaborationProvider, setCollaborationProvider] =
    useState<unknown>(null);

  useEffect(() => {
    loadConfigurations();

    const initializeApp = async () => {
      try {
        const { configuration } = coreStore.getState();

        // Always try to create collaboration provider if we have token and runUrl
        if (configuration?.token && configuration?.runUrl) {
          try {
            const { DatalayerCollaborationProvider } =
              await import('@datalayer/core/lib/collaboration/DatalayerCollaborationProvider');
            const provider = new DatalayerCollaborationProvider({
              runUrl: configuration.runUrl,
              token: configuration.token,
            });
            setCollaborationProvider(provider);
          } catch (error) {
            console.error(
              'Failed to create DatalayerCollaborationProvider:',
              error,
            );
          }
        }

        // Create service manager
        if (configuration?.token) {
          try {
            const manager = await createDatalayerServiceManager(
              configuration.cpuEnvironment || 'python-3.11',
              configuration.credits || 100,
            );
            await manager.ready;
            setServiceManager(manager);
          } catch (error) {
            console.error('Failed to create DatalayerServiceManager:', error);
            const serverSettings = createServerSettings(
              getJupyterServerUrl(),
              getJupyterServerToken(),
            );
            const manager = new ServiceManager({ serverSettings });
            await manager.ready;
            setServiceManager(manager);
          }
        } else {
          const serverSettings = createServerSettings(
            getJupyterServerUrl(),
            getJupyterServerToken(),
          );
          const manager = new ServiceManager({ serverSettings });
          await manager.ready;
          setServiceManager(manager);
        }

        setLoading(false);
      } catch (e) {
        console.error('Failed to initialize app:', e);
        setError(`Failed to initialize app: ${e}`);
        setLoading(false);
      }
    };

    initializeApp();
  }, []);

  useEffect(() => {
    // Dynamically import Notebook component
    import('@datalayer/jupyter-react').then(module => {
      setNotebookComponent(() => module.Notebook);
    });
  }, []);

  if (loading || !NotebookComponent) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h2>Loading Notebook...</h2>
        <p>Please wait...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '20px', color: 'red' }}>
        <h2>Error Loading Notebook</h2>
        <pre>{error}</pre>
      </div>
    );
  }

  if (!serviceManager) {
    return null;
  }

  const NOTEBOOK_ID = '01JZQRQ35GG871QQCZW9TB1A8J';

  return (
    <JupyterReactTheme>
      <div style={{ width: '100vw', height: '100vh' }}>
        <NotebookComponent
          id={NOTEBOOK_ID}
          height="100vh"
          nbformat={nbformat}
          readonly={false}
          serviceManager={serviceManager}
          startDefaultKernel={true}
          collaborationProvider={collaborationProvider}
        />
      </div>
    </JupyterReactTheme>
  );
};

// Main App component that loads and renders the selected example
export const ExampleApp: React.FC = () => {
  const [ExampleComponent, setExampleComponent] = useState<React.ComponentType<
    Record<string, unknown>
  > | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serviceManager, setServiceManager] =
    useState<ServiceManager.IManager | null>(null);
  const [selectedExample, setSelectedExample] = useState<string>(
    getDefaultExampleName(),
  );
  const [searchQuery, setSearchQuery] = useState(getInitialSearchQuery());
  const [isChangingExample, setIsChangingExample] = useState(false);

  const filteredExampleEntries = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase();
    const all = getExampleEntriesList();
    if (!normalized) {
      return all;
    }
    return all.filter(entry => {
      const haystack = [
        entry.id,
        entry.title,
        entry.description,
        entry.tags.join(' '),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [searchQuery]);

  const loadExample = async (
    exampleName: string,
    _manager: ServiceManager.IManager,
  ) => {
    try {
      setIsChangingExample(true);
      setError(null);

      const exampleLoader = EXAMPLES[exampleName];
      if (!exampleLoader) {
        throw new Error(`Example "${exampleName}" not found`);
      }

      const module = await exampleLoader();
      setExampleComponent(() => module.default);
      setIsChangingExample(false);
    } catch (e) {
      console.error('Failed to load example:', e);
      setError(`Failed to load example: ${e}`);
      setIsChangingExample(false);
    }
  };

  useEffect(() => {
    // Load configurations
    loadConfigurations();

    // Create service manager and load example - must be sequential
    const initializeApp = async () => {
      try {
        const { configuration } = coreStore.getState();

        // Try to use DatalayerServiceManager if we have a token
        if (configuration?.token) {
          try {
            const manager = await createDatalayerServiceManager(
              configuration.cpuEnvironment || 'python-3.11',
              configuration.credits || 100,
            );
            await manager.ready;
            setServiceManager(manager);

            // Load initial example
            await loadExample(selectedExample, manager);
          } catch (error) {
            console.error('Failed to create DatalayerServiceManager:', error);
            // Fall back to regular ServiceManager
            const serverSettings = createServerSettings(
              getJupyterServerUrl(),
              getJupyterServerToken(),
            );
            const manager = new ServiceManager({ serverSettings });
            await manager.ready;
            setServiceManager(manager);

            // Load initial example
            await loadExample(selectedExample, manager);
          }
        } else {
          // Use regular ServiceManager (no Datalayer token)
          const serverSettings = createServerSettings(
            getJupyterServerUrl(),
            getJupyterServerToken(),
          );
          const manager = new ServiceManager({ serverSettings });
          await manager.ready;
          setServiceManager(manager);

          // Load initial example
          await loadExample(selectedExample, manager);
        }

        setLoading(false);
      } catch (e) {
        console.error('Failed to initialize app:', e);
        setError(`Failed to initialize app: ${e}`);
        setLoading(false);
      }
    };

    initializeApp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleExampleChange = async (newExample: string) => {
    if (newExample === selectedExample || !serviceManager) return;

    // 1) Unmount the current example FIRST so its useEffect cleanup hooks
    //    (e.g. AGUIAdapter.disconnect → /ag-ui/terminate, abort fetches,
    //    close runtime sandboxes) run against a still-valid store state.
    setIsChangingExample(true);
    setExampleComponent(null);
    // Yield to React so the unmount actually commits before we wipe stores.
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => resolve());
    });

    // 2) Tear down any server-side agents created by the previous example.
    //    Each example caches its agent id in sessionStorage via
    //    `uniqueAgentId(baseName)` under key `agent-runtimes:agentId:<base>`.
    //    Delete those agents on the server and drop the cached ids so the
    //    next example (and a future re-entry into this one) boots fresh.
    const agentBaseUrl =
      import.meta.env.VITE_BASE_URL || 'http://localhost:8765';
    const token = useSimpleAuthStore.getState().token;
    const agentIdKeys: string[] = [];
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith('agent-runtimes:agentId:')) {
          agentIdKeys.push(key);
        }
      }
    } catch {
      // sessionStorage unavailable; skip teardown.
    }
    await Promise.all(
      agentIdKeys.map(async key => {
        let agentId: string | null = null;
        try {
          agentId = sessionStorage.getItem(key);
        } catch {
          /* ignore */
        }
        if (!agentId) return;
        try {
          await fetch(
            `${agentBaseUrl}/api/v1/agents/${encodeURIComponent(agentId)}`,
            {
              method: 'DELETE',
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            },
          );
        } catch {
          // Best-effort teardown: ignore network / 404 errors.
        }
        try {
          sessionStorage.removeItem(key);
        } catch {
          /* ignore */
        }
      }),
    );

    // 3) Wipe every piece of in-process agent state so the next example boots
    //    with a clean slate (no leftover messages, threads, pending tool
    //    calls, runtime snapshots, monitoring caches, or sockets).
    useChatStore.getState().reset();
    useConversationStore.getState().clearAll();
    agentRuntimeStore.getState().reset();

    // 4) Drop the persisted slice from localStorage so a fresh example never
    //    rehydrates a previous example's agents / monitoring cache.
    try {
      localStorage.removeItem('agent-runtimes-storage');
    } catch {
      // Ignore storage failures (e.g. private mode).
    }

    // 5) Load and mount the new example.
    setSelectedExample(newExample);
    localStorage.setItem('selectedExample', newExample);
    await loadExample(newExample, serviceManager);
  };

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h2>Loading Example: {selectedExample}</h2>
        <p>Please wait...</p>
      </div>
    );
  }

  if (error && !ExampleComponent) {
    return (
      <div style={{ padding: '20px', color: 'red' }}>
        <h2>Error Loading Example</h2>
        <pre>{error}</pre>
      </div>
    );
  }

  if (!ExampleComponent && !isChangingExample) {
    return (
      <div style={{ padding: '20px' }}>
        <h2>Example Not Found</h2>
        <p>The selected example could not be loaded.</p>
      </div>
    );
  }

  // Check if the example component expects props
  // Most examples will need serviceManager
  const exampleProps: Record<string, unknown> = {};
  if (serviceManager) {
    exampleProps.serviceManager = serviceManager;
  }
  exampleProps.examples = filteredExampleEntries.filter(
    entry => entry.id !== 'HomeExample',
  );
  exampleProps.searchQuery = searchQuery;
  exampleProps.onSearchChange = (value: string) => setSearchQuery(value);
  exampleProps.onSelectExample = (name: string) => {
    void handleExampleChange(name);
  };

  return (
    <ExampleAppThemed
      selectedExample={selectedExample}
      isChangingExample={isChangingExample}
      error={error}
      ExampleComponent={ExampleComponent}
      exampleProps={exampleProps}
      onExampleChange={handleExampleChange}
      availableExamples={getExampleEntriesList()}
    />
  );
};

/**
 * Inner shell that reads from the theme store and wires
 * DatalayerThemeProvider + the header bar with selectors.
 */
const ExampleAppThemed: React.FC<{
  selectedExample: string;
  isChangingExample: boolean;
  error: string | null;
  ExampleComponent: React.ComponentType<Record<string, unknown>> | null;
  exampleProps: Record<string, unknown>;
  onExampleChange: (name: string) => Promise<void>;
  availableExamples: ExampleEntry[];
}> = ({
  selectedExample,
  isChangingExample,
  error,
  ExampleComponent,
  exampleProps,
  onExampleChange,
  availableExamples,
}) => {
  const { colorMode, theme: themeVariant } = useExampleThemeStore();
  const cfg = themeConfigs[themeVariant];
  const logoColors = getLogoColors(themeVariant, colorMode);
  const { token, setAuth, clearAuth } = useSimpleAuthStore();
  const [showSignIn, setShowSignIn] = useState(false);

  const syncTokenToIamStore = useCallback((newToken: string | undefined) => {
    import('@datalayer/core/lib/state').then(({ iamStore: coreIamStore }) => {
      coreIamStore.setState({ token: newToken });
    });
  }, []);

  useEffect(() => {
    // Keep iamStore aligned with persisted auth token on app load/refresh.
    syncTokenToIamStore(token || undefined);
  }, [token, syncTokenToIamStore]);

  const handleHeaderSignIn = useCallback(
    (newToken: string, handle: string) => {
      setAuth(newToken, handle);
      syncTokenToIamStore(newToken);
      setShowSignIn(false);
    },
    [setAuth, syncTokenToIamStore],
  );

  const handleHeaderLogout = useCallback(() => {
    clearAuth();
    syncTokenToIamStore(undefined);
  }, [clearAuth, syncTokenToIamStore]);

  return (
    <DatalayerThemeProvider
      colorMode={colorMode}
      theme={cfg.primerTheme}
      themeStyles={cfg.themeStyles}
    >
      <Box
        sx={{
          width: '100vw',
          height: '100vh',
          overflow: 'hidden',
          bg: 'canvas.default',
          color: 'fg.default',
        }}
      >
        {/* ── Header bar ─────────────────────────────────── */}
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            px: 3,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 3,
            height: '60px',
            bg: 'canvas.subtle',
            borderBottom: '1px solid',
            borderColor: 'border.default',
          }}
        >
          {/* Left: home button + example selector */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box
              as="button"
              onClick={() => void onExampleChange('HomeExample')}
              title="Home"
              aria-label="Go to examples home"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                border: '1px solid',
                borderColor: 'border.default',
                borderRadius: 2,
                bg: 'canvas.default',
                color: 'fg.default',
                cursor: isChangingExample ? 'not-allowed' : 'pointer',
              }}
              disabled={isChangingExample}
            >
              <HomeIcon size={16} />
            </Box>
            <Box
              as="select"
              value={selectedExample}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                onExampleChange(e.target.value)
              }
              disabled={isChangingExample}
              sx={{
                px: 2,
                py: '6px',
                fontSize: 1,
                fontFamily: 'mono',
                border: '1px solid',
                borderColor: 'border.default',
                borderRadius: 2,
                bg: 'canvas.default',
                color: 'fg.default',
                cursor: isChangingExample ? 'not-allowed' : 'pointer',
                minWidth: '250px',
                outline: 'none',
                '&:focus-visible': {
                  boxShadow:
                    '0 0 0 2px var(--bgColor-accent-muted, rgba(9,105,218,0.3))',
                },
              }}
            >
              {(() => {
                const home = availableExamples.find(
                  e => e.id === 'HomeExample',
                );
                const rest = availableExamples.filter(
                  e => e.id !== 'HomeExample',
                );

                // Classify each example into a named group.
                const groupOf = (id: string): string => {
                  if (id.startsWith('A2Ui')) return 'A2UI';
                  if (id.startsWith('AgUi')) return 'AG-UI';
                  if (id.startsWith('CopilotKit')) return 'CopilotKit';
                  if (id.startsWith('Agent')) return 'Agent';
                  if (id.startsWith('Chat')) return 'Chat';
                  if (id.startsWith('Lexical')) return 'Lexical';
                  if (
                    id.startsWith('Notebook') ||
                    id === 'DatalayerNotebookExample'
                  )
                    return 'Notebook';
                  return 'Cell';
                };

                const groupOrder = [
                  'A2UI',
                  'AG-UI',
                  'Agent',
                  'Chat',
                  'CopilotKit',
                  'Lexical',
                  'Notebook',
                  'Cell',
                ];

                const grouped = new Map<string, typeof rest>();
                for (const ex of rest) {
                  const g = groupOf(ex.id);
                  if (!grouped.has(g)) grouped.set(g, []);
                  grouped.get(g)!.push(ex);
                }
                for (const list of grouped.values()) {
                  list.sort((a, b) => a.title.localeCompare(b.title));
                }

                const nodes: React.ReactNode[] = [];
                if (home) {
                  nodes.push(
                    <option key={home.id} value={home.id}>
                      {home.title}
                    </option>,
                  );
                }

                let sepIndex = 0;
                for (const g of groupOrder) {
                  const items = grouped.get(g);
                  if (!items || items.length === 0) continue;
                  nodes.push(
                    <option
                      key={`__sep_${sepIndex++}`}
                      disabled
                      value={`__sep_${sepIndex}`}
                    >
                      ────── {g} ──────
                    </option>,
                  );
                  for (const example of items) {
                    nodes.push(
                      <option key={example.id} value={example.id}>
                        {example.title}
                      </option>,
                    );
                  }
                }

                return <>{nodes}</>;
              })()}
            </Box>
            {isChangingExample && (
              <Box as="span" sx={{ color: 'fg.muted', fontSize: 0 }}>
                Loading…
              </Box>
            )}
            {error && (
              <Box as="span" sx={{ color: 'danger.fg', fontSize: 0 }}>
                Error: {error}
              </Box>
            )}
          </Box>

          {/* Right: theme picker + color mode + logo */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <AppearanceControlsWithStore useStore={useExampleThemeStore} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {token ? (
                <>
                  <UserBadge token={token} variant="small" />
                  <Button
                    size="small"
                    variant="invisible"
                    onClick={handleHeaderLogout}
                    leadingVisual={SignOutIcon}
                    sx={{ color: 'fg.muted' }}
                  >
                    Sign out
                  </Button>
                </>
              ) : (
                <Button
                  size="small"
                  variant="invisible"
                  onClick={() => setShowSignIn(true)}
                  leadingVisual={SignInIcon}
                  sx={{ color: 'fg.muted' }}
                >
                  Sign in
                </Button>
              )}
            </Box>
            <Box
              as="a"
              href="https://datalayer.ai"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open Datalayer website"
              sx={{ display: 'inline-flex', alignItems: 'center' }}
            >
              <DatalayerLogoText
                size={24}
                variant={themeVariant}
                colorMode={colorMode}
                primaryColor={logoColors.primary}
                secondaryColor={logoColors.secondary}
                textColor={logoColors.textColor}
                primaryGradient={logoColors.primaryGradient}
                secondaryGradient={logoColors.secondaryGradient}
                gradient={true}
              />
            </Box>
          </Box>
        </Box>

        {showSignIn && !token && (
          <Box
            sx={{
              position: 'fixed',
              top: 60,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 150,
              bg: 'canvas.backdrop',
              p: 3,
              overflow: 'auto',
            }}
          >
            <Box sx={{ maxWidth: 640, mx: 'auto' }}>
              <SignInSimple
                onSignIn={handleHeaderSignIn}
                onApiKeySignIn={apiKey =>
                  handleHeaderSignIn(apiKey, 'api-key-user')
                }
                title="Agent Runtimes Examples"
                description="Sign in to run authenticated examples and tools."
                leadingIcon={<HomeIcon size={24} />}
              />
              <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
                <Button
                  size="small"
                  variant="invisible"
                  onClick={() => setShowSignIn(false)}
                >
                  Cancel
                </Button>
              </Box>
            </Box>
          </Box>
        )}

        {/* ── Content area ───────────────────────────────── */}
        <Box
          sx={{
            marginTop: '60px',
            height: 'calc(100vh - 60px)',
            overflow: 'hidden',
          }}
        >
          {isChangingExample ? (
            <Box sx={{ p: 5, textAlign: 'center', color: 'fg.muted' }}>
              <h3>Loading {selectedExample}…</h3>
              <p>Please wait while the example loads.</p>
            </Box>
          ) : ExampleComponent ? (
            <ExampleWrapper key={selectedExample}>
              <ExampleComponent key={selectedExample} {...exampleProps} />
            </ExampleWrapper>
          ) : null}
        </Box>
      </Box>
    </DatalayerThemeProvider>
  );
};

// Mount the app - check route to determine which app to render
const root = document.getElementById('root');
if (root) {
  const appRoot =
    window.__agentRuntimesExamplesRoot ??
    (window.__agentRuntimesExamplesRoot = createRoot(root));

  if (isOAuthCallback()) {
    // Handle OAuth callback - render OAuthCallback component
    appRoot.render(
      <JupyterReactTheme>
        <OAuthCallback autoClose={true} autoCloseDelay={1000} />
      </JupyterReactTheme>,
    );
  } else if (isNotebookOnlyRoute()) {
    appRoot.render(<NotebookOnlyApp />);
  } else {
    appRoot.render(<ExampleApp />);
  }
} else {
  console.error('Root element not found');
}
