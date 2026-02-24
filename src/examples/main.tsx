/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/// <reference types="vite/client" />

import React, { useEffect, useState } from 'react';
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
  themeConfigs,
  themeVariants,
  type ColorMode,
} from '@datalayer/primer-addons';
import { SegmentedControl } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { MoonIcon, SunIcon, DeviceDesktopIcon } from '@primer/octicons-react';
import {
  coreStore,
  iamStore,
  createDatalayerServiceManager,
} from '@datalayer/core';
import { useChatStore } from '../components/chat/store';
import { OAuthCallback } from '../identity';
import { EXAMPLES } from './example-selector';
import { useExampleThemeStore } from './stores/themeStore';

import nbformatExample from './stores/notebooks/NotebookExample1.ipynb.json';

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
        const envToken = import.meta.env.VITE_DATALAYER_API_TOKEN;
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
                position: {} as any,
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

const getExampleNames = () => Object.keys(EXAMPLES);

// Check if we're on the notebook-only route
const isNotebookOnlyRoute = () => {
  const path = window.location.pathname;
  console.log('Current pathname:', path);
  const isNotebookRoute = path === '/datalayer/notebook';
  console.log('Is notebook-only route:', isNotebookRoute);
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
  return 'DatalayerNotebookExample';
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
            console.log(
              '[NotebookOnlyApp] Created collaboration provider:',
              provider,
            );
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

  console.log('[NotebookOnlyApp] Rendering with:', {
    hasServiceManager: !!serviceManager,
    hasCollaborationProvider: !!collaborationProvider,
    notebookId: NOTEBOOK_ID,
  });

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
  const [isChangingExample, setIsChangingExample] = useState(false);

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

    // Clear chat store when changing examples to start fresh
    useChatStore.getState().clearMessages();

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

  return (
    <ExampleAppThemed
      selectedExample={selectedExample}
      isChangingExample={isChangingExample}
      error={error}
      ExampleComponent={ExampleComponent}
      exampleProps={exampleProps}
      onExampleChange={handleExampleChange}
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
}> = ({
  selectedExample,
  isChangingExample,
  error,
  ExampleComponent,
  exampleProps,
  onExampleChange,
}) => {
  const { colorMode, theme: themeVariant } = useExampleThemeStore();
  const cfg = themeConfigs[themeVariant];

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
            height: '50px',
            bg: 'canvas.subtle',
            borderBottom: '1px solid',
            borderColor: 'border.default',
          }}
        >
          {/* Left: example selector */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
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
              {getExampleNames()
                .sort()
                .map(name => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
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
            {/* Theme colored circles */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {themeVariants.map(variant => {
                const tcfg = themeConfigs[variant];
                const isSelected = themeVariant === variant;
                return (
                  <Box
                    as="button"
                    key={variant}
                    aria-label={tcfg.label}
                    aria-pressed={isSelected}
                    onClick={() =>
                      useExampleThemeStore.getState().setTheme(variant, false)
                    }
                    sx={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      backgroundColor: tcfg.brandColor,
                      border: '2px solid',
                      borderColor: isSelected ? 'accent.fg' : 'border.default',
                      cursor: 'pointer',
                      padding: 0,
                      outline: 'none',
                      transition: 'border-color 0.15s ease',
                      boxShadow: isSelected
                        ? '0 0 0 2px var(--bgColor-accent-muted, rgba(9,105,218,0.3))'
                        : 'none',
                      '&:hover': { borderColor: 'accent.fg' },
                      '&:focus-visible': {
                        boxShadow:
                          '0 0 0 2px var(--bgColor-accent-muted, rgba(9,105,218,0.3))',
                      },
                    }}
                  />
                );
              })}
            </Box>

            {/* Color mode segmented control */}
            <SegmentedControl
              aria-label="Color mode"
              size="small"
              onChange={(index: number) => {
                const modes: ColorMode[] = ['light', 'dark', 'auto'];
                useExampleThemeStore.getState().setColorMode(modes[index]);
              }}
            >
              <SegmentedControl.IconButton
                selected={colorMode === 'light'}
                icon={SunIcon}
                aria-label="Light"
              />
              <SegmentedControl.IconButton
                selected={colorMode === 'dark'}
                icon={MoonIcon}
                aria-label="Dark"
              />
              <SegmentedControl.IconButton
                selected={colorMode === 'auto'}
                icon={DeviceDesktopIcon}
                aria-label="Auto"
              />
            </SegmentedControl>

            <img
              src="https://assets.datalayer.tech/datalayer-25.svg"
              alt="Datalayer"
              style={{ height: '24px' }}
            />
          </Box>
        </Box>

        {/* ── Content area ───────────────────────────────── */}
        <Box
          sx={{
            marginTop: '50px',
            height: 'calc(100vh - 50px)',
            overflow: 'auto',
          }}
        >
          {isChangingExample ? (
            <Box sx={{ p: 5, textAlign: 'center', color: 'fg.muted' }}>
              <h3>Loading {selectedExample}…</h3>
              <p>Please wait while the example loads.</p>
            </Box>
          ) : ExampleComponent ? (
            <ExampleComponent {...exampleProps} />
          ) : null}
        </Box>
      </Box>
    </DatalayerThemeProvider>
  );
};

// Mount the app - check route to determine which app to render
const root = document.getElementById('root');
if (root) {
  if (isOAuthCallback()) {
    // Handle OAuth callback - render OAuthCallback component
    console.log('Rendering OAuthCallback (popup flow)');
    createRoot(root).render(
      <JupyterReactTheme>
        <OAuthCallback autoClose={true} autoCloseDelay={1000} />
      </JupyterReactTheme>,
    );
  } else if (isNotebookOnlyRoute()) {
    console.log('Rendering NotebookOnlyApp');
    createRoot(root).render(<NotebookOnlyApp />);
  } else {
    console.log('Rendering ExampleApp');
    createRoot(root).render(<ExampleApp />);
  }
} else {
  console.error('Root element not found');
}
