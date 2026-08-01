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
  SlidingPanel,
} from '@datalayer/primer-addons';
import { AgentSummary } from '../components';
import { HomeIcon, SignInIcon, SignOutIcon } from '@primer/octicons-react';
import { Button, SegmentedControl, Spinner, Text } from '@primer/react';
import { AppearanceControlsWithStore } from '@datalayer/primer-addons/lib/components/appearance';
import { coreStore, iamStore } from '@datalayer/core';
import {
  DATALAYER_IAM_TOKEN_KEY,
  DATALAYER_IAM_USER_KEY,
} from '../state/substates';
import { SignInSimple } from '@datalayer/core/lib/views/iam';
import { UserBadge } from '@datalayer/core/lib/views/profile';
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { teardownExampleAgents } from './utils/teardownAgents';
import { OAuthCallback } from '../identity';
import {
  EXAMPLES,
  getExampleEntries,
  type ExampleEntry,
} from './example-selector';
import {
  runtimeTargetStore,
  useRuntimeTargetStore,
  type ExampleRuntimeTarget,
} from './utils/runtimeTargetStore';
import { resolveExampleAgentRuntimesUrl } from './utils/useExampleAgentRuntimesUrl';
import { agentSummaryStore } from './utils/agentSummaryStore';
import { useAgentSummaryStore } from './utils/agentSummaryStore';
import { useExampleThemeStore } from './utils/themeStore';
import { ExampleWrapper } from './components/ExampleWrapper';
import { ExampleErrorBoundary } from './components/ExampleErrorBoundary';
import { createServiceManagerFromAgentSandbox } from '../hooks/useAgentRuntimes';
import type { RuntimeEnvironmentDetails } from '../hooks/useAgentRuntimes';
import { DEFAULT_MODEL } from '../specs/models';

import nbformatExample from './utils/notebooks/NotebookExample1.ipynb.json';

import '../../style/primer-primitives.css';

declare global {
  interface Window {
    __agentRuntimesExamplesRoot?: ReturnType<typeof createRoot>;
  }
}

const DEFAULT_RUNTIMES_URL = 'https://r1.datalayer.run';
const DEFAULT_LOCAL_JUPYTER_SERVER_URL =
  'http://localhost:8888/api/jupyter-server';
const DEFAULT_LOCAL_JUPYTER_SERVER_TOKEN =
  '60c1661cc408f978c309d04157af55c9588ff9557c9380e4fb50785750703da6';
const DEFAULT_CLOUD_RUNTIME_ENVIRONMENT = 'ai-agents-env';

const isNotebookOrCellExample = (exampleId: string): boolean => {
  return (
    (exampleId.includes('Notebook') || exampleId.includes('Cell')) &&
    !exampleId.includes('Agent')
  );
};

const wait = (ms: number) =>
  new Promise<void>(resolve => {
    window.setTimeout(resolve, ms);
  });

const safeExampleId = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
};

const toAgentApiBaseUrl = (ingress: string): string => {
  const normalized = ingress.replace(/\/$/, '');
  if (normalized.includes('/api/agent-runtimes')) {
    return normalized;
  }
  if (normalized.includes('/api/jupyter-server')) {
    return normalized.replace('/api/jupyter-server', '/api/agent-runtimes');
  }
  if (normalized.includes('/jupyter/server/')) {
    return normalized.replace('/jupyter/server/', '/agent-runtimes/');
  }
  if (normalized.includes('/jupyter-server/')) {
    return normalized.replace('/jupyter-server/', '/agent-runtimes/');
  }
  return normalized.replace('/jupyter/', '/agent-runtimes/');
};

const toSurfaceLabel = (exampleId: string): 'cell' | 'notebook' => {
  if (exampleId.toLowerCase().includes('cell')) {
    return 'cell';
  }
  return 'notebook';
};

const normalizeSandboxBaseUrl = (
  sandboxBaseUrl: string | undefined,
  agentBaseUrl: string,
): string => {
  const sandboxRaw = String(sandboxBaseUrl || '').trim();
  const agentRaw = String(agentBaseUrl || '').trim();
  if (!sandboxRaw) {
    return agentRaw;
  }
  try {
    const sandboxUrl = new URL(sandboxRaw);
    const host = sandboxUrl.hostname;
    const isInternalHost =
      host === '0.0.0.0' || host === '127.0.0.1' || host === 'localhost';
    if (!isInternalHost) {
      return sandboxRaw;
    }
    const agentUrl = new URL(agentRaw);
    sandboxUrl.protocol = agentUrl.protocol;
    sandboxUrl.host = agentUrl.host;
    return sandboxUrl.toString();
  } catch {
    return sandboxRaw;
  }
};

const withTokenQueryParam = (rawUrl: string, token: string): string => {
  const normalizedUrl = String(rawUrl || '').trim();
  const normalizedToken = String(token || '').trim();
  if (!normalizedUrl || !normalizedToken) {
    return normalizedUrl;
  }
  try {
    const parsed = new URL(normalizedUrl);
    if (!parsed.searchParams.get('token') && !parsed.searchParams.get('jupyter_token')) {
      parsed.searchParams.set('token', normalizedToken);
    }
    return parsed.toString();
  } catch {
    return normalizedUrl;
  }
};

type CloudSandboxBootstrap = {
  agentBaseUrl: string;
  agentId: string;
  ingress: string;
  runtimeEnvironment?: RuntimeEnvironmentDetails;
};

type TopNoticeTone = 'default' | 'info' | 'success' | 'warning' | 'error' | 'danger';

interface TopNotice {
  id: number;
  message: string;
  details?: string;
  tone?: TopNoticeTone;
  durationMs?: number;
}

const resolveRuntimesUrl = (configured?: string): string => {
  const envRuntimeUrl = import.meta.env.VITE_DATALAYER_RUNTIMES_URL;
  const envBaseUrl = import.meta.env.VITE_DATALAYER_URL;
  const candidate = configured || envRuntimeUrl || envBaseUrl;
  if (!candidate) {
    return DEFAULT_RUNTIMES_URL;
  }
  if (candidate.includes('prod1.datalayer.run')) {
    return DEFAULT_RUNTIMES_URL;
  }
  return candidate.replace(/\/$/, '');
};

const toAgentRuntimesBaseUrl = (value?: string | null): string | undefined => {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().replace(/\/$/, '');
  if (!normalized) {
    return undefined;
  }
  return normalized;
};

const isProd1JupyterServerUrl = (value?: string | null): boolean => {
  if (!value) {
    return false;
  }
  try {
    return new URL(value).hostname === 'prod1.datalayer.run';
  } catch {
    return value.includes('prod1.datalayer.run');
  }
};

const resolveLocalJupyterServerUrl = (): string => {
  const normalizeLoopbackHost = (raw: string): string => {
    const trimmed = raw.trim().replace(/\/$/, '');
    if (!trimmed) {
      return DEFAULT_LOCAL_JUPYTER_SERVER_URL;
    }
    try {
      const parsed = new URL(trimmed);
      if (parsed.hostname === '0.0.0.0') {
        parsed.hostname = 'localhost';
      }
      return parsed.toString().replace(/\/$/, '');
    } catch {
      return trimmed.replace('://0.0.0.0', '://localhost');
    }
  };

  const envLocalUrl = (
    import.meta.env.VITE_JUPYTER_SERVER_URL as string | undefined
  )?.trim();
  if (envLocalUrl) {
    return normalizeLoopbackHost(envLocalUrl);
  }

  const configured = getJupyterServerUrl();
  if (configured && !isProd1JupyterServerUrl(configured)) {
    return normalizeLoopbackHost(configured);
  }
  return normalizeLoopbackHost(DEFAULT_LOCAL_JUPYTER_SERVER_URL);
};

const ensureLocalJupyterToken = (): void => {
  const token = (getJupyterServerToken() || '').trim();
  if (!token) {
    setJupyterServerToken(DEFAULT_LOCAL_JUPYTER_SERVER_TOKEN);
  }
};

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

      if (datalayerConfig.datalayerUrl) {
        datalayerConfig.runtimesUrl = resolveRuntimesUrl(
          datalayerConfig.runtimesUrl,
        );
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

const isIAMSocialCallback = () => {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  const isCallbackPath = /\/iam\/oauth2\/[^/]+\/callback$/.test(path);
  return isCallbackPath && (params.has('token') || params.has('error'));
};

const resolveNavigationTarget = (
  params: URLSearchParams,
): string | undefined => {
  const candidate =
    params.get('navigate_to') ||
    params.get('navigation') ||
    params.get('post_auth_redirect') ||
    params.get('redirect_url');
  if (!candidate) {
    return undefined;
  }
  const normalized = String(candidate).trim();
  if (!normalized.startsWith('/') || normalized.startsWith('//')) {
    return undefined;
  }
  if (/^\/iam\/oauth2\/[^/]+\/callback$/.test(normalized)) {
    return undefined;
  }
  return normalized;
};

const parseUserFromCallback = (
  encodedUser: string | null,
): Record<string, unknown> | undefined => {
  if (!encodedUser) {
    return undefined;
  }
  const attempts = [encodedUser];
  try {
    attempts.push(decodeURIComponent(encodedUser));
  } catch {
    // ignore decode failure
  }
  if (attempts.length > 1) {
    try {
      attempts.push(decodeURIComponent(attempts[1]));
    } catch {
      // ignore double decode failure
    }
  }
  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // keep trying
    }
  }
  return undefined;
};

const AgentRuntimesIAMCallback: React.FC = () => {
  const [status, setStatus] = useState<'processing' | 'error'>('processing');
  const [message, setMessage] = useState('Finalizing social sign-in...');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const provider =
      window.location.pathname.match(
        /\/iam\/oauth2\/([^/]+)\/callback$/,
      )?.[1] || '';
    const token = params.get('token') || '';
    const error = params.get('error') || '';

    if (error) {
      setStatus('error');
      setMessage(error);
      return;
    }
    if (!token) {
      setStatus('error');
      setMessage('Missing token in OAuth callback.');
      return;
    }

    const callbackUser = parseUserFromCallback(params.get('user'));
    const handle =
      String(
        callbackUser?.handle_s ||
          callbackUser?.handle ||
          callbackUser?.email_s ||
          callbackUser?.email ||
          'user',
      ).trim() || 'user';

    const storedUser = {
      uid: String(callbackUser?.uid || ''),
      handle,
      firstName: String(
        callbackUser?.first_name_t || callbackUser?.firstName || '',
      ),
      lastName: String(
        callbackUser?.last_name_t || callbackUser?.lastName || '',
      ),
      email: String(callbackUser?.email_s || callbackUser?.email || ''),
      displayName:
        String(
          callbackUser?.display_name_t || callbackUser?.displayName || '',
        ).trim() || handle,
      avatarUrl: String(
        callbackUser?.avatar_url_s || callbackUser?.avatarUrl || '',
      ),
      roles: Array.isArray(callbackUser?.roles_ss)
        ? (callbackUser?.roles_ss as string[])
        : [],
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
      initials: handle.slice(0, 2).toUpperCase(),
      id: String(callbackUser?.uid || ''),
    };

    window.localStorage.setItem(DATALAYER_IAM_TOKEN_KEY, token);
    window.localStorage.setItem(
      DATALAYER_IAM_USER_KEY,
      JSON.stringify(storedUser),
    );
    useSimpleAuthStore.getState().setAuth(token, handle);
    iamStore.getState().setLogin(storedUser, token);

    const providerAccessToken = provider
      ? params.get(`${provider}_access_token`)
      : null;
    if (
      providerAccessToken &&
      (provider === 'github' ||
        provider === 'google' ||
        provider === 'linkedin' ||
        provider === 'okta' ||
        provider === 'bluesky')
    ) {
      iamStore
        .getState()
        .setIAMProviderAccessToken(provider, providerAccessToken);
    }

    const target = resolveNavigationTarget(params);
    if (target) {
      window.location.replace(target);
      return;
    }

    window.localStorage.setItem('selectedExample', 'HomeExample');
    window.location.replace('/');
  }, []);

  return (
    <JupyterReactTheme>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          p: 3,
        }}
      >
        <Box sx={{ textAlign: 'center' }}>
          {status === 'processing' ? <Spinner size="large" /> : null}
          <Text
            as="p"
            sx={{
              mt: 3,
              color: status === 'error' ? 'danger.fg' : 'fg.default',
            }}
          >
            {message}
          </Text>
        </Box>
      </Box>
    </JupyterReactTheme>
  );
};

// Get the default example name from localStorage
const getDefaultExampleName = (): string => {
  const stored = localStorage.getItem('selectedExample');
  if (stored && EXAMPLES[stored]) {
    return stored;
  }
  return 'NotebookExample';
};

const parseJwtPayload = (token: string): Record<string, unknown> | null => {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) {
    return null;
  }
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const decoded = atob(padded);
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const isExpiredJwt = (token: string): boolean => {
  const payload = parseJwtPayload(token);
  if (!payload) {
    // Non-JWT tokens (for example API keys) should not be treated as expired.
    return false;
  }
  const exp = payload.exp;
  if (typeof exp !== 'number') {
    return false;
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  return nowSeconds >= exp;
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

        // Always try to create collaboration provider if we have token and datalayerUrl
        if (configuration?.token && configuration?.datalayerUrl) {
          try {
            const { DatalayerCollaborationProvider } =
              await import('../collaboration/DatalayerCollaborationProvider');
            const provider = new DatalayerCollaborationProvider({
              datalayerUrl: configuration.datalayerUrl,
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
        if (
          runtimeTargetStore.getState().target === 'cloud' &&
          configuration?.token
        ) {
          try {
            const activeSummary = agentSummaryStore.getState().active;
            if (!activeSummary || activeSummary.location !== 'cloud') {
              throw new Error(
                'No active cloud agent sandbox found for notebook-only mode.',
              );
            }
            const manager = await createServiceManagerFromAgentSandbox(
              {
                baseUrl: activeSummary.sandboxBaseUrl || activeSummary.baseUrl,
                agentId: activeSummary.agentId,
                agentBaseUrl: activeSummary.baseUrl,
              },
              configuration.token,
            );
            setServiceManager(manager);
          } catch (error) {
            console.error('Failed to connect to cloud sandbox:', error);
            const serverSettings = createServerSettings(
              getJupyterServerUrl(),
              getJupyterServerToken(),
            );
            const manager = new ServiceManager({ serverSettings });
            await manager.ready;
            setServiceManager(manager);
          }
        } else {
          setJupyterServerUrl(resolveLocalJupyterServerUrl());
          ensureLocalJupyterToken();
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
  const [topNotice, setTopNotice] = useState<TopNotice | null>(null);
  const runtimeTarget = useRuntimeTargetStore(state => state.target);
  const setRuntimeTarget = useRuntimeTargetStore(state => state.setTarget);

  const showTopNotice = useCallback(
    (
      message: string,
      tone: TopNoticeTone = 'info',
      durationMs = 4500,
      details?: string,
    ) => {
      setTopNotice({
        id: Date.now() + Math.floor(Math.random() * 1000),
        message,
        details,
        tone,
        durationMs,
      });
    },
    [],
  );

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
      showTopNotice(`Failed to load example: ${e instanceof Error ? e.message : String(e)}`, 'error', 6000);
      setError(`Failed to load example: ${e}`);
      setIsChangingExample(false);
    }
  };

  const createLocalServiceManager =
    async (): Promise<ServiceManager.IManager> => {
      setJupyterServerUrl(resolveLocalJupyterServerUrl());
      ensureLocalJupyterToken();
      const serverSettings = createServerSettings(
        getJupyterServerUrl(),
        getJupyterServerToken(),
      );
      const manager = new ServiceManager({ serverSettings });
      await manager.ready;
      return manager;
    };

  const createCloudServiceManager =
    async (): Promise<ServiceManager.IManager> => {
      const { configuration } = coreStore.getState();
      if (!configuration?.token) {
        throw new Error(
          'Cloud runtime requires authentication. Please sign in.',
        );
      }

      const connectFromSummary = async (
        summary: {
          baseUrl: string;
          sandboxBaseUrl?: string;
          agentId?: string;
          runtimeEnvironment?: RuntimeEnvironmentDetails;
        },
      ): Promise<ServiceManager.IManager> => {
        const connectOnce = async (
          candidate: {
            baseUrl: string;
            sandboxBaseUrl?: string;
            agentId?: string;
            runtimeEnvironment?: RuntimeEnvironmentDetails;
          },
        ): Promise<ServiceManager.IManager> => {
          const resolvedSandboxBaseUrl = normalizeSandboxBaseUrl(
            candidate.sandboxBaseUrl,
            candidate.baseUrl,
          );
          const manager = await createServiceManagerFromAgentSandbox(
            {
              baseUrl: resolvedSandboxBaseUrl,
              agentId: candidate.agentId,
              agentBaseUrl: candidate.baseUrl,
              runtimeEnvironment: candidate.runtimeEnvironment,
            },
            configuration.token,
          );
          const cloudBaseUrl = String(manager.serverSettings.baseUrl || '').trim();
          const cloudToken = String(manager.serverSettings.token || '').trim();
          if (cloudBaseUrl) {
            setJupyterServerUrl(cloudBaseUrl.replace(/\/$/, ''));
          }
          if (cloudToken) {
            setJupyterServerToken(cloudToken);
          }
          return manager;
        };

        let lastError: unknown;
        for (let attempt = 1; attempt <= 8; attempt += 1) {
          try {
            return await connectOnce(summary);
          } catch (error) {
            lastError = error;
            if (attempt === 8) {
              break;
            }
            await wait(700 * attempt);
          }
        }
        throw lastError;
      };

      const bootstrapCloudSandbox =
        async (): Promise<CloudSandboxBootstrap> => {
          const runtimesUrl = resolveRuntimesUrl(configuration.runtimesUrl);
          const exampleSlug = safeExampleId(selectedExample || 'example');
          const runtimeResp = await fetch(
            `${runtimesUrl}/api/runtimes/v1/runtimes`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${configuration.token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                environment: {
                  name: DEFAULT_CLOUD_RUNTIME_ENVIRONMENT,
                },
                given_name: `${exampleSlug}-sandbox`,
                credits_limit: 5,
                type: 'notebook',
                editor_variant: 'none',
              }),
            },
          );

          if (!runtimeResp.ok) {
            const failure = await runtimeResp.json().catch(() => ({}));
            throw new Error(
              String(
                (failure as { detail?: string }).detail ||
                  `Failed to launch cloud runtime (${runtimeResp.status}).`,
              ),
            );
          }

          const runtimePayload = (await runtimeResp.json()) as {
            runtime?: {
              ingress?: string;
              pod_name?: string;
              token?: string;
              jupyter_token?: string;
              environment?: {
                name?: string;
                title?: string;
                cpu?: string | number;
                memory?: string | number;
                gpu?: string | number;
                resources?: {
                  cpu?: string | number;
                  memory?: string | number;
                  gpu?: string | number;
                  gpu_count?: string | number;
                  gpu_type?: string;
                  gpu_memory?: string;
                  'nvidia.com/gpu'?: string | number;
                };
              };
            };
            ingress?: string;
            pod_name?: string;
            token?: string;
            jupyter_token?: string;
          };
          const ingress = String(
            runtimePayload.runtime?.ingress || runtimePayload.ingress || '',
          ).trim();
          if (!ingress) {
            throw new Error(
              'Cloud runtime launched but did not expose a Jupyter ingress URL.',
            );
          }

          const agentBaseUrl = toAgentApiBaseUrl(ingress);
          const agentId = `${exampleSlug}-cloud-agent`;

          const agentResp = await fetch(`${agentBaseUrl}/api/v1/agents`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${configuration.token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: agentId,
              description: `Cloud sandbox agent for ${selectedExample}`,
              agent_library: 'pydantic-ai',
              transport: 'ag-ui',
              model: DEFAULT_MODEL,
              system_prompt: 'You are a helpful AI assistant.',
            }),
          });

          if (!agentResp.ok && agentResp.status !== 400 && agentResp.status !== 409) {
            const failure = await agentResp.json().catch(() => ({}));
            throw new Error(
              String(
                (failure as { detail?: string }).detail ||
                  `Cloud runtime launched but agent creation failed (${agentResp.status}).`,
              ),
            );
          }

          const agentPayload = (await agentResp
            .clone()
            .json()
            .catch(() => ({}))) as {
            agent_id?: string;
            id?: string;
            token?: string;
            jupyter_token?: string;
            agent?: { id?: string; agent_id?: string };
          };
          const resolvedAgentId =
            String(
              agentPayload.agent_id ||
                agentPayload.id ||
                agentPayload.agent?.agent_id ||
                agentPayload.agent?.id ||
                '',
            ).trim() || agentId;
          const resolvedJupyterToken = String(
            agentPayload.jupyter_token ||
              agentPayload.token ||
              runtimePayload.runtime?.jupyter_token ||
              runtimePayload.runtime?.token ||
              runtimePayload.jupyter_token ||
              runtimePayload.token ||
              '',
          ).trim();
          const runtimeEnvironment: RuntimeEnvironmentDetails = {
            environmentName: String(
              runtimePayload.runtime?.environment?.name || '',
            ).trim() || undefined,
            environmentTitle: String(
              runtimePayload.runtime?.environment?.title || '',
            ).trim() || undefined,
            cpu:
              String(
                runtimePayload.runtime?.environment?.cpu ||
                  runtimePayload.runtime?.environment?.resources?.cpu ||
                  '',
              ).trim() || undefined,
            memory:
              String(
                runtimePayload.runtime?.environment?.memory ||
                  runtimePayload.runtime?.environment?.resources?.memory ||
                  '',
              ).trim() ||
              undefined,
            gpu:
              [
                runtimePayload.runtime?.environment?.gpu ||
                  runtimePayload.runtime?.environment?.resources?.gpu ||
                  runtimePayload.runtime?.environment?.resources?.gpu_count ||
                  runtimePayload.runtime?.environment?.resources?.['nvidia.com/gpu'] ||
                  '',
                runtimePayload.runtime?.environment?.resources?.gpu_type || '',
                runtimePayload.runtime?.environment?.resources?.gpu_memory || '',
              ]
                .map(value => String(value || '').trim())
                .filter(Boolean)
                .join(' ') || undefined,
          };

          return {
            agentBaseUrl,
            agentId: resolvedAgentId,
            ingress: withTokenQueryParam(ingress, resolvedJupyterToken),
            runtimeEnvironment,
          };
        };

      const activeSummary = agentSummaryStore.getState().active;
      if (
        activeSummary?.location === 'cloud' &&
        (activeSummary.sandboxBaseUrl || activeSummary.baseUrl)
      ) {
        try {
          return await connectFromSummary({
            baseUrl: activeSummary.baseUrl,
            sandboxBaseUrl: activeSummary.sandboxBaseUrl,
            agentId: activeSummary.agentId,
            runtimeEnvironment: activeSummary.runtimeEnvironment,
          });
        } catch (error) {
          if (!isNotebookOrCellExample(selectedExample)) {
            throw error;
          }
          showTopNotice(
            'Existing cloud sandbox is unavailable. Launching a fresh sandbox...',
            'warning',
            3500,
          );
        }
      }

      if (!isNotebookOrCellExample(selectedExample)) {
        throw new Error(
          'No active cloud agent sandbox found. Open an agent example and launch a cloud agent first.',
        );
      }

      showTopNotice('Starting a cloud agent sandbox...', 'info', 2600);
      const launched = await bootstrapCloudSandbox();
      agentSummaryStore.getState().setActive({
        exampleId: selectedExample,
        agentName: launched.agentId,
        agentId: launched.agentId,
        location: 'cloud',
        baseUrl: launched.agentBaseUrl,
        sandboxBaseUrl: launched.ingress,
        runtimeEnvironment: launched.runtimeEnvironment,
        status: 'running',
        isReady: true,
      });
      showTopNotice(
        `Cloud sandbox ready. Connecting ${toSurfaceLabel(selectedExample)} to it...`,
        'success',
        2600,
      );

      return connectFromSummary({
        baseUrl: launched.agentBaseUrl,
        sandboxBaseUrl: launched.ingress,
        agentId: launched.agentId,
        runtimeEnvironment: launched.runtimeEnvironment,
      });
    };

  useEffect(() => {
    // Load configurations
    loadConfigurations();

    // Create service manager and load example - must be sequential
    const initializeApp = async () => {
      try {
        const runtimeTarget = runtimeTargetStore.getState().target;

        // Only create a cloud Datalayer runtime when the user picked "cloud".
        // In "local" mode we must never hit the cloud runtimes API.
        if (runtimeTarget === 'cloud') {
          try {
            const manager = await createCloudServiceManager();
            setServiceManager(manager);
            showTopNotice(
              'Code sandbox connected successfully (cloud).',
              'success',
              2600,
            );

            // Load initial example
            await loadExample(selectedExample, manager);
          } catch (error) {
            console.error('Failed to create DatalayerServiceManager:', error);
            showTopNotice(
              `Cloud runtime unavailable, using local instead: ${
                error instanceof Error ? error.message : String(error)
              }`,
              'warning',
              5500,
            );
            const manager = await createLocalServiceManager();
            setServiceManager(manager);

            // Load initial example
            await loadExample(selectedExample, manager);
          }
        } else {
          // Local runtime target (or no token): use the local Jupyter server.
          const manager = await createLocalServiceManager();
          setServiceManager(manager);

          // Load initial example
          await loadExample(selectedExample, manager);
        }

        setLoading(false);
      } catch (e) {
        console.error('Failed to initialize app:', e);
        showTopNotice(`Failed to initialize app: ${e instanceof Error ? e.message : String(e)}`, 'error', 6000);
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

    // 2) Tear down any server-side agents created by the previous example and
    //    wipe in-process agent state so the next example boots fresh.
    const agentBaseUrl = resolveExampleAgentRuntimesUrl(
      runtimeTargetStore.getState().target,
    );
    const token = useSimpleAuthStore.getState().token;
    await teardownExampleAgents(agentBaseUrl, token ?? undefined);

    // 3) Load and mount the new example.
    setSelectedExample(newExample);
    localStorage.setItem('selectedExample', newExample);
    await loadExample(newExample, serviceManager);
  };

  const handleRuntimeTargetChange = async (
    newTarget: ExampleRuntimeTarget,
  ): Promise<void> => {
    if (newTarget === runtimeTarget || !serviceManager) return;

    let nextManager: ServiceManager.IManager;
    try {
      nextManager =
        newTarget === 'cloud'
          ? await createCloudServiceManager()
          : await createLocalServiceManager();
    } catch (switchError) {
      showTopNotice(
        `Failed to switch to ${newTarget}: ${
          switchError instanceof Error ? switchError.message : String(switchError)
        }`,
        'error',
        6000,
      );
      return;
    }

    // 1) Unmount the current example FIRST so its cleanup hooks run against the
    //    still-valid OLD runtime (AG-UI disconnect, abort fetches, sandboxes).
    setIsChangingExample(true);
    setExampleComponent(null);
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => resolve());
    });

    // 2) Tear down the agents created on the OLD target, then wipe state so a
    //    brand-new runtime is launched for the new target.
    const oldAgentBaseUrl = resolveExampleAgentRuntimesUrl(runtimeTarget);
    const token = useSimpleAuthStore.getState().token;
    await teardownExampleAgents(oldAgentBaseUrl, token ?? undefined);

    // 3) Switch the target and re-mount the example (its key includes the
    //    target, so this launches/connects a fresh runtime).
    setRuntimeTarget(newTarget);
    setServiceManager(nextManager);
    setError(null);
    await loadExample(selectedExample, nextManager);
    showTopNotice(
      `Code sandbox connected successfully (${newTarget}).`,
      'success',
      2600,
    );
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
      serviceManager={serviceManager}
      onExampleChange={handleExampleChange}
      onRuntimeTargetChange={handleRuntimeTargetChange}
      availableExamples={getExampleEntriesList()}
      topNotice={topNotice}
      onDismissTopNotice={() => setTopNotice(null)}
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
  serviceManager: ServiceManager.IManager | null;
  onExampleChange: (name: string) => Promise<void>;
  onRuntimeTargetChange: (target: ExampleRuntimeTarget) => Promise<void>;
  availableExamples: ExampleEntry[];
  topNotice: TopNotice | null;
  onDismissTopNotice: () => void;
}> = ({
  selectedExample,
  isChangingExample,
  error,
  ExampleComponent,
  exampleProps,
  serviceManager,
  onExampleChange,
  onRuntimeTargetChange,
  availableExamples,
  topNotice,
  onDismissTopNotice,
}) => {
  const { colorMode, theme: themeVariant } = useExampleThemeStore();
  const runtimeTarget = useRuntimeTargetStore(state => state.target);
  const agentSummary = useAgentSummaryStore(state => state.active);
  const isHome = selectedExample === 'HomeExample';
  const cfg = themeConfigs[themeVariant];
  const logoColors = getLogoColors(themeVariant, colorMode);
  const { token, setAuth, clearAuth } = useSimpleAuthStore();
  const [showSignIn, setShowSignIn] = useState(false);
  const shouldShowAuthScreen = showSignIn && !token;

  const syncTokenToIamStore = useCallback((newToken: string | undefined) => {
    import('../state/substates').then(({ iamStore: coreIamStore }) => {
      coreIamStore.setState({ token: newToken });
    });
  }, []);

  useEffect(() => {
    const jupyterSandboxBaseUrl = toAgentRuntimesBaseUrl(
      serviceManager?.serverSettings.baseUrl,
    );
    const agentApiBaseUrl = resolveExampleAgentRuntimesUrl(runtimeTarget);
    const isSandboxOnlyExample =
      (selectedExample.includes('Notebook') || selectedExample.includes('Cell')) &&
      !selectedExample.includes('Agent');
    // Seed a base summary for the selected example. Do NOT clobber a richer
    // summary that the mounted example already published (spec id, agent id,
    // readiness) for the same example + target — otherwise fast-settling local
    // agents lose their spec/agent id in the indicator.
    const current = agentSummaryStore.getState().active;
    const alreadyEnriched =
      current != null &&
      current.exampleId === selectedExample &&
      current.location === runtimeTarget &&
      (current.specId != null ||
        current.agentId != null ||
        current.isReady !== undefined);
    if (alreadyEnriched) {
      return;
    }
    agentSummaryStore.getState().setActive({
      exampleId: selectedExample,
      agentName: selectedExample,
      location: runtimeTarget,
      baseUrl: isSandboxOnlyExample ? '' : agentApiBaseUrl,
      sandboxBaseUrl: isSandboxOnlyExample ? jupyterSandboxBaseUrl : undefined,
      status: isChangingExample ? 'switching' : 'selected',
    });
  }, [selectedExample, runtimeTarget, isChangingExample, serviceManager]);

  useEffect(() => {
    // Keep iamStore aligned with persisted auth token on app load/refresh.
    syncTokenToIamStore(token || undefined);
  }, [token, syncTokenToIamStore]);

  useEffect(() => {
    if (!token) {
      setShowSignIn(true);
      return;
    }
    if (isExpiredJwt(token)) {
      clearAuth();
      syncTokenToIamStore(undefined);
      setShowSignIn(true);
    }
  }, [token, clearAuth, syncTokenToIamStore]);

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
    setShowSignIn(true);
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
            bg: 'canvas.default',
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
                fontFamily: 'inherit',
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
                    '0 0 0 2px var(--bgColor-accent-muted, rgba(26,188,156,0.3))',
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
                  if (id === 'AgentspecsExample' || id === 'AgentLoopExample')
                    return 'Personas';
                  if (id.startsWith('A2Ui')) return 'A2UI';
                  if (id.startsWith('AgUi')) return 'AG-UI';
                  if (id.startsWith('CopilotKit')) return 'CopilotKit';
                  if (id.startsWith('Agent')) return 'Agent';
                  if (id.startsWith('Chat')) return 'Chat';
                  if (id.startsWith('Lexical')) return 'Lexical';
                  if (
                    id.startsWith('Notebook') ||
                    id === 'NotebookCollaborationExample'
                  )
                    return 'Notebook';
                  return 'Cell';
                };

                const groupOrder = [
                  'Personas',
                  'A2UI',
                  'AG-UI',
                  'Agent',
                  'Chat',
                  'Lexical',
                  'Notebook',
                  'Cell',
                  'CopilotKit',
                ];

                const grouped = new Map<string, typeof rest>();
                for (const ex of rest) {
                  const g = groupOf(ex.id);
                  const group = grouped.get(g);
                  if (group) {
                    group.push(ex);
                  } else {
                    grouped.set(g, [ex]);
                  }
                }
                for (const [groupName, list] of grouped.entries()) {
                  if (groupName === 'Personas') {
                    const personaOrder = (id: string): number => {
                      if (id === 'AgentspecsExample') return 0;
                      if (id === 'AgentLoopExample') return 1;
                      return 2;
                    };
                    list.sort((a, b) => {
                      const orderDelta =
                        personaOrder(a.id) - personaOrder(b.id);
                      if (orderDelta !== 0) return orderDelta;
                      return a.title.localeCompare(b.title);
                    });
                  } else {
                    list.sort((a, b) => a.title.localeCompare(b.title));
                  }
                }

                const nodes: React.ReactNode[] = [];
                if (home) {
                  nodes.push(
                    <option
                      key={home.id}
                      value={home.id}
                      disabled={home.id === selectedExample}
                    >
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
                      <option
                        key={example.id}
                        value={example.id}
                        disabled={example.id === selectedExample}
                      >
                        {example.title}
                      </option>,
                    );
                  }
                }

                return <>{nodes}</>;
              })()}
            </Box>
            <Box
              aria-label="Runtime target"
              title="Runtime target"
              sx={{ minWidth: '160px', opacity: isHome || isChangingExample ? 0.6 : 1 }}
            >
              <SegmentedControl aria-label="Runtime target" fullWidth>
                <SegmentedControl.Button
                  selected={runtimeTarget === 'local'}
                  disabled={isHome}
                  onClick={() => {
                    if (!isHome && !isChangingExample) {
                      void onRuntimeTargetChange('local');
                    }
                  }}
                >
                  Local
                </SegmentedControl.Button>
                <SegmentedControl.Button
                  selected={runtimeTarget === 'cloud'}
                  disabled={isHome}
                  onClick={() => {
                    if (!isHome && !isChangingExample) {
                      void onRuntimeTargetChange('cloud');
                    }
                  }}
                >
                  Cloud
                </SegmentedControl.Button>
              </SegmentedControl>
            </Box>
            {!isHome && <AgentSummary summary={agentSummary} />}
            {isChangingExample && (
              <Box as="span" sx={{ color: 'fg.muted', fontSize: 0 }}>
                Loading…
              </Box>
            )}
          </Box>

          {/* Right: theme picker + color mode + logo */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <AppearanceControlsWithStore useStore={useExampleThemeStore} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {token ? (
                <>
                  <UserBadge
                    token={token}
                    variant="small"
                    onTokenExpired={() => {
                      handleHeaderLogout();
                      setShowSignIn(true);
                    }}
                  />
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

        {/* ── Content area ───────────────────────────────── */}
        <Box
          sx={{
            marginTop: '60px',
            height: 'calc(100vh - 60px)',
            overflow: 'hidden',
          }}
        >
          {shouldShowAuthScreen ? (
            <Box
              sx={{
                width: '100%',
                height: '100%',
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
              </Box>
            </Box>
          ) : isChangingExample ? (
            <Box sx={{ p: 5, textAlign: 'center', color: 'fg.muted' }}>
              <h3>Loading {selectedExample}…</h3>
              <p>Please wait while the example loads.</p>
            </Box>
          ) : ExampleComponent ? (
            <ExampleErrorBoundary key={`${selectedExample}:${runtimeTarget}`}>
              <ExampleWrapper key={`${selectedExample}:${runtimeTarget}`}>
                <ExampleComponent
                  key={`${selectedExample}:${runtimeTarget}`}
                  {...exampleProps}
                />
              </ExampleWrapper>
            </ExampleErrorBoundary>
          ) : null}
        </Box>
        <SlidingPanel
          isOpen={Boolean(topNotice)}
          onDismiss={onDismissTopNotice}
          position="north"
          variant={topNotice?.tone ?? 'info'}
          durationMs={topNotice?.durationMs ?? 0}
          fullWidth={true}
          offset={60}
          zIndex={160}
          message={topNotice?.message || ''}
          details={topNotice?.details}
        />
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

  if (isIAMSocialCallback()) {
    appRoot.render(<AgentRuntimesIAMCallback />);
  } else if (isOAuthCallback()) {
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
