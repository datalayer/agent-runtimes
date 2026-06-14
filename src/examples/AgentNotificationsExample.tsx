/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AgentNotificationsExample
 *
 * Demonstrates notification channels for agents: in-app toasts, email digests,
 * Slack webhook integrations, and notification preference management.
 *
 * - Creates a local agent-runtimes agent using the `example-notifications` spec
 * - Shows a notification center alongside the chat where users can configure
 *   channels and review recent notifications
 */

/// <reference types="vite/client" />

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
} from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { AuthRequiredView, ErrorView } from './components';
import { ThemedProvider } from './utils/themedProvider';
import { uniqueAgentId } from './utils/agentId';
import { useExampleAgentRuntimesUrl } from './utils/useExampleAgentRuntimesUrl';
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { Chat } from '../chat';

const queryClient = new QueryClient();

// ─── Constants ─────────────────────────────────────────────────────────────

const AGENT_NAME = 'notification-example-agent';
const AGENTSPEC_ID = 'example-notifications';

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

type AlertSeverity = 'info' | 'warning' | 'critical';

interface AlertRecord {
  id: string;
  title: string;
  severity: AlertSeverity;
  timestamp: string;
}

interface ChannelConfig {
  channel: NotificationChannel;
  enabled: boolean;
  target?: string; // e.g. email address or Slack webhook URL
}

const alertVariant = (severity: AlertSeverity) => {
  if (severity === 'critical') return 'danger';
  if (severity === 'warning') return 'attention';
  return 'secondary';
};

// ─── Inner component (rendered after auth) ─────────────────────────────────

const AgentNotificationsInner: React.FC<{ onLogout: () => void }> = ({
  onLogout,
}) => {
  const { token } = useSimpleAuthStore();
  const agentName = useRef(uniqueAgentId(AGENT_NAME)).current;
  const agentBaseUrl = useExampleAgentRuntimesUrl();
  const [runtimeStatus, setRuntimeStatus] = useState<
    'launching' | 'ready' | 'error'
  >('launching');
  const [isReady, setIsReady] = useState(false);
  const [hookError, setHookError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string>(agentName);

  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [channels, setChannels] = useState<ChannelConfig[]>([
    { channel: 'in-app', enabled: true },
    { channel: 'email', enabled: false, target: '' },
    { channel: 'slack', enabled: false, target: '' },
  ]);
  const [editTargets, setEditTargets] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const podName = isReady ? `local:${agentId}` : '(launching…)';

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

  useEffect(() => {
    let isCancelled = false;

    const createLocalAgent = async () => {
      setRuntimeStatus('launching');
      setIsReady(false);
      setHookError(null);

      try {
        const response = await authFetch(`${agentBaseUrl}/api/v1/agents`, {
          method: 'POST',
          body: JSON.stringify({
            name: agentName,
            description: 'Agent with multi-channel notification support',
            agent_library: 'pydantic-ai',
            transport: 'vercel-ai',
            agent_spec_id: AGENTSPEC_ID,
            enable_skills: true,
            tools: [],
          }),
        });

        let resolvedAgentId = agentName;

        if (response.ok) {
          const data = await response.json();
          resolvedAgentId = data?.id || agentName;
        } else {
          const contentType = response.headers.get('content-type') || '';
          let detail = '';

          if (contentType.includes('application/json')) {
            const data = await response.json().catch(() => null);
            detail =
              (typeof data?.detail === 'string' && data.detail) ||
              (typeof data?.message === 'string' && data.message) ||
              '';
          } else {
            detail = await response.text();
          }

          if (!(response.status === 409 || /already exists/i.test(detail))) {
            throw new Error(
              detail || `Failed to create local agent: ${response.status}`,
            );
          }
        }

        if (!isCancelled) {
          setAgentId(resolvedAgentId);
          setIsReady(true);
          setRuntimeStatus('ready');
        }
      } catch (error) {
        if (!isCancelled) {
          setHookError(
            error instanceof Error ? error.message : 'Agent failed to start',
          );
          setRuntimeStatus('error');
        }
      }
    };

    void createLocalAgent();

    return () => {
      isCancelled = true;
    };
  }, [agentBaseUrl, agentName, authFetch]);

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
          Launching local notification agent…
        </Text>
      </Box>
    );
  }

  if (runtimeStatus === 'error' || hookError) {
    return <ErrorView error={hookError} onLogout={onLogout} />;
  }

  const unreadCount = notifications.filter(n => !n.read).length;
  const recentAlerts: AlertRecord[] = notifications.slice(0, 10).map(n => ({
    id: n.id,
    title: n.title,
    severity: n.read ? 'info' : 'warning',
    timestamp: n.timestamp,
  }));

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
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {/* Left: Chat */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Chat
            protocol="vercel-ai"
            baseUrl={agentBaseUrl}
            agentId={agentId}
            title="Notification Agent"
            brandIcon={<BellIcon size={16} />}
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
          <Box
            sx={{
              p: 3,
              borderBottom: '1px solid',
              borderColor: 'border.default',
            }}
          >
            <Heading as="h4" sx={{ fontSize: 1, mb: 2 }}>
              Recent Alerts
            </Heading>

            {recentAlerts.length === 0 ? (
              <Box
                sx={{
                  p: 2,
                  border: '1px solid',
                  borderColor: 'border.default',
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                <CheckCircleIcon size={16} />
                <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                  No active alerts.
                </Text>
              </Box>
            ) : (
              recentAlerts.map(alert => (
                <Box
                  key={alert.id}
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
                      mb: 1,
                    }}
                  >
                    <Text sx={{ fontSize: 1, fontWeight: 'bold' }}>
                      {alert.title}
                    </Text>
                    <Label size="small" variant={alertVariant(alert.severity)}>
                      {alert.severity}
                    </Label>
                  </Box>
                  <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                    {new Date(alert.timestamp).toLocaleString()}
                  </Text>
                </Box>
              ))
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

const AgentNotificationsExample: React.FC = () => {
  const { token, clearAuth } = useSimpleAuthStore();
  const hasSynced = useRef(false);

  useEffect(() => {
    if (token && !hasSynced.current) {
      hasSynced.current = true;
      syncTokenToIamStore(token);
    }
  }, [token]);

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
        <AuthRequiredView />
      </ThemedProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemedProvider>
        <AgentNotificationsInner onLogout={handleLogout} />
      </ThemedProvider>
    </QueryClientProvider>
  );
};

export default AgentNotificationsExample;
