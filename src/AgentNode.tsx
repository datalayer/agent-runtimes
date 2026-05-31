/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useEffect, useMemo, useState } from 'react';
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
  ActionList,
  ActionMenu,
  Avatar,
  Button,
  FormControl,
  Heading,
  Label,
  Link,
  PageHeader,
  PageLayout,
  Text,
} from '@primer/react';
import {
  HomeIcon,
  LockIcon,
  MoonIcon,
  PeopleIcon,
  PersonIcon,
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
      'Only you can use this Agent Node. Runs as your personal workspace.',
    Icon: LockIcon,
  },
  {
    mode: 'shared',
    name: 'Shared',
    description:
      'Selected users, teams or organizations can use this Agent Node.',
    Icon: PeopleIcon,
  },
  {
    mode: 'sleep',
    name: 'Sleep',
    description:
      'The Agent Node is paused. No new chat sessions will be accepted.',
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
    const name =
      [u.first_name, u.last_name].filter(Boolean).join(' ').trim() ||
      u.handle ||
      u.email ||
      'Datalayer user';
    return {
      name,
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            {display.avatarUrl ? (
              <Avatar src={display.avatarUrl} size={64} alt={display.name} />
            ) : (
              <Box
                sx={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  bg: 'canvas.subtle',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'fg.muted',
                }}
              >
                <PersonIcon size={28} />
              </Box>
            )}
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              <Heading sx={{ fontSize: 3, mb: 1 }}>{display.name}</Heading>
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
  const [configuration, setConfiguration] = useState<AgentNodeConfiguration>(
    DEFAULT_CONFIGURATION,
  );
  const [, setSelectedBillableAccount] = useState<BillableAccount | undefined>(
    undefined,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    import('@datalayer/core/lib/state').then(({ iamStore, coreStore }) => {
      const runUrl =
        (import.meta as any).env?.VITE_DATALAYER_RUN_URL ||
        'https://prod1.datalayer.run';
      // Seed the core configuration so components reading
      // `coreStore.configuration.iamRunUrl` (e.g. ShareAccessComponent's
      // principal search) have a usable IAM endpoint.
      const coreApi = coreStore.getState() as any;
      const prevCfg = coreApi.configuration ?? {};
      if (typeof coreApi.setConfiguration === 'function') {
        coreApi.setConfiguration({
          ...prevCfg,
          iamRunUrl: prevCfg.iamRunUrl || runUrl,
          runtimesRunUrl: prevCfg.runtimesRunUrl || runUrl,
          spacerRunUrl: prevCfg.spacerRunUrl || runUrl,
        });
      } else {
        coreStore.setState((s: any) => ({
          configuration: {
            ...(s.configuration || {}),
            iamRunUrl: s.configuration?.iamRunUrl || runUrl,
            runtimesRunUrl: s.configuration?.runtimesRunUrl || runUrl,
            spacerRunUrl: s.configuration?.spacerRunUrl || runUrl,
          },
        }));
      }
      iamStore.setState({ token: tokenForCore, iamRunUrl: runUrl } as any);
      if (tokenForCore) {
        // Populate `user` (incl. id/handle) so downstream selectors like
        // BillableAccountSelect's personal-account row resolve correctly.
        const api = iamStore.getState() as any;
        if (typeof api.refreshUserByToken === 'function') {
          void Promise.resolve(api.refreshUserByToken(tokenForCore)).then(
            () => {
              // Force refetch of org/billing queries with the now-valid
              // token so plan labels (Team Plan/Free Plan) resolve.
              queryClient.invalidateQueries({ queryKey: ['organizations'] });
              queryClient.invalidateQueries({ queryKey: ['subscription'] });
            },
          );
        }
      }
    });
  }, [token, queryClient]);

  useEffect(() => {
    if (!token && step !== 'auth') {
      setStep('auth');
    }
  }, [token, step]);

  useEffect(() => {
    if (step === 'chat' && configuration.mode !== 'private') {
      setStep('config');
    }
  }, [step, configuration.mode]);

  const handleSignIn = (newToken: string, handle: string) => {
    setAuth(newToken, handle);
    setStep('config');
  };

  const handleSignOut = () => {
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
      if (saved.mode === 'private') {
        setStep('chat');
      }
    } catch (reason: any) {
      setError(reason?.message || 'Unable to save configuration.');
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
  }: {
    entryStep: Step;
    label: string;
  }) => {
    const enabled = isStepEnabled(entryStep);
    const active = step === entryStep;

    return (
      <Link
        muted={!active}
        sx={{
          fontSize: 2,
          lineHeight: '22px',
          fontWeight: active ? 'bold' : 'normal',
          textDecoration: active ? 'underline' : 'none',
          pointerEvents: enabled ? 'auto' : 'none',
          opacity: enabled ? 1 : 0.5,
          cursor: enabled ? 'pointer' : 'not-allowed',
        }}
        onClick={event => {
          event.preventDefault();
          if (enabled) {
            setStep(entryStep);
          }
        }}
      >
        {label}
      </Link>
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
                        <StepEntry entryStep="config" label="Configuration" />
                        <StepEntry entryStep="chat" label="Chat" />
                      </>
                    )}
                  </Box>
                  <AppearanceControlsWithStore
                    useStore={useAgentNodeThemeStore}
                  />
                  {token ? (
                    <ActionMenu>
                      <ActionMenu.Anchor>
                        <Button
                          variant="invisible"
                          size="small"
                          sx={{ color: 'fg.default', px: 1 }}
                          aria-label="Open profile menu"
                        >
                          <UserBadge
                            token={token}
                            variant="small"
                            onTokenExpired={handleSignOut}
                          />
                        </Button>
                      </ActionMenu.Anchor>
                      <ActionMenu.Overlay>
                        <ActionList>
                          <ActionList.Item onSelect={() => setStep('profile')}>
                            <ActionList.LeadingVisual>
                              <PersonIcon />
                            </ActionList.LeadingVisual>
                            Profile
                          </ActionList.Item>
                          <ActionList.Divider />
                          <ActionList.Item
                            variant="danger"
                            onSelect={handleSignOut}
                          >
                            <ActionList.LeadingVisual>
                              <SignOutIcon />
                            </ActionList.LeadingVisual>
                            Sign out
                          </ActionList.Item>
                        </ActionList>
                      </ActionMenu.Overlay>
                    </ActionMenu>
                  ) : (
                    <Button
                      size="small"
                      variant="invisible"
                      onClick={() => setStep('auth')}
                      leadingVisual={SignInIcon}
                      sx={{ color: 'fg.muted' }}
                    >
                      Sign in
                    </Button>
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
            <Box sx={{ mb: 3 }}>
              <Heading sx={{ fontSize: 3, mb: 1 }}>Agent Node</Heading>
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
                    onApiKeySignIn={apiKey =>
                      handleSignIn(apiKey, 'api-key-user')
                    }
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
                      onChange={uid =>
                        setConfiguration(prev => ({
                          ...prev,
                          billable_account_uid: uid,
                        }))
                      }
                      onSelectedAccountChange={account => {
                        setSelectedBillableAccount(account);
                        setConfiguration(prev => ({
                          ...prev,
                          billable_account_type: account?.accountType,
                          billable_account_handle: account?.accountHandle,
                        }));
                      }}
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
                    onClose={() => {
                      // Inline mode: nothing to close, but prop is required.
                    }}
                  />
                </Box>

                {error && <Text sx={{ color: 'danger.fg' }}>{error}</Text>}

                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    variant="primary"
                    onClick={saveConfiguration}
                    disabled={isSaving}
                  >
                    {isSaving ? 'Saving...' : 'Save and continue'}
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
