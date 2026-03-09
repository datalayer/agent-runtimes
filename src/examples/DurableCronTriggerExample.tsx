/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * DurableCronTriggerExample
 *
 * Demonstrates cron-based trigger configuration and monitoring for durable agents.
 *
 * - Launches an agent whose spec has `trigger.schedule.cron: "0 8 * * *"`
 * - Shows a control panel to view / update the cron expression
 * - Lists recent trigger history and next scheduled run
 *
 * Backend: `python -m agent_runtimes --port 8765 --debug`
 */

/// <reference types="vite/client" />

import React, { useEffect, useState, useCallback } from 'react';
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
} from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { ThemedProvider } from './stores/themedProvider';
import { Chat } from '../chat';

// ─── Constants ─────────────────────────────────────────────────────────────

const BASE_URL = 'http://localhost:8765';
const AGENT_NAME = 'cron-trigger-demo-agent';
const AGENT_SPEC_ID = 'mocks/monitor-sales-kpis';
const DEFAULT_CRON = '0 8 * * *'; // daily at 08:00 UTC

// ─── Types ─────────────────────────────────────────────────────────────────

interface TriggerRecord {
  id: string;
  timestamp: string;
  status: 'success' | 'failure' | 'running';
  duration_ms?: number;
}

// ─── Component ─────────────────────────────────────────────────────────────

const DurableCronTriggerExample: React.FC = () => {
  const [agentId, setAgentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(true);

  // Cron state
  const [cronExpr, setCronExpr] = useState(DEFAULT_CRON);
  const [editCron, setEditCron] = useState(DEFAULT_CRON);
  const [nextRun, setNextRun] = useState<string | null>(null);
  const [triggerHistory, setTriggerHistory] = useState<TriggerRecord[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isTriggeringNow, setIsTriggeringNow] = useState(false);
  const [triggerFlash, setTriggerFlash] = useState<string | null>(null);

  // ── Create agent ─────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    const create = async () => {
      try {
        const check = await fetch(
          `${BASE_URL}/api/v1/agents/${encodeURIComponent(AGENT_NAME)}`,
        );
        if (check.ok) {
          if (!cancelled) {
            setAgentId(AGENT_NAME);
            setIsCreating(false);
          }
          return;
        }

        const res = await fetch(`${BASE_URL}/api/v1/agents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: AGENT_NAME,
            agent_spec_id: AGENT_SPEC_ID,
            transport: 'ag-ui',
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({ detail: 'Unknown' }));
          if (res.status === 400 && d.detail?.includes('already exists')) {
            if (!cancelled) {
              setAgentId(AGENT_NAME);
              setIsCreating(false);
            }
            return;
          }
          throw new Error(d.detail);
        }
        const data = await res.json();
        if (!cancelled) {
          setAgentId(data.id);
          setIsCreating(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed');
          setIsCreating(false);
        }
      }
    };
    create();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Poll trigger metadata ────────────────────────────────────────────────

  useEffect(() => {
    if (!agentId) return;
    const poll = async () => {
      try {
        const res = await fetch(`${BASE_URL}/api/v1/agents/${agentId}/trigger`);
        if (res.ok) {
          const d = await res.json();
          if (d.cron) setCronExpr(d.cron);
          if (d.next_run) setNextRun(d.next_run);
        }
      } catch {
        /* ok */
      }

      try {
        const res = await fetch(
          `${BASE_URL}/api/v1/agents/${agentId}/trigger/history`,
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
  }, [agentId]);

  // ── Update cron ──────────────────────────────────────────────────────────

  const handleUpdateCron = useCallback(async () => {
    if (!agentId || !editCron.trim()) return;
    setIsUpdating(true);
    try {
      const res = await fetch(`${BASE_URL}/api/v1/agents/${agentId}/trigger`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cron: editCron.trim() }),
      });
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
  }, [agentId, editCron]);

  // ── Manual trigger ───────────────────────────────────────────────────────

  const handleTriggerNow = useCallback(async () => {
    if (!agentId) return;
    setIsTriggeringNow(true);
    setTriggerFlash(null);
    try {
      const res = await fetch(
        `${BASE_URL}/api/v1/agents/${agentId}/trigger/run`,
        { method: 'POST' },
      );
      if (res.ok) {
        setTriggerFlash('Trigger fired successfully');
      } else {
        setTriggerFlash(`Trigger failed (${res.status})`);
      }
    } catch (e) {
      setTriggerFlash('Network error');
    } finally {
      setIsTriggeringNow(false);
    }
  }, [agentId]);

  // ── Loading / Error ──────────────────────────────────────────────────────

  if (isCreating) {
    return (
      <ThemedProvider>
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
            Creating cron trigger demo agent…
          </Text>
        </Box>
      </ThemedProvider>
    );
  }

  if (error || !agentId) {
    return (
      <ThemedProvider>
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
          <Text sx={{ color: 'danger.fg' }}>{error || 'No agent ID'}</Text>
        </Box>
      </ThemedProvider>
    );
  }

  return (
    <ThemedProvider>
      <Box sx={{ height: '100vh', display: 'flex' }}>
        {/* Left: Chat */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Chat
            transport="ag-ui"
            baseUrl={BASE_URL}
            agentId={agentId}
            title="Cron Trigger Agent"
            placeholder="Ask about your scheduled KPI reports…"
            description={`Cron: ${cronExpr}`}
            showHeader={true}
            autoFocus
            height="100%"
            runtimeId={agentId}
            historyEndpoint={`${BASE_URL}/api/v1/history`}
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
            width: 350,
            borderLeft: '1px solid',
            borderColor: 'border.default',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'auto',
          }}
        >
          {/* Cron config */}
          <Box
            sx={{
              p: 3,
              borderBottom: '1px solid',
              borderColor: 'border.default',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
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
          </Box>
        </Box>
      </Box>
    </ThemedProvider>
  );
};

export default DurableCronTriggerExample;
