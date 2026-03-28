/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AgentTriggersExample
 *
 * Demonstrates multiple trigger types for agents: cron schedules,
 * webhook URLs, event-based listeners, and manual invocations.
 *
 * - Creates a cloud agent runtime (environment: 'ai-agents-env') via the Datalayer
 *   Runtimes API and deploys an agent via its sidecar
 * - Shows a tabbed control panel to configure each trigger type
 * - Lists recent trigger history and next scheduled run
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
  ClockIcon,
  SyncIcon,
  CheckCircleIcon,
  XCircleIcon,
  PlayIcon,
  SignOutIcon,
  GlobeIcon,
  ZapIcon,
  MailIcon,
  EyeIcon,
  EyeClosedIcon,
  TrashIcon,
} from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { ThemedProvider } from './utils/themedProvider';
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { SignInSimple } from '@datalayer/core/lib/views/iam';
import { UserBadge } from '@datalayer/core/lib/views/profile';
import { Chat } from '../chat';
import {
  useAgentEvents,
  useDeleteAgentEvent,
  useMarkEventRead,
  useMarkEventUnread,
} from '../hooks';
import type { AgentEvent } from '../types';

const queryClient = new QueryClient();

// ─── Constants ─────────────────────────────────────────────────────────────

const AGENT_NAME = 'trigger-demo-agent';
const AGENT_SPEC_ID = 'monitor-sales-kpis';
const DEFAULT_LOCAL_BASE_URL =
  import.meta.env.VITE_BASE_URL || 'http://localhost:8765';
const DEFAULT_CRON = '0 8 * * *'; // daily at 08:00 UTC

// ─── Types ─────────────────────────────────────────────────────────────────

type TriggerTab = 'once' | 'cron' | 'webhook' | 'event' | 'manual';

interface TriggerRecord {
  id: string;
  timestamp: string;
  status: 'success' | 'failure' | 'running';
  duration_ms?: number;
  source?: TriggerTab;
}

// ─── Inner component (rendered after auth) ─────────────────────────────────

const AgentTriggerInner: React.FC<{ onLogout: () => void }> = ({
  onLogout,
}) => {
  const { token } = useSimpleAuthStore();

  const [runtimeStatus, setRuntimeStatus] = useState<
    'launching' | 'ready' | 'error'
  >('launching');
  const [isReady, setIsReady] = useState(false);
  const [hookError, setHookError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string>(AGENT_NAME);

  const agentBaseUrl = DEFAULT_LOCAL_BASE_URL;
  const chatAuthToken: string | undefined = token === null ? undefined : token;

  // Cron state
  const [cronExpr, setCronExpr] = useState(DEFAULT_CRON);
  const [editCron, setEditCron] = useState(DEFAULT_CRON);
  const [nextRun, setNextRun] = useState<string | null>(null);
  const [triggerHistory, setTriggerHistory] = useState<TriggerRecord[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isTriggeringNow, setIsTriggeringNow] = useState(false);
  const [triggerFlash, setTriggerFlash] = useState<string | null>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<TriggerTab>('once');

  // Once trigger state
  const [isLaunchingOnce, setIsLaunchingOnce] = useState(false);
  const [onceFlash, setOnceFlash] = useState<string | null>(null);

  // Webhook state
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null);
  const [webhookEnabled, setWebhookEnabled] = useState(false);

  // Event state
  const [eventTopic, setEventTopic] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [eventSubscribed, setEventSubscribed] = useState(false);

  // Events hooks
  const eventsQuery = useAgentEvents({ agent_id: agentId });
  const deleteEventMutation = useDeleteAgentEvent();
  const markReadMutation = useMarkEventRead();
  const markUnreadMutation = useMarkEventUnread();
  const agentEvents: AgentEvent[] = eventsQuery.data?.events ?? [];

  // Authenticated fetch helper (for sidecar endpoints)
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

  // ── Poll trigger metadata ────────────────────────────────────────────────

  useEffect(() => {
    if (!isReady || !agentBaseUrl) return;
    const poll = async () => {
      try {
        const res = await authFetch(
          `${agentBaseUrl}/api/v1/agents/${agentId}/trigger`,
        );
        if (res.ok) {
          const d = await res.json();
          if (d.cron) setCronExpr(d.cron);
          if (d.next_run) setNextRun(d.next_run);
        }
      } catch {
        /* ok */
      }

      try {
        const res = await authFetch(
          `${agentBaseUrl}/api/v1/agents/${agentId}/trigger/history`,
        );
        if (res.ok) {
          const d = await res.json();
          setTriggerHistory(Array.isArray(d) ? d : (d.records ?? []));
        }
      } catch {
        /* ok */
      }
    };

    poll();
    const interval = setInterval(poll, 10_000);
    return () => clearInterval(interval);
  }, [isReady, agentBaseUrl, agentId, authFetch]);

  // ── Update cron ──────────────────────────────────────────────────────────

  const handleUpdateCron = useCallback(async () => {
    if (!agentBaseUrl || !editCron.trim()) return;
    setIsUpdating(true);
    try {
      const res = await authFetch(
        `${agentBaseUrl}/api/v1/agents/${agentId}/trigger`,
        {
          method: 'PUT',
          body: JSON.stringify({ cron: editCron.trim() }),
        },
      );
      if (res.ok) {
        const d = await res.json();
        setCronExpr(d.cron ?? editCron.trim());
        if (d.next_run) setNextRun(d.next_run);
      }
    } catch {
      /* ok */
    } finally {
      setIsUpdating(false);
    }
  }, [agentBaseUrl, agentId, editCron, authFetch]);

  // ── Manual trigger ───────────────────────────────────────────────────────

  const handleTriggerNow = useCallback(async () => {
    if (!agentBaseUrl) return;
    setIsTriggeringNow(true);
    setTriggerFlash(null);
    try {
      const res = await authFetch(
        `${agentBaseUrl}/api/v1/agents/${agentId}/trigger/run`,
        { method: 'POST', body: JSON.stringify({ source: 'manual' }) },
      );
      if (res.ok) {
        setTriggerFlash('Trigger fired successfully');
      } else {
        setTriggerFlash(`Trigger failed (${res.status})`);
      }
    } catch {
      setTriggerFlash('Network error');
    } finally {
      setIsTriggeringNow(false);
    }
  }, [agentBaseUrl, agentId, authFetch]);

  // ── Webhook management ─────────────────────────────────────────────────

  const handleGenerateWebhook = useCallback(async () => {
    if (!agentBaseUrl) return;
    setIsUpdating(true);
    try {
      const res = await authFetch(
        `${agentBaseUrl}/api/v1/agents/${agentId}/trigger/webhook`,
        { method: 'POST' },
      );
      if (res.ok) {
        const d = await res.json();
        setWebhookUrl(d.url ?? null);
        setWebhookSecret(d.secret ?? null);
        setWebhookEnabled(true);
      }
    } catch {
      /* ok */
    } finally {
      setIsUpdating(false);
    }
  }, [agentBaseUrl, agentId, authFetch]);

  const handleToggleWebhook = useCallback(async () => {
    if (!agentBaseUrl) return;
    try {
      await authFetch(
        `${agentBaseUrl}/api/v1/agents/${agentId}/trigger/webhook`,
        {
          method: 'PATCH',
          body: JSON.stringify({ enabled: !webhookEnabled }),
        },
      );
      setWebhookEnabled(prev => !prev);
    } catch {
      /* ok */
    }
  }, [agentBaseUrl, agentId, webhookEnabled, authFetch]);

  // ── Event subscription ─────────────────────────────────────────────────

  const handleSubscribeEvent = useCallback(async () => {
    if (!agentBaseUrl || !eventTopic.trim()) return;
    setIsUpdating(true);
    try {
      const res = await authFetch(
        `${agentBaseUrl}/api/v1/agents/${agentId}/trigger/event`,
        {
          method: 'POST',
          body: JSON.stringify({
            topic: eventTopic.trim(),
            filter: eventFilter.trim() || undefined,
          }),
        },
      );
      if (res.ok) {
        setEventSubscribed(true);
      }
    } catch {
      /* ok */
    } finally {
      setIsUpdating(false);
    }
  }, [agentBaseUrl, agentId, eventTopic, eventFilter, authFetch]);

  // ── Launch once trigger ──────────────────────────────────────────────────

  const handleLaunchOnce = useCallback(async () => {
    if (!agentBaseUrl) return;
    setIsLaunchingOnce(true);
    setOnceFlash(null);
    try {
      const res = await authFetch(
        `${agentBaseUrl}/api/v1/agents/${agentId}/trigger/run`,
        { method: 'POST', body: JSON.stringify({ source: 'once' }) },
      );
      if (res.ok) {
        setOnceFlash('Once trigger launched — agent will run and terminate.');
      } else {
        setOnceFlash(`Launch failed (${res.status})`);
      }
    } catch {
      setOnceFlash('Network error');
    } finally {
      setIsLaunchingOnce(false);
    }
  }, [agentBaseUrl, agentId, authFetch]);

  // ── Loading / Error ──────────────────────────────────────────────────────

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
            ? 'Launching runtime for trigger agent…'
            : 'Creating trigger demo agent…'}
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
        <ClockIcon size={16} />
        <Heading as="h3" sx={{ fontSize: 2, flex: 1 }}>
          Triggers — {podName}
        </Heading>
        {token && <UserBadge token={token} variant="small" />}
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
            protocol="ag-ui"
            baseUrl={agentBaseUrl}
            agentId={agentId}
            title="Trigger Agent"
            placeholder="Ask about your scheduled or event-driven KPI reports…"
            description={`Cron: ${cronExpr} | Webhook: ${webhookEnabled ? 'on' : 'off'} | Event: ${eventSubscribed ? eventTopic : 'none'}`}
            showHeader={true}
            autoFocus
            height="100%"
            runtimeId={podName}
            historyEndpoint={`${agentBaseUrl}/api/v1/history`}
            suggestions={[
              {
                title: 'Last run',
                message: 'What happened in the last scheduled run?',
              },
              { title: 'KPIs today', message: "Show me today's KPI summary" },
            ]}
            submitOnSuggestionClick
          />
        </Box>

        {/* Right: Trigger panel */}
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
          {/* Trigger type tabs */}
          <Box
            sx={{
              display: 'flex',
              borderBottom: '1px solid',
              borderColor: 'border.default',
              flexShrink: 0,
            }}
          >
            {(
              [
                { key: 'once' as TriggerTab, icon: ZapIcon, label: 'Once' },
                { key: 'cron' as TriggerTab, icon: ClockIcon, label: 'Cron' },
                {
                  key: 'webhook' as TriggerTab,
                  icon: GlobeIcon,
                  label: 'Webhook',
                },
                { key: 'event' as TriggerTab, icon: ZapIcon, label: 'Event' },
                {
                  key: 'manual' as TriggerTab,
                  icon: PlayIcon,
                  label: 'Manual',
                },
              ] as const
            ).map(t => (
              <Button
                key={t.key}
                size="small"
                variant="invisible"
                leadingVisual={t.icon}
                onClick={() => setActiveTab(t.key)}
                sx={{
                  flex: 1,
                  borderRadius: 0,
                  borderBottom:
                    activeTab === t.key ? '2px solid' : '2px solid transparent',
                  borderColor:
                    activeTab === t.key ? 'accent.fg' : 'transparent',
                  fontWeight: activeTab === t.key ? 'bold' : 'normal',
                }}
              >
                {t.label}
              </Button>
            ))}
          </Box>

          {/* ── Once tab ──────────────────────────────────────────────── */}
          {activeTab === 'once' && (
            <Box
              sx={{
                p: 3,
                borderBottom: '1px solid',
                borderColor: 'border.default',
              }}
            >
              <Box
                sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}
              >
                <ZapIcon size={16} />
                <Heading as="h3" sx={{ fontSize: 2 }}>
                  Once Trigger
                </Heading>
              </Box>

              <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', mb: 3 }}>
                Launch the agent once. It will execute its trigger prompt, emit
                lifecycle events (AGENT_STARTED / AGENT_ENDED), and then
                terminate the runtime automatically.
              </Text>

              <Button
                size="small"
                variant="primary"
                leadingVisual={ZapIcon}
                onClick={handleLaunchOnce}
                disabled={isLaunchingOnce}
                sx={{ width: '100%' }}
              >
                {isLaunchingOnce ? 'Launching…' : 'Launch Once'}
              </Button>

              {onceFlash && (
                <Flash
                  variant={
                    onceFlash.includes('launched') ? 'success' : 'danger'
                  }
                  sx={{ mt: 2, fontSize: 0 }}
                >
                  {onceFlash}
                </Flash>
              )}
            </Box>
          )}

          {/* ── Cron tab ─────────────────────────────────────────────── */}
          {activeTab === 'cron' && (
            <Box
              sx={{
                p: 3,
                borderBottom: '1px solid',
                borderColor: 'border.default',
              }}
            >
              <Box
                sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}
              >
                <ClockIcon size={16} />
                <Heading as="h3" sx={{ fontSize: 2 }}>
                  Cron Schedule
                </Heading>
              </Box>

              <Label variant="primary" sx={{ mb: 2, display: 'inline-block' }}>
                Current: {cronExpr}
              </Label>

              {nextRun && (
                <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', mb: 2 }}>
                  Next run: {new Date(nextRun).toLocaleString()}
                </Text>
              )}

              <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                <TextInput
                  value={editCron}
                  onChange={e => setEditCron(e.target.value)}
                  placeholder="* * * * *"
                  sx={{ flex: 1 }}
                  size="small"
                />
                <Button
                  size="small"
                  variant="primary"
                  leadingVisual={SyncIcon}
                  onClick={handleUpdateCron}
                  disabled={isUpdating}
                >
                  {isUpdating ? 'Saving…' : 'Update'}
                </Button>
              </Box>

              <Text as="p" sx={{ fontSize: 0, color: 'fg.muted' }}>
                Standard cron syntax: minute hour day month weekday
              </Text>
            </Box>
          )}

          {/* ── Webhook tab ──────────────────────────────────────────── */}
          {activeTab === 'webhook' && (
            <Box
              sx={{
                p: 3,
                borderBottom: '1px solid',
                borderColor: 'border.default',
              }}
            >
              <Box
                sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}
              >
                <GlobeIcon size={16} />
                <Heading as="h3" sx={{ fontSize: 2 }}>
                  Webhook Trigger
                </Heading>
              </Box>

              <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', mb: 3 }}>
                Generate a unique URL that triggers this agent on incoming HTTP
                POST requests. Useful for CI/CD pipelines, external services, or
                custom integrations.
              </Text>

              {webhookUrl ? (
                <>
                  <Label
                    variant={webhookEnabled ? 'success' : 'secondary'}
                    sx={{ mb: 2, display: 'inline-block' }}
                  >
                    {webhookEnabled ? 'Active' : 'Disabled'}
                  </Label>

                  <Box
                    sx={{
                      bg: 'canvas.subtle',
                      p: 2,
                      borderRadius: 2,
                      mb: 2,
                      fontFamily: 'mono',
                      fontSize: 0,
                      wordBreak: 'break-all',
                    }}
                  >
                    {webhookUrl}
                  </Box>

                  {webhookSecret && (
                    <Box sx={{ mb: 2 }}>
                      <Text sx={{ fontSize: 0, fontWeight: 'bold' }}>
                        Secret:
                      </Text>
                      <Box
                        sx={{
                          bg: 'canvas.subtle',
                          p: 2,
                          borderRadius: 2,
                          mt: 1,
                          fontFamily: 'mono',
                          fontSize: 0,
                        }}
                      >
                        {webhookSecret}
                      </Box>
                    </Box>
                  )}

                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <Button
                      size="small"
                      leadingVisual={CopyIcon}
                      onClick={() => navigator.clipboard.writeText(webhookUrl)}
                    >
                      Copy URL
                    </Button>
                    <Button
                      size="small"
                      variant={webhookEnabled ? 'danger' : 'primary'}
                      onClick={handleToggleWebhook}
                    >
                      {webhookEnabled ? 'Disable' : 'Enable'}
                    </Button>
                  </Box>
                </>
              ) : (
                <Button
                  size="small"
                  variant="primary"
                  leadingVisual={GlobeIcon}
                  onClick={handleGenerateWebhook}
                  disabled={isUpdating}
                  sx={{ width: '100%' }}
                >
                  {isUpdating ? 'Generating…' : 'Generate Webhook URL'}
                </Button>
              )}
            </Box>
          )}

          {/* ── Event tab ────────────────────────────────────────────── */}
          {activeTab === 'event' && (
            <Box
              sx={{
                p: 3,
                borderBottom: '1px solid',
                borderColor: 'border.default',
              }}
            >
              <Box
                sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}
              >
                <ZapIcon size={16} />
                <Heading as="h3" sx={{ fontSize: 2 }}>
                  Event Trigger
                </Heading>
              </Box>

              <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', mb: 3 }}>
                Subscribe to a Kafka topic or internal event stream. The agent
                triggers on matching messages.
              </Text>

              {eventSubscribed ? (
                <>
                  <Label
                    variant="success"
                    sx={{ mb: 2, display: 'inline-block' }}
                  >
                    Subscribed to: {eventTopic}
                  </Label>
                  {eventFilter && (
                    <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', mb: 2 }}>
                      Filter: {eventFilter}
                    </Text>
                  )}
                  <Button
                    size="small"
                    variant="danger"
                    onClick={() => setEventSubscribed(false)}
                    sx={{ width: '100%' }}
                  >
                    Unsubscribe
                  </Button>
                </>
              ) : (
                <>
                  <TextInput
                    value={eventTopic}
                    onChange={e => setEventTopic(e.target.value)}
                    placeholder="e.g. kpi.daily-report"
                    sx={{ width: '100%', mb: 2 }}
                    size="small"
                  />
                  <TextInput
                    value={eventFilter}
                    onChange={e => setEventFilter(e.target.value)}
                    placeholder="Optional JSONPath filter"
                    sx={{ width: '100%', mb: 2 }}
                    size="small"
                  />
                  <Button
                    size="small"
                    variant="primary"
                    leadingVisual={ZapIcon}
                    onClick={handleSubscribeEvent}
                    disabled={isUpdating || !eventTopic.trim()}
                    sx={{ width: '100%' }}
                  >
                    {isUpdating ? 'Subscribing…' : 'Subscribe'}
                  </Button>
                </>
              )}
            </Box>
          )}

          {/* ── Manual tab ───────────────────────────────────────────── */}
          {activeTab === 'manual' && (
            <Box
              sx={{
                p: 3,
                borderBottom: '1px solid',
                borderColor: 'border.default',
              }}
            >
              <Box
                sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}
              >
                <PlayIcon size={16} />
                <Heading as="h3" sx={{ fontSize: 2 }}>
                  Manual Trigger
                </Heading>
              </Box>

              <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', mb: 3 }}>
                Fire the agent immediately. This is equivalent to the cron job
                executing but bypasses the schedule.
              </Text>

              <Button
                size="small"
                leadingVisual={PlayIcon}
                onClick={handleTriggerNow}
                disabled={isTriggeringNow}
                sx={{ width: '100%' }}
              >
                {isTriggeringNow ? 'Triggering…' : 'Trigger Now'}
              </Button>

              {triggerFlash && (
                <Flash
                  variant={
                    triggerFlash.includes('success') ? 'success' : 'danger'
                  }
                  sx={{ mt: 2, fontSize: 0 }}
                >
                  {triggerFlash}
                </Flash>
              )}
            </Box>
          )}

          {/* Trigger history */}
          <Box sx={{ p: 3, flex: 1, overflow: 'auto' }}>
            <Heading as="h4" sx={{ fontSize: 1, mb: 2 }}>
              Trigger History
            </Heading>

            {triggerHistory.length === 0 ? (
              <Text sx={{ color: 'fg.muted', fontSize: 0 }}>
                No trigger runs recorded yet.
              </Text>
            ) : (
              <Timeline>
                {triggerHistory.slice(0, 20).map(rec => (
                  <Timeline.Item key={rec.id}>
                    <Timeline.Badge>
                      {rec.status === 'success' ? (
                        <CheckCircleIcon />
                      ) : rec.status === 'failure' ? (
                        <XCircleIcon />
                      ) : (
                        <Spinner size="small" />
                      )}
                    </Timeline.Badge>
                    <Timeline.Body>
                      <Text sx={{ fontSize: 0 }}>
                        {new Date(rec.timestamp).toLocaleString()}
                        {' — '}
                        <Label
                          variant={
                            rec.status === 'success'
                              ? 'success'
                              : rec.status === 'failure'
                                ? 'danger'
                                : 'accent'
                          }
                          size="small"
                        >
                          {rec.status}
                        </Label>
                        {rec.duration_ms != null && (
                          <Text sx={{ ml: 1, color: 'fg.muted' }}>
                            ({(rec.duration_ms / 1000).toFixed(1)}s)
                          </Text>
                        )}
                      </Text>
                    </Timeline.Body>
                  </Timeline.Item>
                ))}
              </Timeline>
            )}

            {/* Agent Events */}
            <Heading as="h4" sx={{ fontSize: 1, mt: 3, mb: 2 }}>
              Agent Events
            </Heading>

            {agentEvents.length === 0 ? (
              <Text sx={{ color: 'fg.muted', fontSize: 0 }}>
                No agent events yet.
              </Text>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {agentEvents.map((evt: AgentEvent) => (
                  <Box
                    key={evt.id}
                    sx={{
                      p: 2,
                      bg: evt.read ? 'canvas.subtle' : 'accent.subtle',
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: evt.read ? 'border.default' : 'accent.muted',
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        mb: 1,
                      }}
                    >
                      <Label
                        variant={
                          evt.kind === 'agent-started'
                            ? 'accent'
                            : evt.kind === 'agent-ended'
                              ? 'success'
                              : evt.kind?.includes('alert')
                                ? 'danger'
                                : 'attention'
                        }
                        size="small"
                      >
                        {evt.kind}
                      </Label>
                      <Text sx={{ flex: 1, fontSize: 0, fontWeight: 'bold' }}>
                        {evt.title}
                      </Text>
                      <Button
                        size="small"
                        variant="invisible"
                        onClick={() =>
                          evt.read
                            ? markUnreadMutation.mutate(evt.id)
                            : markReadMutation.mutate(evt.id)
                        }
                        sx={{ p: 1 }}
                      >
                        {evt.read ? (
                          <EyeClosedIcon size={12} />
                        ) : (
                          <EyeIcon size={12} />
                        )}
                      </Button>
                      <Button
                        size="small"
                        variant="invisible"
                        onClick={() => deleteEventMutation.mutate(evt.id)}
                        sx={{ p: 1, color: 'danger.fg' }}
                      >
                        <TrashIcon size={12} />
                      </Button>
                    </Box>
                    {/* Event-type-specific fields */}
                    {evt.payload && (
                      <Box sx={{ fontSize: 0, color: 'fg.muted' }}>
                        {evt.kind === 'agent-ended' && evt.payload.outputs && (
                          <Text as="p" sx={{ mb: 1 }}>
                            Output: {String(evt.payload.outputs).slice(0, 200)}
                          </Text>
                        )}
                        {evt.kind === 'agent-ended' &&
                          evt.payload.duration_ms != null && (
                            <Text as="p">
                              Duration:{' '}
                              {(Number(evt.payload.duration_ms) / 1000).toFixed(
                                1,
                              )}
                              s
                            </Text>
                          )}
                        {evt.kind?.includes('guardrail') &&
                          evt.payload.message && (
                            <Text as="p">{String(evt.payload.message)}</Text>
                          )}
                      </Box>
                    )}
                  </Box>
                ))}
              </Box>
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

const AgentTriggersExample: React.FC = () => {
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
          title="Agent Triggers"
          description="Sign in to configure cron, webhook, event, and manual triggers."
          leadingIcon={<ClockIcon size={24} />}
        />
      </ThemedProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemedProvider>
        <AgentTriggerInner onLogout={handleLogout} />
      </ThemedProvider>
    </QueryClientProvider>
  );
};

export default AgentTriggersExample;
