/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Box,
  DatalayerLogoText,
  DatalayerThemeProvider,
  getLogoColors,
  setupPrimerPortals,
  themeConfigs,
} from '@datalayer/primer-addons';
import { AppearanceControlsWithStore } from '@datalayer/primer-addons/lib/components/appearance';
import {
  Avatar,
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
  SignInIcon,
  SignOutIcon,
  type Icon as OcticonIcon,
} from '@primer/octicons-react';
import { SignInSimple } from '@datalayer/core/lib/views/iam';
import { UserBadge } from '@datalayer/core/lib/views/profile';
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { useIAMStore } from '@datalayer/core/lib/state';
import {
  BillableAccountSelect,
  type BillableAccount,
} from '@datalayer/core/lib/components/billing';
import { ShareAccessComponent } from '@datalayer/core/lib/components/sharing';
import { useAgentNodeThemeStore } from './agent-node/themeStore';
import { Chat } from './chat';

import '../style/primer-primitives.css';

setupPrimerPortals();

const BASE_URL = window.location.origin;

type AgentNodeMode = 'private' | 'shared' | 'sleep';
type Step = 'auth' | 'config' | 'chat' | 'profile';

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
  billable_account_uid?: string;
  billable_account_type?: string;
  billable_account_handle?: string;
  sharing: Record<string, any>;
};

const DEFAULT_CONFIGURATION: AgentNodeConfiguration = {
  mode: 'sleep',
  sharing: {},
};

/**
 * Profile view rendered inside AgentNode when the user picks "Profile" from
 * the header menu. Mirrors the shape of `ui/src/views/profile/UserProfileBase`
 * but assembled exclusively from core building blocks so agent-runtimes does
 * not pull in the `ui` package.
 */
function AgentNodeProfileView({ token }: { token: string | null }) {
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
  const [disableAutoBootstrap, setDisableAutoBootstrap] = useState(false);
  const [configuration, setConfiguration] = useState<AgentNodeConfiguration>(
    DEFAULT_CONFIGURATION,
  );
  const [, setSelectedBillableAccount] = useState<BillableAccount | undefined>(
    undefined,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  // Refs kept in sync with state so the BillableAccountSelect callbacks
  // (passed via stable identities) can read the latest values without
  // being re-created on every render — re-created callbacks made
  // BillableAccountSelect re-fire onAccountsResolved and trigger an
  // infinite setState loop.
  const configurationRef = useRef(configuration);
  useEffect(() => {
    configurationRef.current = configuration;
  }, [configuration]);
  const iamUserRef = useRef(iamUser);
  useEffect(() => {
    iamUserRef.current = iamUser;
  }, [iamUser]);

  const handleBillableAccountChange = useCallback((uid: string) => {
    setConfiguration(prev => ({ ...prev, billable_account_uid: uid }));
  }, []);

  const handleSelectedAccountChange = useCallback(
    (account: BillableAccount | undefined) => {
      setSelectedBillableAccount(account);
      setConfiguration(prev => ({
        ...prev,
        billable_account_type: account?.accountType,
        billable_account_handle: account?.accountHandle,
      }));
    },
    [],
  );

  const handleAccountsResolved = useCallback(
    (_state: {
      accounts: BillableAccount[];
      eligibleAccounts: BillableAccount[];
      isLoading: boolean;
      hasEligibleAccount: boolean;
    }) => {
      // BillableAccountSelect persists the chosen account in a cookie and
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
          `${BASE_URL}/api/v1/agent-node/configuration`,
        );
        if (!response.ok) {
          return;
        }
        const payload = await response.json();
        const loadedConfiguration = {
          ...DEFAULT_CONFIGURATION,
          ...(payload?.configuration || {}),
        };
        setConfiguration(loadedConfiguration);
      } catch {
        // Ignore initial-load failures in local development.
      }
    };
    load();
  }, []);

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
          `${BASE_URL}/api/v1/agent-node/auth/bootstrap`,
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
          setStep('config');
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
    const runUrl =
      (import.meta as any).env?.VITE_DATALAYER_RUN_URL ||
      'https://prod1.datalayer.run';
    const body = JSON.stringify({
      token: token || null,
      runtimes_url: token ? runUrl : null,
    });
    fetch(`${BASE_URL}/api/v1/agent-node/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }).catch(() => {
      // Best-effort; backend may not be reachable in some local setups.
    });
  }, [token]);

  useEffect(() => {
    import('@datalayer/core/lib/state').then(({ iamStore, coreStore }) => {
      const runUrl =
        (import.meta as any).env?.VITE_DATALAYER_RUN_URL ||
        'https://prod1.datalayer.run';
      // Seed all per-service URLs to match the main UI login behavior.
      const coreApi = coreStore.getState() as any;
      const prevCfg = coreApi.configuration ?? {};
      const urls = {
        iamRunUrl: runUrl,
        runtimesRunUrl: runUrl,
        spacerRunUrl: runUrl,
        libraryRunUrl: runUrl,
        aiagentsRunUrl: runUrl,
        aiinferenceRunUrl: runUrl,
        mcpserversRunUrl: runUrl,
        otelRunUrl: runUrl,
        growthRunUrl: runUrl,
        successRunUrl: runUrl,
        supportRunUrl: runUrl,
      };
      if (typeof coreApi.setConfiguration === 'function') {
        coreApi.setConfiguration({ ...prevCfg, ...urls });
      } else {
        coreStore.setState((s: any) => ({
          configuration: { ...(s.configuration || {}), ...urls },
        }));
      }

      const api = iamStore.getState() as any;
      iamStore.setState({ token: tokenForCore, iamRunUrl: runUrl } as any);
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
    // If a persisted session is already authenticated on first load,
    // skip the auth screen and land on the main configuration view.
    if (token && step === 'auth') {
      setStep('config');
    }
  }, [token, step]);

  useEffect(() => {
    if (step === 'chat' && configuration.mode !== 'private') {
      setStep('config');
    }
  }, [step, configuration.mode]);

  const handleSignIn = (newToken: string, handle: string) => {
    setDisableAutoBootstrap(false);
    setAuth(newToken, handle);
    setStep('config');
  };

  // API keys are exchanged for a session token before login so billing and
  // plans endpoints (/api/iam/v1/plans/*) resolve the correct paid plan.
  const handleApiKeySignIn = async (apiKey: string) => {
    const runUrl =
      (import.meta as any).env?.VITE_DATALAYER_RUN_URL ||
      'https://prod1.datalayer.run';
    try {
      const resp = await fetch(`${runUrl}/api/iam/v1/login`, {
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
    setDisableAutoBootstrap(true);
    clearAuth();
    setStep('auth');
  };

  const saveConfiguration = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const nextConfiguration = { ...configuration };
      const response = await fetch(
        `${BASE_URL}/api/v1/agent-node/configuration`,
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
      showBanner('success', 'Agent Node configuration saved.');
      if (saved.mode === 'private') {
        setStep('chat');
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
    if (nextStep === 'chat') return configuration.mode === 'private';
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
              <PageHeader.Actions>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    fontSize: 2,
                    lineHeight: '22px',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    {token && (
                      <>
                        <StepEntry
                          entryStep="chat"
                          label="Chat"
                          leadingVisual={CommentIcon}
                        />
                        <StepEntry
                          entryStep="config"
                          label="Configuration"
                          leadingVisual={GearIcon}
                        />
                      </>
                    )}
                  </Box>
                  <AppearanceControlsWithStore
                    useStore={useAgentNodeThemeStore}
                  />
                  {!token ? (
                    <Button
                      size="small"
                      variant="invisible"
                      onClick={() => setStep('auth')}
                      leadingVisual={SignInIcon}
                      sx={{ color: 'fg.muted' }}
                    >
                      Sign in
                    </Button>
                  ) : (
                    <Box
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 1,
                      }}
                    >
                      <Box
                        sx={{
                          textAlign: 'left',
                          display: 'inline-flex',
                          alignItems: 'center',
                        }}
                      >
                        <UserBadge
                          token={token}
                          variant="small"
                          onTokenExpired={handleSignOut}
                        />
                      </Box>
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
                    </Box>
                  )}
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
              </PageHeader.Actions>
            </PageHeader>
          </PageLayout.Header>

          <PageLayout.Content>
            <Box
              aria-live="polite"
              sx={{
                position: 'sticky',
                top: 0,
                zIndex: 30,
                pointerEvents: 'none',
                mb: banner ? 3 : 0,
                transition: 'margin-bottom 200ms ease',
              }}
            >
              <Box
                role={banner?.kind === 'error' ? 'alert' : 'status'}
                sx={{
                  pointerEvents: banner ? 'auto' : 'none',
                  px: 3,
                  py: 2,
                  borderRadius: 2,
                  border: '1px solid',
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
                  opacity: banner ? 1 : 0,
                  transform: banner ? 'translateY(0)' : 'translateY(-8px)',
                  transition: 'opacity 250ms ease, transform 250ms ease',
                }}
              >
                <Text sx={{ fontSize: 1 }}>{banner?.message ?? ''}</Text>
              </Box>
            </Box>
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
                      borderColor: `${cfg.brandColor}66`,
                      boxShadow: `0 0 0 1px ${cfg.brandColor}2B`,
                    },
                    '& h2, & h3': {
                      color: cfg.brandColor,
                    },
                  }}
                >
                  <SignInSimple
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
                            bg: isSelected ? 'canvas.subtle' : 'canvas.default',
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
                              color: isSelected ? cfg.brandColor : 'fg.default',
                            }}
                          >
                            <Icon size={20} />
                            <Text sx={{ fontWeight: 'bold' }}>{card.name}</Text>
                          </Box>
                          <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
                            {card.description}
                          </Text>
                        </Box>
                      );
                    })}
                  </Box>
                </FormControl>

                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: ['1fr', null, '1fr 1fr'],
                    gap: 3,
                    alignItems: 'start',
                  }}
                >
                  {iamUser ? (
                    <BillableAccountSelect
                      value={configuration.billable_account_uid || ''}
                      onChange={handleBillableAccountChange}
                      onSelectedAccountChange={handleSelectedAccountChange}
                      onAccountsResolved={handleAccountsResolved}
                    />
                  ) : (
                    <FormControl>
                      <FormControl.Label>
                        Run this agent under
                      </FormControl.Label>
                      <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
                        Loading billable accounts...
                      </Text>
                    </FormControl>
                  )}

                  <ShareAccessComponent
                    isOpen
                    displayMode="inline"
                    requestUrl={`${BASE_URL}/api/v1/agent-node/sharing`}
                    resourceLabel="Agent Node"
                    resourceName="this Agent Node"
                    onClose={handleSharingInlineClose}
                  />
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

            {step === 'profile' && <AgentNodeProfileView token={token} />}

            {step === 'chat' && (
              <Box
                sx={{
                  border: '1px solid',
                  borderColor: 'border.default',
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                <Chat
                  protocol="ag-ui"
                  baseUrl={BASE_URL}
                  agentId="default"
                  title="Agent Node Chat"
                  placeholder="Send a message..."
                  description="Node-local chat"
                  showHeader={true}
                  height={'70vh'}
                  showModelSelector={true}
                  showToolsMenu={true}
                  showSkillsMenu={true}
                  showTokenUsage={true}
                  showInformation={true}
                  autoFocus
                  runtimeId="default"
                  historyEndpoint={`${BASE_URL}/api/v1/history`}
                />
              </Box>
            )}
          </PageLayout.Content>
        </PageLayout>
      </Box>
    </DatalayerThemeProvider>
  );
}

export default AgentNode;
