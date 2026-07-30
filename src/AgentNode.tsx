/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  DatalayerLogoText,
  DatalayerThemeProvider,
  getLogoColors,
  setupPrimerPortals,
  themeConfigs,
} from '@datalayer/primer-addons';
import { AppearanceControlsWithStore } from '@datalayer/primer-addons/lib/components/appearance';
import {
  ActionList,
  ActionMenu,
  Avatar,
  Box,
  Button,
  FormControl,
  Heading,
  Label,
  PageHeader,
  PageLayout,
  Text,
} from '@primer/react';
import {
  CommentIcon,
  HomeIcon,
  KeyAsteriskIcon,
  LockIcon,
  MoonIcon,
  PeopleIcon,
  PersonIcon,
  GearIcon,
  RocketIcon,
  SignOutIcon,
  type Icon as OcticonIcon,
} from '@primer/octicons-react';
import { SignInSimple } from '@datalayer/core/lib/views/iam';
import { UserBadge } from '@datalayer/core/lib/views/profile';
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { useIAMStore } from '@datalayer/core/lib/state';
import {
  BillingEntitySelect,
  type BillingEntity,
} from '@datalayer/core/lib/components/billing';
import { ShareAccessComponent } from '@datalayer/core/lib/components/sharing';
import { useAgentNodeThemeStore } from './agent-node/themeStore';
import { AgentNodeGallery } from './agent-node/AgentNodeGallery';
import { Chat } from './chat';
import type { EphemeralRuntimeOverride } from './chat/notebook/EphemeralNotebook';
import type { Suggestion } from './types/chat';
import { DatalayerCollaborationProvider } from './collaboration';

import '../style/primer-primitives.css';

setupPrimerPortals();

const AGENT_RUNTIMES_BASE_URL = (
  import.meta.env.VITE_DATALAYER_AGENT_RUNTIMES_URL ||
  import.meta.env.VITE_BASE_URL ||
  window.location.origin
).replace(/\/$/, '');

/**
 * LOCAL Jupyter sandbox endpoint shared by the node's agent and the chat's
 * ephemeral notebook/document surfaces. When set (node-local dev, injected via
 * `VITE_JUPYTER_SANDBOX_URL`), the surfaces bind their kernel straight to this
 * Jupyter server — no proxy or tunnel — exactly like `NotebookAgentExample`.
 * Parsed once into a clean base URL + token for `ServerConnection`.
 */
const LOCAL_JUPYTER_SANDBOX = (() => {
  const raw = String(import.meta.env.VITE_JUPYTER_SANDBOX_URL || '').trim();
  if (!raw) {
    return undefined;
  }
  try {
    const url = new URL(raw);
    const token = url.searchParams.get('token') || undefined;
    url.searchParams.delete('token');
    const baseUrl = `${url.origin}${url.pathname}`.replace(/\/$/, '');
    return { baseUrl, token };
  } catch {
    return { baseUrl: raw.replace(/\/$/, ''), token: undefined };
  }
})();

const DEFAULT_DATALAYER_URL = 'https://prod1.datalayer.run';

/**
 * localStorage key recording that the user explicitly signed out. When set, the
 * UI must not silently re-authenticate from the env-supplied DATALAYER_API_KEY
 * via /auth/bootstrap, so the sign-out survives a page refresh.
 */
const AUTO_BOOTSTRAP_DISABLED_KEY = 'agent-node-auto-bootstrap-disabled';

/** Persist (or clear) the signed-out intent in localStorage. */
function setAutoBootstrapDisabled(disabled: boolean): void {
  try {
    if (disabled) {
      window.localStorage.setItem(AUTO_BOOTSTRAP_DISABLED_KEY, 'true');
    } else {
      window.localStorage.removeItem(AUTO_BOOTSTRAP_DISABLED_KEY);
    }
  } catch {
    // Ignore storage failures (private mode, disabled storage, etc.).
  }
}

/**
 * Read a service URL from the server-injected `datalayer-config-data` script
 * tag. The agent-runtimes Python server injects this tag (populated from the
 * `DATALAYER_*_URL` environment variables, e.g. from `plane local`) when it
 * serves the built agent pages. Reading it at runtime lets the node target the
 * configured services (IAM, runtimes, ...) instead of the build-time-baked
 * `VITE_DATALAYER_URL`, which defaults to production because `make build` runs
 * without the local environment.
 */
const getConfigUrlFromDocument = (
  ...keys: string[]
): string | undefined => {
  if (typeof document === 'undefined') {
    return undefined;
  }
  const el = document.getElementById('datalayer-config-data');
  if (!el?.textContent) {
    return undefined;
  }
  try {
    const config = JSON.parse(el.textContent);
    for (const key of keys) {
      const value = config?.[key];
      if (typeof value === 'string' && value.trim()) {
        return value.replace(/\/$/, '');
      }
    }
  } catch {
    // Ignore malformed config; fall back to env / default.
  }
  return undefined;
};

/** Resolve the base Datalayer URL: injected config → VITE env → production. */
const resolveDatalayerUrl = (): string =>
  getConfigUrlFromDocument('datalayerUrl', 'iamUrl') ||
  (import.meta as any).env?.VITE_DATALAYER_URL ||
  DEFAULT_DATALAYER_URL;

/** Resolve the runtimes URL: injected config → VITE env → base Datalayer URL. */
const resolveRuntimesUrl = (): string =>
  getConfigUrlFromDocument('runtimesUrl') ||
  (import.meta as any).env?.VITE_DATALAYER_RUNTIMES_URL ||
  resolveDatalayerUrl();

/** Resolve the spacer URL: injected config → VITE env → base Datalayer URL. */
const resolveSpacerUrl = (): string =>
  getConfigUrlFromDocument('spacerUrl') ||
  (import.meta as any).env?.VITE_DATALAYER_SPACER_URL ||
  resolveDatalayerUrl();


type AgentNodeMode = 'private' | 'shared' | 'sleep';
type Step = 'auth' | 'config' | 'gallery' | 'chat' | 'profile';

type ModeCard = {
  mode: AgentNodeMode;
  name: string;
  description: string;
  Icon: OcticonIcon;
};

const MODE_CARDS: readonly ModeCard[] = [
  {
    mode: 'private',
    name: 'Private',
    description:
      'Only you can use this Agent Node. Chat can be done directly from this node or from any supported Datalayer platform such as SaaS, VS Code, JupyterLab, or CLI.',
    Icon: LockIcon,
  },
  {
    mode: 'shared',
    name: 'Shared',
    description:
      'Allowed users can consume chat from any supported Datalayer platform such as SaaS, VS Code, JupyterLab, or CLI.',
    Icon: PeopleIcon,
  },
  {
    mode: 'sleep',
    name: 'Sleep',
    description:
      'The Agent Node stays registered and visible but does not accept new chat sessions. Existing sessions are not resumed until you switch back to Private or Shared.',
    Icon: MoonIcon,
  },
];

type AgentNodeConfiguration = {
  mode: AgentNodeMode;
  node_uid?: string;
  billing_entity_uid?: string;
  billing_entity_type?: string;
  billing_entity_handle?: string;
  sharing: Record<string, any>;
  active_agent_id?: string;
  collaboration_notebook_uid?: string;
  collaboration_document_uid?: string;
  deployment_target?: 'localhost' | 'aws' | 'other';
  chat_access_mode?: 'local_and_saas' | 'saas_only';
  aws_account_id?: string;
  aws_region?: string;
  aws_identity_arn?: string;
};

const DEFAULT_CONFIGURATION: AgentNodeConfiguration = {
  mode: 'sleep',
  sharing: {},
};

type InferenceProvider = 'local' | 'datalayer';

type InferenceModelSpec = {
  id: string;
  name?: string;
  description?: string;
  default?: boolean;
};

type InferenceModelResponse = {
  provider?: string;
  default_model?: string;
  models?: string[];
  bedrock_anthropic_models?: string[];
  bedrock_anthropic_model_specs?: InferenceModelSpec[];
};

/**
 * Profile view rendered inside AgentNode when the user picks "Profile" from
 * the header menu. Mirrors the shape of `ui/src/views/profile/UserProfileBase`
 * but assembled exclusively from core building blocks so agent-runtimes does
 * not pull in the `ui` package.
 */
function AgentNodeProfileView({
  token,
  onTokenExpired,
}: {
  token: string | null;
  onTokenExpired?: () => void;
}) {
  const user = useIAMStore(state => state.user);

  const display = useMemo(() => {
    if (!user) return null;
    const u = user as any;
    const displayName =
      [u.first_name, u.last_name].filter(Boolean).join(' ').trim() ||
      u.display_name ||
      u.name ||
      u.handle ||
      u.email ||
      'Datalayer user';
    const username =
      u.username || u.handle || (u.email ? String(u.email).split('@')[0] : '');
    const initials =
      u.initials ||
      String(displayName)
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part: string) => part[0]?.toUpperCase() || '')
        .join('');
    return {
      id: String(u.id || u.uid || ''),
      username,
      displayName,
      initials,
      origin: String(u.origin || 'datalayer'),
      handle: u.handle ? `@${u.handle}` : '',
      email: u.email || '',
      avatarUrl: u.avatar_url || u.profile?.avatar_url || '',
      roles: Array.isArray(u.roles) ? (u.roles as string[]) : [],
    };
  }, [user]);

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'border.default',
        borderRadius: 2,
        p: 4,
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
      }}
    >
      {!token ? (
        <Text sx={{ color: 'fg.muted' }}>Sign in to view your profile.</Text>
      ) : !display ? (
        <Text sx={{ color: 'fg.muted' }}>Loading profile…</Text>
      ) : (
        <>
          <Heading sx={{ fontSize: 2, mb: 2 }}>Identity</Heading>
          <Box sx={{ textAlign: 'left' }}>
            <UserBadge
              token={token}
              variant="small"
              onTokenExpired={onTokenExpired}
            />
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            {display.avatarUrl ? (
              <Avatar
                src={display.avatarUrl}
                size={72}
                alt={display.displayName}
              />
            ) : (
              <Box
                sx={{
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  bg: 'canvas.subtle',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'fg.muted',
                }}
              >
                <PersonIcon size={30} />
              </Box>
            )}
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              <Heading sx={{ fontSize: 3, mb: 1 }}>
                {display.displayName}
              </Heading>
              {display.handle && (
                <Text sx={{ color: 'fg.muted' }}>{display.handle}</Text>
              )}
              {display.email && (
                <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
                  {display.email}
                </Text>
              )}
            </Box>
          </Box>
          {display.id && (
            <Box sx={{ mt: 2 }}>
              <Label size="large" variant="secondary">
                {display.id}
              </Label>
            </Box>
          )}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: '1fr 2fr',
              rowGap: 2,
              columnGap: 3,
              maxWidth: 560,
            }}
          >
            <Text sx={{ fontWeight: 'bold' }}>Username</Text>
            <Text>{display.username || '-'}</Text>
            <Text sx={{ fontWeight: 'bold' }}>Display name</Text>
            <Text>{display.displayName || '-'}</Text>
            <Text sx={{ fontWeight: 'bold' }}>Initials</Text>
            <Text>{display.initials || '-'}</Text>
            <Text sx={{ fontWeight: 'bold' }}>Origin</Text>
            <Text>{display.origin || '-'}</Text>
          </Box>
          {display.roles.length > 0 && (
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {display.roles.map(role => (
                <Label key={role} size="small" variant="secondary">
                  {role}
                </Label>
              ))}
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

export function AgentNode() {
  const { token, setAuth, clearAuth } = useSimpleAuthStore();
  const tokenForCore = token ?? undefined;
  const signInLoginUrl = `${resolveDatalayerUrl()}/api/iam/v1/login`;
  const queryClient = useQueryClient();
  const iamUser = useIAMStore(state => state.user);
  const { colorMode, theme: themeVariant } = useAgentNodeThemeStore();

  const cfg = themeConfigs[themeVariant];
  const logoColors = getLogoColors(themeVariant, colorMode);
  const resolvedMode: 'light' | 'dark' =
    colorMode === 'auto'
      ? typeof window !== 'undefined' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : colorMode === 'dark'
        ? 'dark'
        : 'light';
  const authGradient = cfg.cardGradient[resolvedMode];

  const [step, setStep] = useState<Step>('auth');
  const [selectedAgentId, setSelectedAgentId] = useState<string>('default');
  // Persisted across refreshes: once the user explicitly signs out we must
  // not silently re-authenticate them from the env-supplied DATALAYER_API_KEY
  // via /auth/bootstrap. Initialise from localStorage so the intent survives a
  // page reload (React state alone resets to false on refresh).
  const [disableAutoBootstrap, setDisableAutoBootstrap] = useState<boolean>(
    () => {
      try {
        return (
          window.localStorage.getItem(AUTO_BOOTSTRAP_DISABLED_KEY) === 'true'
        );
      } catch {
        return false;
      }
    },
  );
  const [configuration, setConfiguration] = useState<AgentNodeConfiguration>(
    DEFAULT_CONFIGURATION,
  );
  const [, setSelectedBillingEntity] = useState<BillingEntity | undefined>(
    undefined,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Ephemeral notebook RTC (shared room with the SaaS UI) ───────────────
  // The node provisions a spacer notebook room on registration and stores its
  // uid in the configuration. When present, both the node-local chat and the
  // SaaS gallery view join that room so the agent's notebook edits transit via
  // RTC instead of the tunnel. Absent (e.g. before sign-in) the ephemeral
  // notebook stays in-memory, unchanged.
  const ephemeralCollaborationDocumentId =
    token && configuration.collaboration_notebook_uid
      ? configuration.collaboration_notebook_uid
      : undefined;
  const ephemeralNotebookCollaborationProvider = useMemo(() => {
    if (!ephemeralCollaborationDocumentId || !token) {
      return undefined;
    }
    const spacerUrl = resolveSpacerUrl();
    return new DatalayerCollaborationProvider({
      datalayerUrl: spacerUrl,
      token,
    });
  }, [ephemeralCollaborationDocumentId, token]);

  // ── Ephemeral document RTC (shared Lexical/Loro room with the SaaS UI) ────
  // The node provisions a spacer *lexical* room (distinct from the notebook
  // room) on registration and stores its uid as `collaboration_document_uid`.
  // Both peers join that Loro room over the spacer lexical WebSocket. The token
  // is embedded in the ws URL (createWebsocketProvider forwards it as a query
  // param) so the spacer authenticates the connection.
  const collaborationDocumentUser = useIAMStore(state => state.user) as
    | Record<string, any>
    | null
    | undefined;
  const ephemeralDocumentCollaboration = useMemo(() => {
    const documentRoomId = configuration.collaboration_document_uid;
    if (!token || !documentRoomId) {
      return undefined;
    }
    const spacerUrl = resolveSpacerUrl();
    const wsSpacer = String(spacerUrl).replace(/^http/, 'ws');
    const websocketUrl = `${wsSpacer}/api/spacer/v1/lexical/ws?token=${encodeURIComponent(
      token,
    )}`;
    const u = collaborationDocumentUser;
    return {
      websocketUrl,
      roomId: documentRoomId,
      identity: u
        ? {
            userId: u.uid,
            handle: u.handle,
            displayName: u.displayName,
            initials: u.initials,
            avatarUrl: u.avatarUrl,
          }
        : undefined,
    };
  }, [configuration.collaboration_document_uid, token, collaborationDocumentUser]);

  const [inferenceProvider, setInferenceProvider] =
    useState<InferenceProvider>('datalayer');
  const [inferenceModels, setInferenceModels] = useState<string[]>([]);
  const [inferenceDefaultModel, setInferenceDefaultModel] = useState<
    string | null
  >(null);
  const [configurationLoaded, setConfigurationLoaded] = useState(false);
  const chatRestoreAttemptRef = useRef<string>('');
  const hasActiveAgent = Boolean(
    String(configuration.active_agent_id || '').trim(),
  );
  const isSaasOnlyChat =
    configuration.chat_access_mode === 'saas_only' ||
    configuration.deployment_target === 'aws';

  // ── Local sandbox runtime override for the ephemeral surfaces ─────────────
  // In the node-local webapp the agent's Jupyter sandbox is a LOCAL server, not
  // a Kubernetes pod resolvable by `pod_name`, so the ephemeral notebook and
  // document surfaces cannot bind their kernel through the runtimes pod lookup.
  // Instead we read the live sandbox Jupyter endpoint from `/health/startup`
  // and pass it as an explicit override so the surfaces connect a service
  // manager straight to the sandbox kernel. This is what makes the surfaces
  // actually render and the chat header's kernel indicator reflect the sandbox
  // kernel (rather than the browser/Pyodide placeholder).
  const [sandboxRuntimeOverride, setSandboxRuntimeOverride] = useState<
    EphemeralRuntimeOverride | undefined
  >(undefined);
  // Environment name shown in the chat header's kernel indicator details, so
  // it reads e.g. "Local Agent Sandbox (python3)" instead of the indicator's
  // generic "browser-runtime" placeholder once the local sandbox is bound.
  const [sandboxEnvironmentName, setSandboxEnvironmentName] = useState<
    string | undefined
  >(undefined);
  useEffect(() => {
    const selected = String(selectedAgentId || '').trim();
    if (step !== 'chat' || !selected || selected === 'default') {
      setSandboxRuntimeOverride(undefined);
      setSandboxEnvironmentName(undefined);
      return;
    }

    // Fast path: in node-local dev the agent's Jupyter sandbox is a LOCAL
    // server whose URL/token are known up front (VITE_JUPYTER_SANDBOX_URL).
    // Bind the ephemeral surfaces straight to it — no /health/startup polling,
    // no proxy, no tunnel — mirroring NotebookAgentExample.
    if (LOCAL_JUPYTER_SANDBOX?.baseUrl) {
      setSandboxEnvironmentName('Local Agent Sandbox');
      setSandboxRuntimeOverride(prev => {
        if (
          prev?.baseUrl === LOCAL_JUPYTER_SANDBOX.baseUrl &&
          (prev?.token || '') === (LOCAL_JUPYTER_SANDBOX.token || '')
        ) {
          return prev;
        }
        return {
          baseUrl: LOCAL_JUPYTER_SANDBOX.baseUrl,
          token: LOCAL_JUPYTER_SANDBOX.token || undefined,
          podName: 'agent-node-sandbox',
        };
      });
      return;
    }

    let cancelled = false;
    let intervalId: number | null = null;

    const stopPolling = () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    const poll = async () => {
      try {
        const resp = await fetch(`${AGENT_RUNTIMES_BASE_URL}/health/startup`);
        if (!resp.ok) {
          return;
        }
        const payload = await resp.json();
        const sandbox = payload?.sandbox;
        const jupyterUrl = String(sandbox?.jupyter_url || '').trim();
        if (sandbox?.variant !== 'jupyter' || !jupyterUrl) {
          return;
        }
        const jupyterToken = String(sandbox?.jupyter_token || '').trim();
        if (cancelled) {
          return;
        }
        const kernelName = String(sandbox?.kernel_name || '').trim();
        setSandboxEnvironmentName(
          kernelName
            ? `Local Agent Sandbox (${kernelName})`
            : 'Local Agent Sandbox',
        );
        setSandboxRuntimeOverride(prev => {
          if (
            prev?.baseUrl === jupyterUrl &&
            (prev?.token || '') === jupyterToken
          ) {
            return prev;
          }
          return {
            baseUrl: jupyterUrl,
            token: jupyterToken || undefined,
            podName: 'agent-node-sandbox',
          };
        });
        // Endpoint resolved — stop the fast poll.
        stopPolling();
      } catch {
        // Sandbox not ready yet; keep polling.
      }
    };

    void poll();
    intervalId = window.setInterval(() => {
      void poll();
    }, 2000);

    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [step, selectedAgentId]);

  // ── Agent spec info for the chat header (title/description/suggestions) ──
  // Mirrors the `ui` runtime chat view: the chat header shows the agent spec's
  // display name and welcome message, and the empty state offers the spec's
  // suggested prompts. The node-local agent is launched from a library spec
  // whose id is used as the agent id (see AgentNodeGallery `launch`), so the
  // spec is looked up by that same id via `GET /api/v1/agents/library/{id}`.
  const [agentSpecInfo, setAgentSpecInfo] = useState<{
    name?: string;
    description?: string;
    welcomeMessage?: string;
    suggestions?: string[];
  } | null>(null);
  useEffect(() => {
    const agentId = String(selectedAgentId || '').trim();
    if (step !== 'chat' || !agentId || agentId === 'default') {
      setAgentSpecInfo(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(
          `${AGENT_RUNTIMES_BASE_URL}/api/v1/agents/library/${encodeURIComponent(agentId)}`,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          },
        );
        if (!resp.ok) {
          if (!cancelled) {
            setAgentSpecInfo(null);
          }
          return;
        }
        const spec = await resp.json().catch(() => null);
        if (cancelled || !spec) {
          return;
        }
        setAgentSpecInfo({
          name: typeof spec.name === 'string' ? spec.name : undefined,
          description:
            typeof spec.description === 'string' ? spec.description : undefined,
          welcomeMessage:
            typeof spec.welcomeMessage === 'string'
              ? spec.welcomeMessage
              : typeof spec.welcome_message === 'string'
                ? spec.welcome_message
                : undefined,
          suggestions: Array.isArray(spec.suggestions)
            ? spec.suggestions.filter((s: unknown) => typeof s === 'string')
            : undefined,
        });
      } catch {
        if (!cancelled) {
          setAgentSpecInfo(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, selectedAgentId, token]);

  const chatTitle = agentSpecInfo?.name || 'Agent Node Chat';
  const chatDescription =
    agentSpecInfo?.welcomeMessage || agentSpecInfo?.description || 'Node-local chat';
  const chatSuggestions: Suggestion[] | undefined =
    agentSpecInfo?.suggestions && agentSpecInfo.suggestions.length > 0
      ? agentSpecInfo.suggestions.map(s => ({ title: s, message: s }))
      : undefined;

  type BannerKind = 'success' | 'info' | 'warning' | 'error';
  type BannerState = { id: number; kind: BannerKind; message: string };
  const [banner, setBanner] = useState<BannerState | null>(null);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showBanner = useCallback((kind: BannerKind, message: string) => {
    if (bannerTimerRef.current) {
      clearTimeout(bannerTimerRef.current);
      bannerTimerRef.current = null;
    }
    const id = Date.now();
    setBanner({ id, kind, message });
    const duration = kind === 'error' ? 6000 : 3500;
    bannerTimerRef.current = setTimeout(() => {
      setBanner(current => (current && current.id === id ? null : current));
      bannerTimerRef.current = null;
    }, duration);
  }, []);
  useEffect(() => {
    return () => {
      if (bannerTimerRef.current) {
        clearTimeout(bannerTimerRef.current);
      }
    };
  }, []);

  const pushCredentials = useCallback(
    (authToken: string | null, payloadToken: string | null = authToken) => {
      const runtimesUrl = resolveRuntimesUrl();

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
      }

      return fetch(`${AGENT_RUNTIMES_BASE_URL}/api/v1/agent-node/credentials`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          token: payloadToken || null,
          runtimes_url: payloadToken ? runtimesUrl : null,
        }),
      });
    },
    [],
  );

  // Refs kept in sync with state so the BillingEntitySelect callbacks
  // (passed via stable identities) can read the latest values without
  // being re-created on every render — re-created callbacks made
  // BillingEntitySelect re-fire onAccountsResolved and trigger an
  // infinite setState loop.
  const configurationRef = useRef(configuration);
  useEffect(() => {
    configurationRef.current = configuration;
  }, [configuration]);
  const iamUserRef = useRef(iamUser);
  useEffect(() => {
    iamUserRef.current = iamUser;
  }, [iamUser]);

  const handleBillingEntityChange = useCallback((uid: string) => {
    setConfiguration(prev => ({ ...prev, billing_entity_uid: uid }));
  }, []);

  const handleSelectedAccountChange = useCallback(
    (account: BillingEntity | undefined) => {
      setSelectedBillingEntity(account);
      setConfiguration(prev => ({
        ...prev,
        billing_entity_type: account?.accountType,
        billing_entity_handle: account?.accountHandle,
      }));
    },
    [],
  );

  const handleAccountsResolved = useCallback(
    (_state: {
      accounts: BillingEntity[];
      eligibleAccounts: BillingEntity[];
      isLoading: boolean;
      hasEligibleAccount: boolean;
    }) => {
      // BillingEntitySelect persists the chosen account in a cookie and
      // falls back to the personal account when none is stored, so the node
      // no longer needs to force an organization default here.
    },
    [],
  );

  const handleSharingInlineClose = useCallback(() => {
    // Inline mode has no close action, but the prop is required.
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(
          `${AGENT_RUNTIMES_BASE_URL}/api/v1/agent-node/configuration`,
        );
        if (!response.ok) {
          setConfigurationLoaded(true);
          return;
        }
        const payload = await response.json();
        const loadedConfiguration = {
          ...DEFAULT_CONFIGURATION,
          ...(payload?.configuration || {}),
        };
        setConfiguration(loadedConfiguration);
        if (loadedConfiguration.active_agent_id) {
          setSelectedAgentId(loadedConfiguration.active_agent_id);
        }
      } catch {
        // Ignore initial-load failures in local development.
      } finally {
        setConfigurationLoaded(true);
      }
    };
    load();
  }, []);

  useEffect(() => {
    const loadInferenceProvider = async () => {
      try {
        const response = await fetch(
          `${AGENT_RUNTIMES_BASE_URL}/api/v1/configure/inference/provider`,
        );
        if (!response.ok) {
          return;
        }
        const payload = await response.json();
        const provider = payload?.provider;
        if (provider === 'local' || provider === 'datalayer') {
          setInferenceProvider(provider);
        }
      } catch {
        // Ignore initial-load failures in local development.
      }
    };
    loadInferenceProvider();
  }, []);

  useEffect(() => {
    if (inferenceProvider !== 'datalayer') {
      setInferenceModels([]);
      setInferenceDefaultModel(null);
      return;
    }
    const loadInferenceModels = async () => {
      try {
        const response = await fetch(
          `${AGENT_RUNTIMES_BASE_URL}/api/v1/configure/inference/models`,
        );
        if (!response.ok) {
          setInferenceModels([]);
          setInferenceDefaultModel(null);
          return;
        }
        const payload: InferenceModelResponse = await response.json();
        const fromModels = Array.isArray(payload.models)
          ? payload.models.filter(Boolean)
          : [];
        const fromBedrock = Array.isArray(payload.bedrock_anthropic_models)
          ? payload.bedrock_anthropic_models.filter(Boolean)
          : [];
        const fallback = [
          'bedrock/us.anthropic.claude-3-5-sonnet-20240620-v1:0',
          'bedrock/us.anthropic.claude-3-7-sonnet-20250219-v1:0',
          'bedrock/us.anthropic.claude-sonnet-4-20250514-v1:0',
        ];
        const models =
          fromModels.length > 0
            ? fromModels
            : fromBedrock.length > 0
              ? fromBedrock
              : fallback;
        setInferenceModels(models);
        const specDefault = Array.isArray(payload.bedrock_anthropic_model_specs)
          ? payload.bedrock_anthropic_model_specs.find(s => s?.default)?.id
          : undefined;
        const selected =
          (specDefault && models.includes(specDefault) ? specDefault : null) ||
          (payload.default_model && models.includes(payload.default_model)
            ? payload.default_model
            : null) ||
          models[0] ||
          null;
        setInferenceDefaultModel(selected);
      } catch {
        setInferenceModels([]);
        setInferenceDefaultModel(null);
      }
    };
    loadInferenceModels();
  }, [inferenceProvider]);

  // If the container was started with DATALAYER_API_KEY, the backend exchanges
  // it for a session token via /auth/bootstrap so the UI can skip sign-in.
  useEffect(() => {
    if (token) {
      return;
    }
    if (disableAutoBootstrap) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(
          `${AGENT_RUNTIMES_BASE_URL}/api/v1/agent-node/auth/bootstrap`,
        );
        if (!resp.ok) {
          return;
        }
        const data = await resp.json().catch(() => ({}));
        if (cancelled) {
          return;
        }
        if (data?.has_key && data?.token) {
          setAuth(String(data.token), String(data.handle || 'api-key-user'));
          setStep('gallery');
        }
      } catch {
        // Best-effort; fall back to the sign-in screen.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, setAuth, disableAutoBootstrap]);

  // Push the authenticated user's bearer token + runtimes base URL to the
  // local Agent Node backend so the background sync can register the node
  // and start sending heartbeats/health to the central runtimes service.
  useEffect(() => {
    if (!token) {
      return;
    }
    pushCredentials(token, token).catch(() => {
      // Best-effort; backend may not be reachable in some local setups.
    });
  }, [token, pushCredentials]);

  useEffect(() => {
    import('@datalayer/core/lib/state').then(({ iamStore, coreStore }) => {
      const datalayerUrl = resolveDatalayerUrl();
      const runtimesUrl = resolveRuntimesUrl();
      const aiInferenceUrl =
        getConfigUrlFromDocument('aiInferenceUrl') ||
        (import.meta as any).env?.VITE_DATALAYER_AI_INFERENCE_URL ||
        datalayerUrl;
      // Seed all per-service URLs to match the main UI login behavior.
      const coreApi = coreStore.getState() as any;
      const prevCfg = coreApi.configuration ?? {};
      const urls = {
        iamUrl: datalayerUrl,
        runtimesUrl,
        spacerUrl: datalayerUrl,
        libraryUrl: datalayerUrl,
        aiAgentsUrl: datalayerUrl,
        aiInferenceUrl: aiInferenceUrl,
        mcpServersUrl: datalayerUrl,
        otelUrl: datalayerUrl,
        growthUrl: datalayerUrl,
        successUrl: datalayerUrl,
        supportUrl: datalayerUrl,
      };
      if (typeof coreApi.setConfiguration === 'function') {
        coreApi.setConfiguration({ ...prevCfg, ...urls });
      } else {
        coreStore.setState((s: any) => ({
          configuration: { ...(s.configuration || {}), ...urls },
        }));
      }

      const api = iamStore.getState() as any;
      iamStore.setState({ token: tokenForCore, iamUrl: datalayerUrl } as any);
      if (tokenForCore && typeof api.refreshUserByToken === 'function') {
        void Promise.resolve(api.refreshUserByToken(tokenForCore)).then(() => {
          queryClient.invalidateQueries({ queryKey: ['organizations'] });
          queryClient.invalidateQueries({ queryKey: ['subscription'] });
        });
      }
    });
  }, [tokenForCore, queryClient]);

  useEffect(() => {
    if (!token && step !== 'auth') {
      setStep('auth');
    }
  }, [token, step]);

  useEffect(() => {
    if (!token || !configurationLoaded) {
      return;
    }
    const activeAgentId = (configuration.active_agent_id || '').trim();
    if (!activeAgentId) {
      return;
    }
    const restoreKey = `${activeAgentId}`;
    if (chatRestoreAttemptRef.current === restoreKey) {
      return;
    }
    chatRestoreAttemptRef.current = restoreKey;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`${AGENT_RUNTIMES_BASE_URL}/api/v1/agents`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!response.ok) {
          return;
        }
        const payload = await response.json().catch(() => null);
        if (cancelled) {
          return;
        }
        const agents: Array<Record<string, any>> = Array.isArray(payload)
          ? payload
          : payload?.agents || payload?.items || [];
        const running = agents.some(agent => {
          const id = String(agent?.agent_id || agent?.id || '').trim();
          return id === activeAgentId;
        });
        if (running) {
          setSelectedAgentId(activeAgentId);
          setConfiguration(prev =>
            prev.mode === 'private' ? prev : { ...prev, mode: 'private' }
          );
          setStep('chat');
        }
      } catch {
        // Best-effort restore only.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, configurationLoaded, configuration.active_agent_id]);

  useEffect(() => {
    // If a persisted session is already authenticated on first load,
    // skip the auth screen and land on the agents gallery.
    if (token && step === 'auth') {
      setStep('gallery');
    }
  }, [token, step]);

  useEffect(() => {
    if (step === 'chat' && configuration.mode !== 'private') {
      setStep('config');
    }
  }, [step, configuration.mode]);

  useEffect(() => {
    if (step === 'chat' && !hasActiveAgent) {
      setStep('gallery');
    }
  }, [step, hasActiveAgent]);

  useEffect(() => {
    if (step === 'chat' && isSaasOnlyChat) {
      setStep('gallery');
    }
  }, [step, isSaasOnlyChat]);

  const handleSignIn = (newToken: string, handle: string) => {
    setAutoBootstrapDisabled(false);
    setDisableAutoBootstrap(false);
    setAuth(newToken, handle);
    setStep('gallery');
  };

  // API keys are exchanged for a session token before login so billing and
  // plans endpoints (/api/iam/v1/plans/*) resolve the correct paid plan.
  const handleApiKeySignIn = async (apiKey: string) => {
    const datalayerUrl = resolveDatalayerUrl();
    try {
      const resp = await fetch(`${datalayerUrl}/api/iam/v1/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: apiKey }),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data?.success && data?.token) {
        const sessionToken = String(data.token);
        const userHandle =
          (data.user && (data.user.handle_s || data.user.handle)) ||
          'api-key-user';
        handleSignIn(sessionToken, String(userHandle));
      }
    } catch {
      // Keep the user on auth screen when key exchange fails.
    }
  };

  const handleSignOut = () => {
    // Persist the signed-out intent so a refresh does not re-bootstrap the
    // session from the env-supplied DATALAYER_API_KEY.
    setAutoBootstrapDisabled(true);
    setDisableAutoBootstrap(true);
    // Clear backend fallback credentials while still authenticated.
    void pushCredentials(token, null).catch(() => {
      // Best-effort; if this fails, local state is still signed out.
    });
    clearAuth();
    setStep('auth');
  };

  const saveConfiguration = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const inferenceResponse = await fetch(
        `${AGENT_RUNTIMES_BASE_URL}/api/v1/configure/inference/provider`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ provider: inferenceProvider }),
        },
      );
      if (!inferenceResponse.ok) {
        throw new Error(
          `Failed to save inference provider (${inferenceResponse.status})`,
        );
      }

      const nextConfiguration = { ...configuration };
      const response = await fetch(
        `${AGENT_RUNTIMES_BASE_URL}/api/v1/agent-node/configuration`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(nextConfiguration),
        },
      );
      if (!response.ok) {
        throw new Error(`Failed to save configuration (${response.status})`);
      }
      const payload = await response.json().catch(() => null);
      const saved = {
        ...nextConfiguration,
        ...(payload?.configuration || {}),
      };
      setConfiguration(saved);
      if (saved.active_agent_id) {
        setSelectedAgentId(saved.active_agent_id);
      }
      showBanner('success', 'Agent Node configuration saved.');
      if (saved.mode === 'private') {
        setStep('gallery');
      }
    } catch (reason: any) {
      const message = reason?.message || 'Unable to save configuration.';
      setError(message);
      showBanner('error', message);
    } finally {
      setIsSaving(false);
    }
  };

  const isStepEnabled = (nextStep: Step) => {
    if (nextStep === 'auth') return true;
    if (!token) return false;
    if (nextStep === 'gallery') return true;
    if (nextStep === 'chat') {
      return configuration.mode === 'private' && hasActiveAgent && !isSaasOnlyChat;
    }
    return true;
  };

  const StepEntry = ({
    entryStep,
    label,
    leadingVisual,
  }: {
    entryStep: Step;
    label: string;
    leadingVisual?: OcticonIcon;
  }) => {
    const enabled = isStepEnabled(entryStep);
    const active = step === entryStep;

    return (
      <Button
        size="small"
        variant="invisible"
        leadingVisual={leadingVisual}
        disabled={!enabled}
        sx={{
          fontWeight: active ? 'bold' : 'normal',
          textDecoration: 'none',
          opacity: enabled ? 1 : 0.5,
          color: 'fg.default',
        }}
        onClick={() => {
          if (enabled) {
            setStep(entryStep);
          }
        }}
      >
        {label}
      </Button>
    );
  };

  return (
    <DatalayerThemeProvider
      colorMode={colorMode}
      theme={cfg.primerTheme}
      themeStyles={cfg.themeStyles}
    >
      <Box
        sx={{
          minHeight: '100vh',
          bg: 'canvas.default',
          color: 'fg.default',
        }}
      >
        <PageLayout
          containerWidth="full"
          padding="normal"
          sx={{ bg: 'canvas.default', color: 'fg.default' }}
          style={{ minHeight: '100vh', overflow: 'visible' }}
        >
          <PageLayout.Header>
            <PageHeader>
              <PageHeader.TitleArea>
                <PageHeader.Title>
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
                      inverse
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
                </PageHeader.Title>
              </PageHeader.TitleArea>
              <PageHeader.Actions>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    fontSize: 2,
                    lineHeight: '22px',
                  }}
                >
                  {token && (
                    <>
                      <StepEntry
                        entryStep="chat"
                        label="Chat"
                        leadingVisual={CommentIcon}
                      />
                      <StepEntry
                        entryStep="gallery"
                        label="Agents"
                        leadingVisual={RocketIcon}
                      />
                      <StepEntry
                        entryStep="config"
                        label="Configuration"
                        leadingVisual={GearIcon}
                      />
                    </>
                  )}
                  {!token ? null : (
                    <>
                      <StepEntry
                        entryStep="profile"
                        label="Profile"
                        leadingVisual={PersonIcon}
                      />
                      <Button
                        size="small"
                        variant="invisible"
                        onClick={handleSignOut}
                        leadingVisual={SignOutIcon}
                        sx={{ color: 'fg.default' }}
                      >
                        Sign out
                      </Button>
                    </>
                  )}
                  <AppearanceControlsWithStore
                    useStore={useAgentNodeThemeStore}
                  />
                </Box>
              </PageHeader.Actions>
            </PageHeader>
          </PageLayout.Header>

          <PageLayout.Content>
            <Box
              aria-live="polite"
              sx={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 1000,
                pointerEvents: 'none',
                display: 'flex',
                justifyContent: 'stretch',
              }}
            >
              <Box
                role={banner?.kind === 'error' ? 'alert' : 'status'}
                sx={{
                  pointerEvents: banner ? 'auto' : 'none',
                  width: '100%',
                  px: 4,
                  py: 4,
                  borderRadius: 0,
                  borderBottom: '1px solid',
                  borderColor:
                    banner?.kind === 'error'
                      ? 'danger.emphasis'
                      : banner?.kind === 'warning'
                        ? 'attention.emphasis'
                        : banner?.kind === 'success'
                          ? 'success.emphasis'
                          : 'accent.emphasis',
                  bg:
                    banner?.kind === 'error'
                      ? 'danger.subtle'
                      : banner?.kind === 'warning'
                        ? 'attention.subtle'
                        : banner?.kind === 'success'
                          ? 'success.subtle'
                          : 'accent.subtle',
                  color: 'fg.default',
                  boxShadow: banner ? '0 4px 16px rgba(0, 0, 0, 0.12)' : 'none',
                  opacity: banner ? 1 : 0,
                  transform: banner ? 'translateY(0)' : 'translateY(-100%)',
                  transition: banner
                    ? 'opacity 600ms ease, transform 700ms cubic-bezier(0.16, 1, 0.3, 1)'
                    : 'opacity 250ms ease, transform 350ms cubic-bezier(0.16, 1, 0.3, 1)',
                  textAlign: 'center',
                }}
              >
                <Text sx={{ fontSize: 3, fontWeight: 'bold' }}>
                  {banner?.message ?? ''}
                </Text>
              </Box>
            </Box>
            {!token && (
              <Box sx={{ mb: 3 }}>
                <Box
                  sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}
                >
                  <Box sx={{ color: 'fg.muted', display: 'inline-flex' }}>
                    <KeyAsteriskIcon size={18} />
                  </Box>
                  <Heading sx={{ fontSize: 3, m: 0 }}>Agent Node</Heading>
                </Box>
                <Text sx={{ color: 'fg.muted' }}>
                  Authenticate, configure Private/Shared/Sleep mode, then chat
                  from this node.
                </Text>
              </Box>
            )}

            {step === 'auth' && (
              <Box
                sx={{
                  border: '1px solid',
                  borderColor: 'border.default',
                  borderTop: '3px solid',
                  borderTopColor: cfg.brandColor,
                  borderRadius: 2,
                  p: 4,
                  backgroundImage: `linear-gradient(135deg, ${authGradient.from}1A 0%, ${authGradient.to}1A 100%)`,
                }}
              >
                <Box
                  sx={{
                    maxWidth: 640,
                    mx: 'auto',
                    // SignInSimple renders a full-height shell; scope overrides
                    // here so the auth view inherits this page layout/theme.
                    '& > div': {
                      height: 'auto',
                      minHeight: 0,
                      bg: 'transparent',
                      py: 0,
                    },
                    '& > div > div': {
                      width: '100%',
                      bg: 'canvas.default',
                      border: '1px solid',
                      borderColor: `${cfg.brandColor}66`,
                      boxShadow: `0 0 0 1px ${cfg.brandColor}2B`,
                      borderRadius: 2,
                      px: [3, 4],
                      py: [3, 4],
                    },
                    '& h2, & h3': {
                      color: cfg.brandColor,
                    },
                  }}
                >
                  <SignInSimple
                    loginUrl={signInLoginUrl}
                    onSignIn={handleSignIn}
                    onApiKeySignIn={handleApiKeySignIn}
                    title="Agent Node"
                    description="Sign in to configure node settings and run authenticated chat sessions."
                    leadingIcon={
                      <Box
                        sx={{ color: cfg.brandColor, display: 'inline-flex' }}
                      >
                        <HomeIcon size={24} />
                      </Box>
                    }
                  />
                </Box>
              </Box>
            )}

            {step === 'config' && (
              <Box
                sx={{
                  border: '1px solid',
                  borderColor: 'border.default',
                  borderRadius: 2,
                  p: 3,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                }}
              >
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: ['1fr', null, '1fr 1fr'],
                    gap: 4,
                    alignItems: 'start',
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 3,
                    }}
                  >
                    <FormControl>
                      <FormControl.Label>Mode</FormControl.Label>
                      <Box
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(3, 1fr)',
                          gap: 3,
                        }}
                      >
                        {MODE_CARDS.map(card => {
                          const isSelected = configuration.mode === card.mode;
                          const Icon = card.Icon;
                          return (
                            <Box
                              key={card.mode}
                              as="button"
                              type="button"
                              onClick={() =>
                                setConfiguration(prev => ({
                                  ...prev,
                                  mode: card.mode,
                                }))
                              }
                              aria-pressed={isSelected}
                              sx={{
                                textAlign: 'left',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 2,
                                p: 3,
                                borderRadius: 2,
                                border: '1px solid',
                                borderColor: isSelected
                                  ? cfg.brandColor
                                  : 'border.default',
                                bg: isSelected
                                  ? 'canvas.subtle'
                                  : 'canvas.default',
                                color: 'fg.default',
                                boxShadow: isSelected
                                  ? `0 0 0 1px ${cfg.brandColor}`
                                  : 'none',
                                '&:hover': {
                                  borderColor: cfg.brandColor,
                                },
                              }}
                            >
                              <Box
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 2,
                                  color: isSelected
                                    ? cfg.brandColor
                                    : 'fg.default',
                                }}
                              >
                                <Icon size={20} />
                                <Text sx={{ fontWeight: 'bold' }}>
                                  {card.name}
                                </Text>
                              </Box>
                              <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
                                {card.description}
                              </Text>
                            </Box>
                          );
                        })}
                      </Box>
                    </FormControl>

                    <FormControl>
                      <FormControl.Label>Inference</FormControl.Label>
                      <Text sx={{ color: 'fg.muted', fontSize: 1, mb: 2 }}>
                        Used inference provider for newly launched agent
                        sessions.
                      </Text>
                      <Box
                        sx={{
                          display: 'flex',
                          gap: 2,
                          flexWrap: 'wrap',
                          mb: inferenceProvider === 'datalayer' ? 2 : 0,
                        }}
                      >
                        <Button
                          size="small"
                          variant={
                            inferenceProvider === 'local'
                              ? 'primary'
                              : 'default'
                          }
                          onClick={() => setInferenceProvider('local')}
                        >
                          local
                        </Button>
                        <Button
                          size="small"
                          variant={
                            inferenceProvider === 'datalayer'
                              ? 'primary'
                              : 'default'
                          }
                          onClick={() => setInferenceProvider('datalayer')}
                        >
                          datalayer
                        </Button>
                      </Box>
                      {inferenceProvider === 'datalayer' && (
                        <Box
                          sx={{
                            border: '1px solid',
                            borderColor: 'border.default',
                            borderRadius: 2,
                            p: 2,
                            bg: 'canvas.subtle',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 1,
                          }}
                        >
                          <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
                            Bedrock Anthropic model
                          </Text>
                          {inferenceModels.length === 0 ? (
                            <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
                              No model list available.
                            </Text>
                          ) : (
                            <ActionMenu>
                              <ActionMenu.Button>
                                {inferenceDefaultModel || inferenceModels[0]}
                              </ActionMenu.Button>
                              <ActionMenu.Overlay width="large">
                                <ActionList selectionVariant="single">
                                  {inferenceModels.map(model => (
                                    <ActionList.Item
                                      key={model}
                                      selected={inferenceDefaultModel === model}
                                      inactiveText="Selection is locked"
                                    >
                                      {model}
                                    </ActionList.Item>
                                  ))}
                                </ActionList>
                              </ActionMenu.Overlay>
                            </ActionMenu>
                          )}
                        </Box>
                      )}
                    </FormControl>

                    {iamUser ? (
                      <BillingEntitySelect
                        value={configuration.billing_entity_uid || ''}
                        onChange={handleBillingEntityChange}
                        onSelectedAccountChange={handleSelectedAccountChange}
                        onAccountsResolved={handleAccountsResolved}
                      />
                    ) : (
                      <FormControl>
                        <FormControl.Label>
                          Run this agent under
                        </FormControl.Label>
                        <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
                          Loading billing entitys...
                        </Text>
                      </FormControl>
                    )}
                  </Box>

                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                    }}
                  >
                    <Heading sx={{ fontSize: 2, m: 0 }}>Share</Heading>
                    <ShareAccessComponent
                      isOpen
                      displayMode="inline"
                      requestUrl={`${AGENT_RUNTIMES_BASE_URL}/api/v1/agent-node/sharing`}
                      resourceLabel="Agent Node"
                      resourceName="this Agent Node"
                      onClose={handleSharingInlineClose}
                    />
                  </Box>
                </Box>

                {error && <Text sx={{ color: 'danger.fg' }}>{error}</Text>}

                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    variant="primary"
                    onClick={saveConfiguration}
                    disabled={isSaving}
                  >
                    {isSaving ? 'Saving...' : 'Save'}
                  </Button>
                </Box>
              </Box>
            )}

            {step === 'profile' && (
              <AgentNodeProfileView
                token={token}
                onTokenExpired={handleSignOut}
              />
            )}

            {step === 'gallery' && (
              <AgentNodeGallery
                baseUrl={AGENT_RUNTIMES_BASE_URL}
                token={token}
                activeAgentId={configuration.active_agent_id}
                onLaunchError={message => {
                  showBanner('error', message);
                }}
                onLaunched={agentId => {
                  setSelectedAgentId(agentId);
                  const nextConfiguration = {
                    ...configuration,
                    active_agent_id: agentId,
                    mode: 'private' as const,
                  };
                  setConfiguration(nextConfiguration);
                  // Persist mode=private so Chat stays enabled and the node
                  // advertises the active agent state to the sync loop.
                  void fetch(
                    `${AGENT_RUNTIMES_BASE_URL}/api/v1/agent-node/configuration`,
                    {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify(nextConfiguration),
                    },
                  ).catch(() => {
                    // Best-effort persistence; local state already switched.
                  });
                  if (isSaasOnlyChat) {
                    showBanner(
                      'info',
                      'This node is configured for SaaS chat. Open Agent Nodes in Datalayer to chat with it.',
                    );
                    setStep('gallery');
                  } else {
                    setStep('chat');
                  }
                }}
                onTerminated={() => {
                  setSelectedAgentId('default');
                  setConfiguration(prev => ({
                    ...prev,
                    active_agent_id: undefined,
                  }));
                  setStep('gallery');
                }}
              />
            )}

            {step === 'chat' && (
              <Box
                sx={{
                  border: '1px solid',
                  borderColor: 'border.default',
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                {isSaasOnlyChat ? (
                  <Box sx={{ p: 4 }}>
                    <Heading sx={{ fontSize: 2, mb: 2 }}>Chat From SaaS</Heading>
                    <Text sx={{ color: 'fg.muted' }}>
                      This Agent Node deployment is configured for SaaS-only chat.
                      Use the Datalayer Agent Nodes view to open chat sessions over
                      the runtimes tunnel.
                    </Text>
                  </Box>
                ) : (
                  <Chat
                    protocol="ag-ui"
                    baseUrl={AGENT_RUNTIMES_BASE_URL}
                    agentId={selectedAgentId}
                    title={chatTitle}
                    placeholder="Send a message..."
                    description={chatDescription}
                    suggestions={chatSuggestions}
                    submitOnSuggestionClick
                    showHeader={true}
                    height={'70vh'}
                    showModelSelector={true}
                    showToolsMenu={true}
                    showSkillsMenu={true}
                    showTokenUsage={true}
                    showInformation={true}
                    autoFocus
                    enableEphemeralNotebook
                    enableEphemeralDocument
                    initialEphemeralSurfaceMode="notebook"
                    runtimeId={selectedAgentId}
                    ephemeralRuntimeOverride={sandboxRuntimeOverride}
                    kernelEnvironmentName={sandboxEnvironmentName}
                    ephemeralNotebookCollaborationProvider={
                      ephemeralNotebookCollaborationProvider
                    }
                    ephemeralNotebookCollaborationDocumentId={
                      ephemeralCollaborationDocumentId
                    }
                    ephemeralDocumentCollaboration={
                      ephemeralDocumentCollaboration
                    }
                    historyEndpoint={`${AGENT_RUNTIMES_BASE_URL}/api/v1/history`}
                  />
                )}
              </Box>
            )}
          </PageLayout.Content>
        </PageLayout>
      </Box>
    </DatalayerThemeProvider>
  );
}

export default AgentNode;
