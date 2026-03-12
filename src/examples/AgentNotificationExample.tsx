/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AgentNotificationExample
 *
 * Demonstrates notification channels for agents: in-app toasts, email digests,
 * Slack webhook integrations, and notification preference management.
 *
 * - Creates a cloud runtime (environment: 'ai-agents-env') via the Datalayer
 *   Runtimes API and deploys an agent on its sidecar
 * - Shows a notification center alongside the chat where users can configure
 *   channels and review recent notifications
 */

/// <reference types="vite/client" />

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Text,
  Button,
  Spinner,
  Heading,
  Label,
  TextInput,
  Flash,
  Timeline,
} from '@primer/react';
import {
  AlertIcon,
  BellIcon,
  MailIcon,
  CheckCircleIcon,
  MuteIcon,
  SignOutIcon,
} from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { ThemedProvider } from './stores/themedProvider';
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { SignInSimple } from '@datalayer/core/lib/views/iam';
import { UserBadge } from '@datalayer/core/lib/views/profile';
import { Chat } from '../chat';
import { useAgent } from '../hooks/useAgent';

// ─── Constants ─────────────────────────────────────────────────────────────

const AGENT_NAME = 'notification-demo-agent';
const AGENT_SPEC_ID = 'mocks/monitor-sales-kpis';

// ─── Types ─────────────────────────────────────────────────────────────────

type NotificationChannel = 'in-app' | 'email' | 'slack';

interface NotificationRecord {
  id: string;
  channel: NotificationChannel;
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
}

interface ChannelConfig {
  channel: NotificationChannel;
  enabled: boolean;
  target?: string; // e.g. email address or Slack webhook URL
}

// ─── Inner component (rendered after auth) ─────────────────────────────────

const AgentNotificationInner: React.FC<{ onLogout: () => void }> = ({
  onLogout,
}) => {
  const { token } = useSimpleAuthStore();

  const {
    runtime,
    agent,
    status: runtimeStatus,
    isReady,
    error: hookError,
  } = useAgent({
    agentSpecId: AGENT_SPEC_ID,
    autoStart: true,
    agentConfig: {
      name: AGENT_NAME,
      transport: 'ag-ui',
      description: 'Agent with multi-channel notification support',
    },
  });

  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [channels, setChannels] = useState<ChannelConfig[]>([
    { channel: 'in-app', enabled: true },
    { channel: 'email', enabled: false, target: '' },
    { channel: 'slack', enabled: false, target: '' },
  ]);
  const [editTargets, setEditTargets] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const agentBaseUrl = runtime?.agentBaseUrl || '';
  const agentId = agent?.agentId || AGENT_NAME;
  const podName = runtime?.podName || '(launching…)';

  // Authenticated fetch helper
  const authFetch = useCallback(
    (url: string, opts: RequestInit = {}) =>
      fetch(url, {
        ...opts,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(opts.headers ?? {}),
        },
      }),
    [token],
  );

  // ── Poll notifications ────────────────────────────────────────────────

  useEffect(() => {
    if (!isReady || !agentBaseUrl) return;
    const poll = async () => {
      try {
        const res = await authFetch(
          `${agentBaseUrl}/api/v1/agents/${agentId}/notifications`,
        );
        if (res.ok) {
          const d = await res.json();
          setNotifications(Array.isArray(d) ? d : (d.notifications ?? []));
        }
      } catch {
        /* ok */
      }

      try {
        const res = await authFetch(
          `${agentBaseUrl}/api/v1/agents/${agentId}/notifications/channels`,
        );
        if (res.ok) {
          const d = await res.json();
          if (Array.isArray(d)) setChannels(d);
        }
      } catch {
        /* ok */
      }
    };
    poll();
    const interval = setInterval(poll, 10_000);
    return () => clearInterval(interval);
  }, [isReady, agentBaseUrl, agentId, authFetch]);

  // ── Toggle / save channel ─────────────────────────────────────────────

  const handleToggleChannel = useCallback(
    async (ch: NotificationChannel) => {
      if (!agentBaseUrl) return;
      const current = channels.find(c => c.channel === ch);
      if (!current) return;
      setIsSaving(true);
      try {
        const res = await authFetch(
          `${agentBaseUrl}/api/v1/agents/${agentId}/notifications/channels`,
          {
            method: 'PUT',
            body: JSON.stringify({
              channel: ch,
              enabled: !current.enabled,
              target: editTargets[ch] ?? current.target,
            }),
          },
        );
        if (res.ok) {
          setChannels(prev =>
            prev.map(c =>
              c.channel === ch
                ? {
                    ...c,
                    enabled: !c.enabled,
                    target: editTargets[ch] ?? c.target,
                  }
                : c,
            ),
          );
        }
      } catch {
        /* ok */
      } finally {
        setIsSaving(false);
      }
    },
    [agentBaseUrl, agentId, channels, editTargets, authFetch],
  );

  // ── Send test notification ────────────────────────────────────────────

  const handleTestNotification = useCallback(async () => {
    if (!agentBaseUrl) return;
    setFlash(null);
    try {
      const res = await authFetch(
        `${agentBaseUrl}/api/v1/agents/${agentId}/notifications/test`,
        { method: 'POST' },
      );
      if (res.ok) {
        setFlash('Test notification sent');
      } else {
        setFlash(`Failed (${res.status})`);
      }
    } catch {
      setFlash('Network error');
    }
  }, [agentBaseUrl, agentId, authFetch]);

  // ── Loading / Error ───────────────────────────────────────────────────

  if (!isReady && runtimeStatus !== 'error') {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          gap: 3,
        }}
      >
        <Spinner size="large" />
        <Text sx={{ color: 'fg.muted' }}>
          {runtimeStatus === 'launching'
            ? 'Launching runtime for notification agent…'
            : 'Creating notification demo agent…'}
        </Text>
      </Box>
    );
  }

  if (runtimeStatus === 'error' || hookError) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          gap: 3,
        }}
      >
        <AlertIcon size={48} />
        <Text sx={{ color: 'danger.fg' }}>
          {hookError || 'Agent failed to start'}
        </Text>
      </Box>
    );
  }

  const unreadCount = notifications.filter(n => !n.read).length;

  const channelIcon = (ch: NotificationChannel) => {
    switch (ch) {
      case 'in-app':
        return BellIcon;
      case 'email':
        return MailIcon;
      case 'slack':
        return AlertIcon; // placeholder for Slack icon
    }
  };

  return (
    <Box
      sx={{
        height: 'calc(100vh - 60px)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Toolbar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          px: 3,
          py: 2,
          borderBottom: '1px solid',
          borderColor: 'border.default',
          flexShrink: 0,
        }}
      >
        <BellIcon size={16} />
        <Heading as="h3" sx={{ fontSize: 2, flex: 1 }}>
          Notifications — {podName}
        </Heading>
        {unreadCount > 0 && (
          <Label variant="accent" size="small">
            {unreadCount} unread
          </Label>
        )}
        {token && <UserBadge token={token} />}
        <Button
          size="small"
          variant="invisible"
          onClick={onLogout}
          leadingVisual={SignOutIcon}
          sx={{ color: 'fg.muted' }}
        >
          Sign out
        </Button>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {/* Left: Chat */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Chat
            transport="ag-ui"
            baseUrl={agentBaseUrl}
            agentId={agentId}
            title="Notification Agent"
            placeholder="Ask the agent to send you notifications…"
            description={`${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`}
            showHeader={true}
            autoFocus
            height="100%"
            runtimeId={podName}
            historyEndpoint={`${agentBaseUrl}/api/v1/history`}
            suggestions={[
              {
                title: 'Alert me',
                message: 'Notify me when KPIs drop below threshold',
              },
              {
                title: 'Daily digest',
                message: 'Set up a daily email digest of KPI summaries',
              },
            ]}
            submitOnSuggestionClick
          />
        </Box>

        {/* Right: Notification panel */}
        <Box
          sx={{
            width: 380,
            borderLeft: '1px solid',
            borderColor: 'border.default',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'auto',
          }}
        >
          {/* Channel config */}
          <Box
            sx={{
              p: 3,
              borderBottom: '1px solid',
              borderColor: 'border.default',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <BellIcon size={16} />
              <Heading as="h3" sx={{ fontSize: 2 }}>
                Channels
              </Heading>
            </Box>

            {channels.map(ch => {
              const Icon = channelIcon(ch.channel);
              return (
                <Box
                  key={ch.channel}
                  sx={{
                    p: 2,
                    mb: 2,
                    border: '1px solid',
                    borderColor: 'border.default',
                    borderRadius: 2,
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      mb: ch.channel !== 'in-app' ? 1 : 0,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Icon size={14} />
                      <Text sx={{ fontWeight: 'bold', fontSize: 1 }}>
                        {ch.channel}
                      </Text>
                    </Box>
                    <Button
                      size="small"
                      variant={ch.enabled ? 'danger' : 'primary'}
                      leadingVisual={ch.enabled ? MuteIcon : BellIcon}
                      onClick={() => handleToggleChannel(ch.channel)}
                      disabled={isSaving}
                    >
                      {ch.enabled ? 'Disable' : 'Enable'}
                    </Button>
                  </Box>
                  {ch.channel !== 'in-app' && (
                    <TextInput
                      value={editTargets[ch.channel] ?? ch.target ?? ''}
                      onChange={e =>
                        setEditTargets(prev => ({
                          ...prev,
                          [ch.channel]: e.target.value,
                        }))
                      }
                      placeholder={
                        ch.channel === 'email'
                          ? 'user@example.com'
                          : 'https://hooks.slack.com/…'
                      }
                      size="small"
                      sx={{ width: '100%' }}
                    />
                  )}
                </Box>
              );
            })}

            <Button
              size="small"
              leadingVisual={BellIcon}
              onClick={handleTestNotification}
              sx={{ width: '100%' }}
            >
              Send Test Notification
            </Button>

            {flash && (
              <Flash
                variant={flash.includes('sent') ? 'success' : 'danger'}
                sx={{ mt: 2, fontSize: 0 }}
              >
                {flash}
              </Flash>
            )}
          </Box>

          {/* Notification history */}
          <Box sx={{ p: 3, flex: 1, overflow: 'auto' }}>
            <Heading as="h4" sx={{ fontSize: 1, mb: 2 }}>
              Recent Notifications
            </Heading>

            {notifications.length === 0 ? (
              <Text sx={{ color: 'fg.muted', fontSize: 0 }}>
                No notifications yet.
              </Text>
            ) : (
              <Timeline>
                {notifications.slice(0, 25).map(n => (
                  <Timeline.Item key={n.id}>
                    <Timeline.Badge>
                      {n.read ? <CheckCircleIcon /> : <BellIcon />}
                    </Timeline.Badge>
                    <Timeline.Body>
                      <Text
                        sx={{
                          fontSize: 0,
                          fontWeight: n.read ? 'normal' : 'bold',
                        }}
                      >
                        {n.title}
                      </Text>
                      <Text
                        as="p"
                        sx={{ fontSize: 0, color: 'fg.muted', mt: 1 }}
                      >
                        {n.body}
                      </Text>
                      <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                        {new Date(n.timestamp).toLocaleString()} via{' '}
                        <Label size="small" variant="secondary">
                          {n.channel}
                        </Label>
                      </Text>
                    </Timeline.Body>
                  </Timeline.Item>
                ))}
              </Timeline>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

// ─── Sync token to core IAM store ──────────────────────────────────────────

const syncTokenToIamStore = (token: string) => {
  import('@datalayer/core/lib/state').then(({ iamStore }) => {
    iamStore.setState({ token });
  });
};

// ─── Main component with auth gate ─────────────────────────────────────────

const AgentNotificationExample: React.FC = () => {
  const { token, setAuth, clearAuth } = useSimpleAuthStore();
  const hasSynced = useRef(false);

  useEffect(() => {
    if (token && !hasSynced.current) {
      hasSynced.current = true;
      syncTokenToIamStore(token);
    }
  }, [token]);

  const handleSignIn = useCallback(
    (newToken: string, handle: string) => {
      setAuth(newToken, handle);
      hasSynced.current = true;
      syncTokenToIamStore(newToken);
    },
    [setAuth],
  );

  const handleLogout = useCallback(() => {
    clearAuth();
    hasSynced.current = false;
    import('@datalayer/core/lib/state').then(({ iamStore }) => {
      iamStore.setState({ token: undefined });
    });
  }, [clearAuth]);

  if (!token) {
    return (
      <ThemedProvider>
        <SignInSimple
          onSignIn={handleSignIn}
          onApiKeySignIn={apiKey => handleSignIn(apiKey, 'api-key-user')}
          title="Agent Notifications"
          description="Sign in to configure and monitor agent notifications."
          leadingIcon={<BellIcon size={24} />}
        />
      </ThemedProvider>
    );
  }

  return (
    <ThemedProvider>
      <AgentNotificationInner onLogout={handleLogout} />
    </ThemedProvider>
  );
};

export default AgentNotificationExample;
