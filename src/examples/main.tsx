/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/// <reference types="vite/client" />

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
// From the lean `/core` entry: the barrel drags the whole component
// library (notebook, CodeMirror, cells) into the gallery's first paint,
// and the gallery only needs the theme and the server config helpers.
import {
  loadJupyterConfig,
  JupyterReactTheme,
  createServerSettings,
  setJupyterServerUrl,
  setJupyterServerToken,
  getJupyterServerUrl,
  getJupyterServerToken,
} from '@datalayer/jupyter-react/core';
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
// Straight from its module: the components barrel re-exports the
// code-sandbox gallery and friends, none of which belong in the
// example gallery's first paint.
import { AgentSummary } from '../components/agents/AgentSummary';
import { HomeIcon, SignInIcon, SignOutIcon } from '@primer/octicons-react';
import {
  ActionList,
  ActionMenu,
  Button,
  SegmentedControl,
  Spinner,
  Text,
  TextInput,
} from '@primer/react';
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
  RUNTIME_TARGETS,
  runtimeTargetCapabilities,
  runtimeTargetStore,
  targetHasAgent,
  useRuntimeTargetStore,
  type ExampleRuntimeTarget,
} from './utils/runtimeTargetStore';
import { resolveExampleAgentRuntimesUrl } from './utils/useExampleAgentRuntimesUrl';
import { agentSummaryStore } from './utils/agentSummaryStore';
import { isSandboxOnlyExample } from './utils/exampleSurfaces';
import { useAgentSummaryStore } from './utils/agentSummaryStore';
import { useExampleThemeStore } from './utils/themeStore';
import HomeExample, { type HomeExampleCardEntry } from './HomeExample';
import { ExampleWrapper } from './components/ExampleWrapper';
import { ExampleErrorBoundary } from './components/ExampleErrorBoundary';
import { createServiceManagerFromAgentSandbox } from '../hooks/useAgentRuntimes';
import type { RuntimeEnvironmentDetails } from '../hooks/useAgentRuntimes';
import { useAgentRuntimes } from '../hooks/useAgentRuntimes';
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

const EXAMPLE_GROUP_ORDER = [
  'Loop',
  'A2UI',
  'AG-UI',
  'Agent',
  'Chat',
  'Document',
  'Notebook',
  'Cell',
  'CopilotKit',
] as const;

/**
 * The examples that open without an account.
 *
 * A list, not a rule: most examples here allocate a runtime somebody pays
 * for, and this one happens to run entirely in the visitor's browser. Adding
 * another is adding an id.
 */
const ANONYMOUS_EXAMPLES = new Set([
  'LoopWorkspaceExample',
  // Runs on the browser sandbox: nothing to allocate, nothing to sign into.
  'LoopShellExample',
  // Temporarily anonymous so the Jupyter output surface can be driven and
  // debugged without a session. Remove once that work is finished.
  'A2UiJupyterOutputExample',
  // The two page layouts, on the browser sandbox like the shell.
  'NotebookPageAgent',
  'DocumentPageAgent',
]);

const getExampleGroup = (id: string): string => {
  if (
    id === 'AgentspecsExample' ||
    id === 'AgentLoopExample' ||
    id === 'LoopWorkspaceExample' ||
    id === 'LoopShellExample'
  ) {
    return 'Loop';
  }
  if (id.startsWith('A2Ui')) return 'A2UI';
  if (id.startsWith('AgUi')) return 'AG-UI';
  if (id.startsWith('CopilotKit')) return 'CopilotKit';
  if (id.startsWith('Agent')) return 'Agent';
  if (id.startsWith('Chat')) return 'Chat';
  // The document examples: the ones on the Lexical editor, and the page
  // with a document on it.
  if (id.startsWith('Lexical') || id.startsWith('Document')) return 'Document';
  if (id.startsWith('Notebook')) return 'Notebook';
  return 'Cell';
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

type CloudSandboxBootstrap = {
  agentBaseUrl: string;
  agentId: string;
  ingress: string;
  runtimeEnvironment?: RuntimeEnvironmentDetails;
};

type TopNoticeTone =
  'default' | 'info' | 'success' | 'warning' | 'error' | 'danger';

interface TopNotice {
  id: number;
  message: string;
  details?: string;
  tone?: TopNoticeTone;
  durationMs?: number;
}

const resolveRuntimesUrl = (configured?: string): string => {
  const envRuntimeUrl = import.meta.env.VITE_DATALAYER_RUNTIMES_URL;
  const envBaseUrl = import.meta.env.VITE_DATALAYER_IAM_URL;
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

/**
 * Whether a URL names a Jupyter server on this machine.
 *
 * Asked this way round on purpose. The previous test was "is this prod1?",
 * which took every host it did not recognise for a local one — so once the
 * configured server moved to `r1`, Local mode accepted the cloud URL as its
 * own and the browser dialled it from `localhost`, where CORS refused it.
 *
 * The set of remote hosts is open — `prod1`, `r1`, whatever a deployment adds
 * next — while the set of local ones is not, so the closed set is the one
 * worth enumerating.
 */
const isLocalJupyterServerUrl = (value?: string | null): boolean => {
  if (!value) {
    return false;
  }
  let host: string;
  try {
    host = new URL(value).hostname.toLowerCase();
  } catch {
    return /(^|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?)([:/]|$)/.test(
      value,
    );
  }
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === '[::1]' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local')
  );
};

/**
 * The anonymous Jupyter server the `jupyter` target uses.
 *
 * The same one the jupyter-react examples point at: a real server, reachable
 * without an account, so an example can execute code with nothing installed
 * and nobody signed in. It is a sandbox and only a sandbox — no agent lives
 * there, which is why that target shows the chat switched off.
 */
const ANONYMOUS_JUPYTER_SERVER_URL =
  'https://prod1.datalayer.run/api/jupyter-server';
const ANONYMOUS_JUPYTER_SERVER_TOKEN =
  '60c1661cc408f978c309d04157af55c9588ff9557c9380e4fb50785750703da6';

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
  if (configured && isLocalJupyterServerUrl(configured)) {
    return normalizeLoopbackHost(configured);
  }
  return normalizeLoopbackHost(DEFAULT_LOCAL_JUPYTER_SERVER_URL);
};

/**
 * The one in-page JupyterLite manager, created at most once.
 *
 * A `LiteServer` registers a mock WebSocket server per kernel URL, so building
 * a second one on the same page throws `A mock server is already listening on
 * this url` and leaves the notebook without a kernel. Switching to Browser,
 * away, and back is an ordinary thing to do, so the manager is remembered
 * rather than rebuilt — which is what jupyter-react does behind `<Jupyter
 * lite>`, where it is created only `if (!serviceManager)`.
 *
 * The promise is cached, not the resolved value: a second switch arriving
 * mid-start awaits the same start instead of racing it into the same error.
 */
let browserServiceManager: Promise<ServiceManager.IManager> | null = null;

/** A sandbox in this page: JupyterLite over a Pyodide kernel, no server. */
const createBrowserServiceManager =
  async (): Promise<ServiceManager.IManager> => {
    // The in-page server is this page. Whichever target ran before left the
    // Jupyter base url pointing at its own server — `prod1`, or localhost —
    // and JupyterLite builds its kernel WebSocket addresses from that, so
    // without this the browser sandbox dials a remote host for a kernel that
    // only exists here.
    setJupyterServerUrl(window.location.origin);
    setJupyterServerToken('');

    browserServiceManager =
      browserServiceManager ??
      // JupyterLite and the Pyodide kernel are megabytes; a person who never
      // picks this target should not pay for them.
      import('@datalayer/jupyter-react')
        .then(({ createLiteServiceManager }) => createLiteServiceManager())
        .then(manager => manager as ServiceManager.IManager)
        .catch(error => {
          // A failed start must not be cached, or the target stays dead for
          // the rest of the session.
          browserServiceManager = null;
          throw error;
        });
    return browserServiceManager;
  };

/** A sandbox on the anonymous Jupyter server — real server, no account. */
const createAnonymousJupyterServiceManager =
  async (): Promise<ServiceManager.IManager> => {
    setJupyterServerUrl(ANONYMOUS_JUPYTER_SERVER_URL);
    setJupyterServerToken(ANONYMOUS_JUPYTER_SERVER_TOKEN);
    const serverSettings = createServerSettings(
      ANONYMOUS_JUPYTER_SERVER_URL,
      ANONYMOUS_JUPYTER_SERVER_TOKEN,
    );
    const manager = new ServiceManager({ serverSettings });
    await manager.ready;
    return manager;
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

      if (datalayerConfig.iamUrl) {
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
/**
 * Those examples, as cards.
 *
 * Module scope, not a `useMemo`: the list is a constant, and computing it in
 * the component put a hook after three early returns — so a render that took
 * one of them called fewer hooks than the render before it, which React
 * refuses outright. A value that never changes has no business being a hook.
 */
const ANONYMOUS_EXAMPLE_ENTRIES = getExampleEntriesList().filter(entry =>
  ANONYMOUS_EXAMPLES.has(entry.id),
);

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

        // Always try to create collaboration provider if we have token and spacerUrl
        if (configuration?.token && configuration?.spacerUrl) {
          try {
            const { DatalayerCollaborationProvider } =
              await import('../collaboration/DatalayerCollaborationProvider');
            const provider = new DatalayerCollaborationProvider({
              spacerUrl: configuration.spacerUrl,
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
          runtimeTargetStore.getState().target === 'datalayer' &&
          configuration?.token
        ) {
          try {
            const activeSummary = agentSummaryStore.getState().active;
            if (!activeSummary || activeSummary.location !== 'datalayer') {
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
          // Notebook-only mode has no agent of its own, but it still runs on
          // whichever sandbox the person picked.
          const target = runtimeTargetStore.getState().target;
          const manager =
            target === 'browser'
              ? await createBrowserServiceManager()
              : target === 'jupyter'
                ? await createAnonymousJupyterServiceManager()
                : await (async () => {
                    setJupyterServerUrl(resolveLocalJupyterServerUrl());
                    ensureLocalJupyterToken();
                    const serverSettings = createServerSettings(
                      getJupyterServerUrl(),
                      getJupyterServerToken(),
                    );
                    const local = new ServiceManager({ serverSettings });
                    await local.ready;
                    return local;
                  })();
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
  // The example on screen, readable from closures that were frozen at the
  // first render — see `createCloudServiceManager`.
  const selectedExampleRef = useRef(selectedExample);
  selectedExampleRef.current = selectedExample;
  const [searchQuery, setSearchQuery] = useState(getInitialSearchQuery());
  const [isChangingExample, setIsChangingExample] = useState(false);
  const [topNotice, setTopNotice] = useState<TopNotice | null>(null);
  const runtimeTarget = useRuntimeTargetStore(state => state.target);
  const setRuntimeTarget = useRuntimeTargetStore(state => state.setTarget);
  const shellRuntime = useAgentRuntimes({
    autoCreateAgent: false,
    runtimeCreationTarget: 'backend-services',
  });

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
      showTopNotice(
        `Failed to load example: ${e instanceof Error ? e.message : String(e)}`,
        'error',
        6000,
      );
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
      // Read, not captured: `createServiceManagerForTarget` is a `useCallback`
      // with no dependencies, so anything this closure takes from render scope
      // is frozen at the first render. Switching example and then switching
      // target would otherwise bootstrap a sandbox for whichever example was
      // on screen when the app started.
      const exampleId = selectedExampleRef.current;
      const { configuration } = coreStore.getState();
      if (!configuration?.token) {
        throw new Error(
          'Cloud runtime requires authentication. Please sign in.',
        );
      }

      const connectFromSummary = async (summary: {
        baseUrl: string;
        sandboxBaseUrl?: string;
        agentId?: string;
        runtimeEnvironment?: RuntimeEnvironmentDetails;
      }): Promise<ServiceManager.IManager> => {
        const connectOnce = async (candidate: {
          baseUrl: string;
          sandboxBaseUrl?: string;
          agentId?: string;
          runtimeEnvironment?: RuntimeEnvironmentDetails;
        }): Promise<ServiceManager.IManager> => {
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
          const cloudBaseUrl = String(
            manager.serverSettings.baseUrl || '',
          ).trim();
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
          const exampleSlug = safeExampleId(exampleId || 'example');
          const connection = await shellRuntime.launchRuntime({
            environmentName: DEFAULT_CLOUD_RUNTIME_ENVIRONMENT,
            givenName: `${exampleSlug}-sandbox`,
            creditsLimit: 5,
            type: 'notebook',
          });
          const agentId = `${exampleSlug}-cloud-agent`;
          const agent = await shellRuntime.createAgent({
            name: agentId,
            description: `Cloud sandbox agent for ${exampleId}`,
            agentLibrary: 'pydantic-ai',
            protocol: 'ag-ui',
            model: DEFAULT_MODEL,
            systemPrompt: 'You are a helpful AI assistant.',
          });
          const runtimeEnvironment: RuntimeEnvironmentDetails = {
            environmentName: connection.environmentName,
          };

          return {
            agentBaseUrl: connection.agentBaseUrl,
            agentId: agent.agentId || agentId,
            ingress: connection.jupyterBaseUrl,
            runtimeEnvironment,
          };
        };

      const activeSummary = agentSummaryStore.getState().active;
      if (
        activeSummary?.location === 'datalayer' &&
        (activeSummary.sandboxBaseUrl || activeSummary.baseUrl)
      ) {
        try {
          return await connectFromSummary({
            baseUrl: activeSummary.baseUrl,
            sandboxBaseUrl: activeSummary.sandboxBaseUrl,
            agentId: activeSummary.agentId,
            runtimeEnvironment: activeSummary.runtimeEnvironment,
          });
        } catch {
          // The published sandbox is gone or unreachable. A fresh one is
          // always allowed: an agent needs a runtime to run on, not a
          // particular kind of example to run in.
          showTopNotice(
            'Existing cloud sandbox is unavailable. Launching a fresh sandbox...',
            'warning',
            3500,
          );
        }
      }

      showTopNotice('Starting a cloud agent sandbox...', 'info', 2600);
      const launched = await bootstrapCloudSandbox();
      agentSummaryStore.getState().setActive({
        exampleId,
        agentName: launched.agentId,
        agentId: launched.agentId,
        location: 'datalayer',
        baseUrl: launched.agentBaseUrl,
        sandboxBaseUrl: launched.ingress,
        runtimeEnvironment: launched.runtimeEnvironment,
        status: 'running',
        isReady: true,
      });
      showTopNotice(
        `Cloud sandbox ready. Connecting ${toSurfaceLabel(exampleId)} to it...`,
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

  /**
   * The service manager for a target.
   *
   * The single place that knows what each of the four positions means. The
   * examples never see this: they read the target and what it offers, and the
   * shell hands them a connected manager.
   */
  const createServiceManagerForTarget = useCallback(
    async (target: ExampleRuntimeTarget): Promise<ServiceManager.IManager> => {
      switch (target) {
        case 'browser':
          return createBrowserServiceManager();
        case 'jupyter':
          return createAnonymousJupyterServiceManager();
        case 'datalayer':
          return createCloudServiceManager();
        case 'local':
        default:
          return createLocalServiceManager();
      }
    },
    // The factories close over stable setters and store reads; re-creating this
    // on every render would restart the sandbox on each keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    // Load configurations
    loadConfigurations();

    // Create service manager and load example - must be sequential
    const initializeApp = async () => {
      try {
        const runtimeTarget = runtimeTargetStore.getState().target;
        const capabilities = runtimeTargetCapabilities(runtimeTarget);

        try {
          const manager = await createServiceManagerForTarget(runtimeTarget);
          setServiceManager(manager);
          showTopNotice(
            `Code sandbox connected successfully (${capabilities.label.toLowerCase()}).`,
            'success',
            2600,
          );
          await loadExample(selectedExample, manager);
        } catch (error) {
          console.error(
            `Failed to create a service manager for ${runtimeTarget}:`,
            error,
          );
          // Local is the fallback because it needs neither an account nor the
          // network. Falling back to the target that just failed would only
          // fail again.
          showTopNotice(
            `${capabilities.label} unavailable, using local instead: ${
              error instanceof Error ? error.message : String(error)
            }`,
            'warning',
            5500,
          );
          setRuntimeTarget('local');
          const manager = await createLocalServiceManager();
          setServiceManager(manager);
          await loadExample(selectedExample, manager);
        }

        setLoading(false);
      } catch (e) {
        console.error('Failed to initialize app:', e);
        showTopNotice(
          `Failed to initialize app: ${e instanceof Error ? e.message : String(e)}`,
          'error',
          6000,
        );
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
    const currentTarget = runtimeTargetStore.getState().target;
    const activeRuntime = agentSummaryStore.getState().active;
    const agentBaseUrl =
      activeRuntime?.location === currentTarget && activeRuntime.baseUrl
        ? activeRuntime.baseUrl
        : resolveExampleAgentRuntimesUrl(currentTarget);
    const token = useSimpleAuthStore.getState().token;
    if (targetHasAgent(currentTarget)) {
      await teardownExampleAgents(agentBaseUrl, token ?? undefined);
    }

    // 3) Load and mount the new example.
    setSelectedExample(newExample);
    localStorage.setItem('selectedExample', newExample);
    await loadExample(newExample, serviceManager);
  };

  const handleRuntimeTargetChange = async (
    newTarget: ExampleRuntimeTarget,
  ): Promise<void> => {
    if (newTarget === runtimeTarget || !serviceManager) return;

    const previousManager = serviceManager;

    // 1) Unmount the current example FIRST so its cleanup hooks run against the
    //    still-valid OLD runtime (AG-UI disconnect, abort fetches, sandboxes).
    setIsChangingExample(true);
    setExampleComponent(null);
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => resolve());
    });

    // 2) Tear down the agents created on the OLD target, then wipe in-process
    //    agent state.
    const activeRuntime = agentSummaryStore.getState().active;
    const oldAgentBaseUrl =
      activeRuntime?.location === runtimeTarget && activeRuntime.baseUrl
        ? activeRuntime.baseUrl
        : resolveExampleAgentRuntimesUrl(runtimeTarget);
    const token = useSimpleAuthStore.getState().token;
    if (targetHasAgent(runtimeTarget)) {
      await teardownExampleAgents(oldAgentBaseUrl, token ?? undefined);
    }

    /*
     * 3) Only now build the new target's sandbox.
     *
     * The order matters and used to be the other way round. Creating the
     * manager first meant that for the cloud target — where building one
     * launches a runtime and registers an agent, writing them into the shared
     * `agentRuntimeStore` — the teardown above then wiped the runtime that had
     * just been created for the *new* target while cleaning up after the old
     * one. The example mounted with no runtime connected, could not create its
     * agent on one, and showed no chat at all.
     */
    let nextManager: ServiceManager.IManager;
    try {
      nextManager = await createServiceManagerForTarget(newTarget);
    } catch (switchError) {
      showTopNotice(
        `Failed to switch to ${newTarget}: ${
          switchError instanceof Error
            ? switchError.message
            : String(switchError)
        }`,
        'error',
        6000,
      );
      // Put the person back where they were. The example is already unmounted
      // and the old agents are gone, so the old target is re-entered from
      // scratch rather than left half-torn-down.
      await loadExample(selectedExample, previousManager);
      return;
    }

    // 4) Switch the target and re-mount the example (its key includes the
    //    target, so this connects to the runtime built above).
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
      anonymousExampleEntries={ANONYMOUS_EXAMPLE_ENTRIES}
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
  /** What the sign-in screen offers beside the form. */
  anonymousExampleEntries: HomeExampleCardEntry[];
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
  anonymousExampleEntries,
  onRuntimeTargetChange,
  availableExamples,
  topNotice,
  onDismissTopNotice,
}) => {
  const { colorMode, theme: themeVariant } = useExampleThemeStore();
  const runtimeTarget = useRuntimeTargetStore(state => state.target);
  const agentSummary = useAgentSummaryStore(state => state.active);
  // Some examples bring their own sandbox switch — the LOOP workspace has one
  // in its header. Two controls for one sandbox is one too many, and the
  // second would not agree with the first.
  const exampleOwnsSandboxControl = Boolean(
    availableExamples
      .find(entry => entry.id === selectedExample)
      ?.tags?.includes('owns-sandbox-control'),
  );
  const isHome = selectedExample === 'HomeExample';
  // The one example that describes its own agent — see the header below.
  const isLoopWorkspace = selectedExample === 'LoopWorkspaceExample';
  const cfg = themeConfigs[themeVariant];
  const logoColors = getLogoColors(themeVariant, colorMode);
  const { token, setAuth, clearAuth } = useSimpleAuthStore();
  const [showSignIn, setShowSignIn] = useState(false);
  const [exampleSearch, setExampleSearch] = useState('');
  /*
   * The sign-in screen stands aside for an example that needs no account.
   *
   * Without this the screen offered the Loop workspace as a card and then
   * stayed put when it was chosen: the example *was* selected, and nothing
   * rendered it, because `showSignIn` knows only that nobody is signed in.
   * Offering a way through and then not taking it is worse than not offering
   * it.
   */
  const shouldShowAuthScreen =
    showSignIn && !token && !ANONYMOUS_EXAMPLES.has(selectedExample);

  const selectedExampleEntry = availableExamples.find(
    example => example.id === selectedExample,
  );
  const exampleMenuGroups = useMemo(() => {
    const groups = new Map<string, ExampleEntry[]>();
    for (const example of availableExamples) {
      if (example.id === 'HomeExample') continue;
      const groupName = getExampleGroup(example.id);
      const group = groups.get(groupName) ?? [];
      group.push(example);
      groups.set(groupName, group);
    }
    for (const [groupName, examples] of groups) {
      examples.sort((left, right) => {
        if (groupName === 'Loop') {
          // The shells first, most naked first; then the loop that drives a
          // notebook; then the library of specs behind them all.
          const LOOP_ORDER = [
            'LoopShellExample',
            'LoopWorkspaceExample',
            'AgentLoopExample',
            'AgentspecsExample',
          ];
          const loopOrder = (id: string) => {
            const index = LOOP_ORDER.indexOf(id);
            return index === -1 ? LOOP_ORDER.length : index;
          };
          const order = loopOrder(left.id) - loopOrder(right.id);
          if (order !== 0) return order;
        }
        return left.title.localeCompare(right.title);
      });
    }
    return groups;
  }, [availableExamples]);
  const filteredExampleMenuGroups = useMemo(() => {
    const query = exampleSearch.trim().toLowerCase();
    if (!query) return exampleMenuGroups;
    const filtered = new Map<string, ExampleEntry[]>();
    for (const [groupName, examples] of exampleMenuGroups) {
      const matches = examples.filter(example =>
        example.title.toLowerCase().includes(query),
      );
      if (matches.length) filtered.set(groupName, matches);
    }
    return filtered;
  }, [exampleMenuGroups, exampleSearch]);

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
    const sandboxOnly = isSandboxOnlyExample(selectedExample);
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
      baseUrl: sandboxOnly ? '' : agentApiBaseUrl,
      sandboxBaseUrl: sandboxOnly ? jupyterSandboxBaseUrl : undefined,
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
              onClick={() => {
                // Also the way back out of the sign-in view, which nothing
                // else dismisses: with the example chooser hidden behind it,
                // a person who changed their mind would otherwise be stuck.
                setShowSignIn(false);
                void onExampleChange('HomeExample');
              }}
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
            {!shouldShowAuthScreen && (
              <ActionMenu>
                <ActionMenu.Button
                  disabled={isChangingExample}
                  aria-label="Select example"
                  sx={{ minWidth: '250px', justifyContent: 'space-between' }}
                  onClick={() => setExampleSearch('')}
                >
                  {selectedExampleEntry?.title ?? selectedExample}
                </ActionMenu.Button>
                <ActionMenu.Overlay
                  width="large"
                  sx={{
                    maxHeight: 'calc(100vh - 72px)',
                    overflowY: 'auto',
                    overscrollBehavior: 'contain',
                  }}
                >
                  <Box
                    sx={{
                      p: 2,
                      borderBottom: '1px solid',
                      borderColor: 'border.default',
                    }}
                  >
                    <TextInput
                      autoFocus
                      block
                      aria-label="Filter examples"
                      placeholder="Filter examples..."
                      value={exampleSearch}
                      onChange={event => setExampleSearch(event.target.value)}
                    />
                  </Box>
                  <ActionList selectionVariant="single">
                    {availableExamples
                      .filter(
                        example =>
                          example.id === 'HomeExample' &&
                          (!exampleSearch.trim() ||
                            example.title
                              .toLowerCase()
                              .includes(exampleSearch.trim().toLowerCase())),
                      )
                      .map(example => (
                        <ActionList.Item
                          key={example.id}
                          selected={example.id === selectedExample}
                          onSelect={() => void onExampleChange(example.id)}
                        >
                          {example.title}
                        </ActionList.Item>
                      ))}
                    <ActionList.Divider />
                    {EXAMPLE_GROUP_ORDER.map(groupName => {
                      const examples = filteredExampleMenuGroups.get(groupName);
                      if (!examples?.length) return null;
                      return (
                        <ActionList.Group key={groupName} title={groupName}>
                          {examples.map(example => (
                            <ActionList.Item
                              key={example.id}
                              selected={example.id === selectedExample}
                              onSelect={() => void onExampleChange(example.id)}
                            >
                              {example.title}
                            </ActionList.Item>
                          ))}
                        </ActionList.Group>
                      );
                    })}
                  </ActionList>
                </ActionMenu.Overlay>
              </ActionMenu>
            )}
            {!shouldShowAuthScreen && !exampleOwnsSandboxControl && (
              <Box
                aria-label="Where the example runs"
                sx={{
                  minWidth: '320px',
                  opacity: isHome || isChangingExample ? 0.6 : 1,
                }}
              >
                <SegmentedControl
                  aria-label="Where the example runs"
                  fullWidth
                  size="small"
                >
                  {RUNTIME_TARGETS.map(target => {
                    const capabilities = runtimeTargetCapabilities(target);
                    // Signing in is what the Datalayer target needs; saying so on
                    // the button beats letting the switch fail and explaining
                    // afterwards.
                    const needsSignIn = capabilities.requiresAuth && !token;
                    const unavailable = isHome || needsSignIn;
                    return (
                      <SegmentedControl.Button
                        key={target}
                        selected={runtimeTarget === target}
                        disabled={unavailable}
                        title={
                          needsSignIn
                            ? `${capabilities.hint} Sign in to use it.`
                            : capabilities.hint
                        }
                        onClick={() => {
                          if (!unavailable && !isChangingExample) {
                            void onRuntimeTargetChange(target);
                          }
                        }}
                      >
                        {capabilities.label}
                      </SegmentedControl.Button>
                    );
                  })}
                </SegmentedControl>
              </Box>
            )}
            {/*
              Not for the Loop workspace, which draws its own.

              This shell keeps one summary for the example on screen, which is
              right while an example *is* an agent. The workspace is not: the
              agent it addresses is chosen inside it and can change without
              this page knowing, so the summary here described a session it
              could not see — beside a header that described the real one.
            */}
            {!isHome && !shouldShowAuthScreen && !isLoopWorkspace && (
              <AgentSummary summary={agentSummary} />
            )}
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
            /*
              Signing in, beside what can be seen without it.
              
              A sign-in screen on its own says only "not yet". Most of these
              examples do need an account — they allocate runtimes somebody
              pays for — but the Loop workspace runs entirely in the page, so
              putting it here turns a closed door into a choice: sign in for
              the rest, or try this one now.
            */
            <Box
              sx={{
                width: '100%',
                height: '100%',
                bg: 'canvas.backdrop',
                p: 3,
                overflow: 'auto',
              }}
            >
              <Box
                sx={{
                  display: 'grid',
                  // Stacked on a narrow window, sign-in first: it is what the
                  // reader came here for, and a column of cards above the form
                  // would bury it.
                  gridTemplateColumns: ['1fr', '1fr', '440px minmax(0, 1fr)'],
                  gap: 4,
                  maxWidth: 1400,
                  mx: 'auto',
                  alignItems: 'start',
                }}
              >
                <SignInSimple
                  onSignIn={handleHeaderSignIn}
                  onApiKeySignIn={apiKey =>
                    handleHeaderSignIn(apiKey, 'api-key-user')
                  }
                  title="Agent Runtimes Examples"
                  description="Sign in to run authenticated examples and tools."
                  leadingIcon={<HomeIcon size={24} />}
                  // Level with the cards beside it. Left to itself the form
                  // centres in `100vh`, which put it half a screen below the
                  // column it shares a row with.
                  fillHeight={false}
                />
                {/* The home page's own card grid, given a shorter list. Reused
                    rather than reimplemented so an example added here looks
                    the same on both sides of the sign-in. */}
                <Box
                  sx={{
                    border: '1px solid',
                    borderColor: 'border.default',
                    borderRadius: 2,
                    overflow: 'hidden',
                    bg: 'canvas.default',
                  }}
                >
                  <HomeExample
                    examples={anonymousExampleEntries}
                    searchQuery=""
                    onSelectExample={name => void onExampleChange(name)}
                  />
                </Box>
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
