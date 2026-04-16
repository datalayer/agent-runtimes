/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AgentSandboxExample
 *
 * Demonstrates sandbox variant switching (eval / jupyter) with a live
 * sidebar that streams WebSocket messages to and from the
 * `/configure/sandbox/ws` endpoint.
 *
 * - Creates a local agent (spec: demo-full) with codemode enabled
 * - SegmentedControl toggles between "eval" and "jupyter" variants
 * - Sidebar shows live sandbox status, WebSocket event log, and an
 *   interrupt button
 *
 * @module examples/AgentSandboxExample
 */

/// <reference types="vite/client" />

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Box } from '@datalayer/primer-addons';
import { ErrorView } from './components';
import {
  Button,
  Flash,
  Heading,
  Label,
  SegmentedControl,
  Spinner,
  Text,
} from '@primer/react';
import {
  CodeIcon,
  SignOutIcon,
  StopIcon,
  TerminalIcon,
} from '@primer/octicons-react';
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { SignInSimple } from '@datalayer/core/lib/views/iam';
import { UserBadge } from '@datalayer/core/lib/views/profile';
import { ThemedProvider } from './utils/themedProvider';
import { uniqueAgentId } from './utils/agentId';
import { Chat } from '../chat';
import type { SandboxWsStatus } from '../types/sandbox';
import { SANDBOX_STATUS_COLORS, SANDBOX_STATUS_LABELS } from '../types/sandbox';
import type { SandboxAggregateStatus } from '../types/sandbox';

// ─── Constants ─────────────────────────────────────────────────────────────

const queryClient = new QueryClient();
const AGENT_NAME = 'sandbox-demo-agent';
const AGENT_SPEC_ID = 'demo-full';
const DEFAULT_LOCAL_BASE_URL =
  import.meta.env.VITE_BASE_URL || 'http://localhost:8765';

type SandboxVariant = 'eval' | 'jupyter';

// ─── WebSocket log entry ───────────────────────────────────────────────────

interface WsLogEntry {
  id: number;
  ts: string;
  direction: 'recv' | 'sent';
  raw: string;
}

interface LastSwitchInfo {
  variant: string;
  switchedAt: string;
}

let _logId = 0;

function tsNow(): string {
  return new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
}

function formatSwitchTime(isoTs: string): string {
  const d = new Date(isoTs);
  return d.toLocaleTimeString();
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function deriveAggregate(
  status: SandboxWsStatus | null,
): SandboxAggregateStatus {
  if (
    !status ||
    status.variant === 'unavailable' ||
    status.variant === 'error'
  ) {
    return 'unavailable';
  }
  if (!status.sandbox_running) return 'stopped';
  if (status.is_executing) return 'executing';
  return 'idle';
}

function apiVariantFromUi(variant: SandboxVariant): 'eval' | 'jupyter' {
  return variant;
}

// ─── Inner component (after auth) ──────────────────────────────────────────

const AgentSandboxInner: React.FC<{ onLogout: () => void }> = ({
  onLogout,
}) => {
  const { token } = useSimpleAuthStore();
  const agentName = useRef(uniqueAgentId(AGENT_NAME)).current;
  const chatAuthToken: string | undefined = token === null ? undefined : token;
  const agentBaseUrl = DEFAULT_LOCAL_BASE_URL;

  // ── Agent lifecycle ──
  const [runtimeStatus, setRuntimeStatus] = useState<
    'launching' | 'ready' | 'error'
  >('launching');
  const [isReady, setIsReady] = useState(false);
  const [hookError, setHookError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string>(agentName);
  const [isReconnectedAgent, setIsReconnectedAgent] = useState(false);

  // ── Sandbox variant toggle ──
  const [variant, setVariant] = useState<SandboxVariant>('eval');
  const [variantSwitching, setVariantSwitching] = useState(false);
  const [lastSwitch, setLastSwitch] = useState<LastSwitchInfo | null>(null);

  // ── WebSocket state ──
  const [wsState, setWsState] = useState<'connecting' | 'connected' | 'closed'>(
    'closed',
  );
  const [sandboxStatus, setSandboxStatus] = useState<SandboxWsStatus | null>(
    null,
  );
  const [wsLog, setWsLog] = useState<WsLogEntry[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const addLog = useCallback((direction: 'recv' | 'sent', raw: string) => {
    setWsLog(prev => {
      const next = [{ id: ++_logId, ts: tsNow(), direction, raw }, ...prev];
      // Keep newest 200 entries
      return next.slice(0, 200);
    });
  }, []);

  // ── Auth fetch helper ──
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

  // ── Create local agent ──
  useEffect(() => {
    let isCancelled = false;

    const createLocalAgent = async () => {
      setRuntimeStatus('launching');
      setIsReady(false);
      setHookError(null);
      setIsReconnectedAgent(false);

      try {
        // Always delete any existing agent with this name first so we
        // recreate it with the latest configuration (system prompt, toolsets).
        await authFetch(`${agentBaseUrl}/api/v1/agents/${agentName}`, {
          method: 'DELETE',
        }).catch(() => {
          /* ignore 404 / not-found */
        });

        const response = await authFetch(`${agentBaseUrl}/api/v1/agents`, {
          method: 'POST',
          body: JSON.stringify({
            name: agentName,
            description: 'Agent with sandbox code execution',
            agent_library: 'pydantic-ai',
            transport: 'vercel-ai',
            agent_spec_id: AGENT_SPEC_ID,
            system_prompt:
              'You are a helpful AI assistant with a Python execution sandbox. ' +
              'When asked to run code, count, loop, assign variables, compute, or ' +
              'perform any programming task, use the execute_code tool to run ' +
              'Python code in the sandbox. Always use execute_code for Python computation.',
            enable_skills: false,
            skills: [],
            tools: [],
            selected_mcp_servers: [],
            enable_codemode: true,
            sandbox_variant: 'eval',
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

          throw new Error(
            detail || `Failed to create local agent: ${response.status}`,
          );
        }

        if (!isCancelled) {
          // Ensure codemode is active and sandbox is initialized.
          addLog('sent', 'POST /configure/codemode/toggle {enabled:true}');
          const toggleResp = await authFetch(
            `${agentBaseUrl}/api/v1/configure/codemode/toggle`,
            {
              method: 'POST',
              body: JSON.stringify({
                enabled: true,
              }),
            },
          );
          addLog(
            'recv',
            `HTTP ${toggleResp.status} /configure/codemode/toggle`,
          );
          if (!toggleResp.ok) {
            const text = await toggleResp.text().catch(() => '');
            throw new Error(
              text || `Failed to activate codemode (${toggleResp.status})`,
            );
          }

          addLog('sent', 'POST /agents/sandbox/configure {variant:eval}');
          const configureResp = await authFetch(
            `${agentBaseUrl}/api/v1/agents/sandbox/configure`,
            {
              method: 'POST',
              body: JSON.stringify({
                variant: 'eval',
              }),
            },
          );
          addLog(
            'recv',
            `HTTP ${configureResp.status} /agents/sandbox/configure`,
          );
          if (!configureResp.ok) {
            const text = await configureResp.text().catch(() => '');
            throw new Error(
              text ||
                `Failed to configure initial sandbox (${configureResp.status})`,
            );
          }
          const configureData = await configureResp.json().catch(() => null);

          addLog('sent', 'POST /agents/sandbox/restart');
          const restartResp = await authFetch(
            `${agentBaseUrl}/api/v1/agents/sandbox/restart`,
            {
              method: 'POST',
            },
          );
          addLog('recv', `HTTP ${restartResp.status} /agents/sandbox/restart`);
          if (!restartResp.ok) {
            const text = await restartResp.text().catch(() => '');
            throw new Error(
              text || `Failed to restart sandbox (${restartResp.status})`,
            );
          }
          await restartResp.json().catch(() => null);

          setLastSwitch({
            variant: String(configureData?.variant || 'eval'),
            switchedAt: new Date().toISOString(),
          });

          setAgentId(resolvedAgentId);
          setIsReconnectedAgent(false);
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
  }, [agentBaseUrl, authFetch]);

  // ── Handle variant switch ──
  const switchVariant = useCallback(
    async (newVariant: SandboxVariant) => {
      if (newVariant === variant) return;
      setVariantSwitching(true);
      try {
        // Keep codemode active, then reconfigure sandbox manager variant.
        addLog('sent', 'POST /configure/codemode/toggle {enabled:true}');
        const toggleResp = await authFetch(
          `${agentBaseUrl}/api/v1/configure/codemode/toggle`,
          {
            method: 'POST',
            body: JSON.stringify({
              enabled: true,
            }),
          },
        );
        addLog('recv', `HTTP ${toggleResp.status} /configure/codemode/toggle`);
        if (!toggleResp.ok) {
          const text = await toggleResp.text().catch(() => '');
          throw new Error(
            text || `Failed to keep codemode enabled (${toggleResp.status})`,
          );
        }

        addLog(
          'sent',
          `POST /agents/sandbox/configure {variant:${apiVariantFromUi(newVariant)}}`,
        );
        const configureResp = await authFetch(
          `${agentBaseUrl}/api/v1/agents/sandbox/configure`,
          {
            method: 'POST',
            body: JSON.stringify({
              variant: apiVariantFromUi(newVariant),
            }),
          },
        );
        addLog(
          'recv',
          `HTTP ${configureResp.status} /agents/sandbox/configure`,
        );
        if (!configureResp.ok) {
          const text = await configureResp.text().catch(() => '');
          throw new Error(
            text || `Failed to switch variant (${configureResp.status})`,
          );
        }
        const configureData = await configureResp.json().catch(() => null);

        addLog('sent', 'POST /agents/sandbox/restart');
        const restartResp = await authFetch(
          `${agentBaseUrl}/api/v1/agents/sandbox/restart`,
          {
            method: 'POST',
          },
        );
        addLog('recv', `HTTP ${restartResp.status} /agents/sandbox/restart`);
        if (!restartResp.ok) {
          const text = await restartResp.text().catch(() => '');
          throw new Error(
            text || `Failed to restart sandbox (${restartResp.status})`,
          );
        }
        await restartResp.json().catch(() => null);

        setVariant(newVariant);
        setLastSwitch({
          variant: String(
            configureData?.variant || apiVariantFromUi(newVariant),
          ),
          switchedAt: new Date().toISOString(),
        });
      } catch (error) {
        setHookError(
          error instanceof Error ? error.message : 'Failed to switch variant',
        );
      } finally {
        setVariantSwitching(false);
      }
    },
    [variant, agentBaseUrl, authFetch],
  );

  // ── WebSocket lifecycle ──
  useEffect(() => {
    if (!isReady) return;

    let disposed = false;

    const wsBase = agentBaseUrl.replace(/^http/, 'ws');
    const wsUrl = `${wsBase}/api/v1/configure/sandbox/ws?agent_id=${encodeURIComponent(agentId)}`;

    function connect() {
      if (disposed) return;
      setWsState('connecting');

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setWsState('connected');
        wsRef.current = ws;
        addLog('recv', '— WebSocket connected —');
      };

      ws.onmessage = event => {
        try {
          const msg = JSON.parse(event.data);
          addLog('recv', event.data);

          // Interrupt acks
          if (msg.action === 'interrupt') return;

          setSandboxStatus(msg as SandboxWsStatus);
        } catch {
          addLog('recv', `[unparseable] ${event.data}`);
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (!disposed) {
          setWsState('closed');
          addLog('recv', '— WebSocket closed, reconnecting… —');
          reconnectTimerRef.current = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      disposed = true;
      clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
      setWsState('closed');
    };
  }, [isReady, agentBaseUrl, agentId, addLog]);

  // ── Send interrupt via WS ──
  const sendInterrupt = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      const payload = JSON.stringify({ action: 'interrupt' });
      ws.send(payload);
      addLog('sent', payload);
    }
  }, [addLog]);

  // ── Derived display ──
  const aggregate = useMemo(
    () => deriveAggregate(sandboxStatus),
    [sandboxStatus],
  );
  const statusColor = SANDBOX_STATUS_COLORS[aggregate];
  const statusLabel = SANDBOX_STATUS_LABELS[aggregate];

  // ── Loading state ──
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
        <Text sx={{ color: 'fg.muted' }}>Launching sandbox demo…</Text>
      </Box>
    );
  }

  // ── Error state ──
  if (runtimeStatus === 'error' || hookError) {
    return <ErrorView error={hookError} onLogout={onLogout} />;
  }

  // ── Sidebar ──
  const sidebar = (
    <Box
      sx={{
        width: 360,
        minWidth: 300,
        borderLeft: '1px solid',
        borderColor: 'border.default',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        bg: 'canvas.subtle',
      }}
    >
      {/* ── Header ── */}
      <Box
        sx={{
          p: 2,
          borderBottom: '1px solid',
          borderColor: 'border.default',
        }}
      >
        <Heading as="h4" sx={{ fontSize: 1, mb: 1 }}>
          Sandbox Details
        </Heading>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            flexWrap: 'wrap',
          }}
        >
          <Label
            variant={
              wsState === 'connected'
                ? 'success'
                : wsState === 'connecting'
                  ? 'attention'
                  : 'secondary'
            }
          >
            WS: {wsState}
          </Label>
          <Box
            as="span"
            sx={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: '50%',
              bg: statusColor,
              flexShrink: 0,
            }}
          />
          <Text sx={{ fontSize: 0, color: 'fg.muted' }}>{statusLabel}</Text>
        </Box>
        <Text sx={{ fontSize: 0, color: 'fg.muted', mt: 1, display: 'block' }}>
          Last switch:{' '}
          {lastSwitch
            ? `${lastSwitch.variant} at ${formatSwitchTime(lastSwitch.switchedAt)}`
            : 'n/a'}
        </Text>
      </Box>

      {/* ── Status detail card ── */}
      {sandboxStatus && (
        <Box
          sx={{
            mx: 2,
            mt: 2,
            p: 2,
            border: '1px solid',
            borderColor: 'border.default',
            borderRadius: 2,
            bg: 'canvas.default',
            fontSize: 0,
            fontFamily: 'mono',
          }}
        >
          <Box sx={{ mb: 1 }}>
            <Text sx={{ fontWeight: 600 }}>variant: </Text>
            <Text>{sandboxStatus.variant}</Text>
          </Box>
          <Box sx={{ mb: 1 }}>
            <Text sx={{ fontWeight: 600 }}>sandbox_running: </Text>
            <Text>{String(sandboxStatus.sandbox_running)}</Text>
          </Box>
          <Box sx={{ mb: 1 }}>
            <Text sx={{ fontWeight: 600 }}>is_executing: </Text>
            <Label
              variant={sandboxStatus.is_executing ? 'accent' : 'secondary'}
            >
              {String(sandboxStatus.is_executing)}
            </Label>
          </Box>
          {sandboxStatus.jupyter_url && (
            <Box sx={{ mb: 1 }}>
              <Text sx={{ fontWeight: 600 }}>jupyter_url: </Text>
              <Text sx={{ wordBreak: 'break-all' }}>
                {sandboxStatus.jupyter_url}
              </Text>
            </Box>
          )}
          {sandboxStatus.error && (
            <Flash variant="danger" sx={{ mt: 1, fontSize: 0, p: 1 }}>
              {sandboxStatus.error}
            </Flash>
          )}
        </Box>
      )}

      {/* ── Interrupt button ── */}
      <Box sx={{ mx: 2, mt: 2 }}>
        <Button
          size="small"
          variant="danger"
          disabled={aggregate !== 'executing'}
          onClick={sendInterrupt}
          leadingVisual={StopIcon}
          block
        >
          Interrupt Execution
        </Button>
      </Box>

      {/* ── WebSocket log ── */}
      <Box
        sx={{
          mx: 2,
          mt: 2,
          mb: 2,
          flex: 1,
          border: '1px solid',
          borderColor: 'border.default',
          borderRadius: 2,
          bg: 'canvas.default',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        <Box
          sx={{
            px: 2,
            py: 1,
            borderBottom: '1px solid',
            borderColor: 'border.default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text sx={{ fontWeight: 600, fontSize: 0 }}>
            WebSocket Log ({wsLog.length})
          </Text>
          <Button
            size="small"
            variant="invisible"
            onClick={() => setWsLog([])}
            sx={{ fontSize: 0, px: 1 }}
          >
            Clear
          </Button>
        </Box>
        <Box
          sx={{
            overflow: 'auto',
            flex: 1,
            fontFamily: 'mono',
            fontSize: '11px',
            lineHeight: '18px',
          }}
        >
          {wsLog.length === 0 ? (
            <Text
              sx={{ color: 'fg.muted', p: 2, display: 'block', fontSize: 0 }}
            >
              No messages yet.
            </Text>
          ) : (
            wsLog.map(entry => (
              <Box
                key={entry.id}
                sx={{
                  px: 2,
                  py: '2px',
                  color:
                    entry.direction === 'sent' ? 'accent.fg' : 'fg.default',
                  bg:
                    entry.direction === 'sent'
                      ? 'accent.subtle'
                      : 'transparent',
                  borderBottom: '1px solid',
                  borderColor: 'border.subtle',
                  wordBreak: 'break-all',
                }}
              >
                <Text
                  sx={{
                    color: 'fg.muted',
                    mr: 1,
                    userSelect: 'none',
                  }}
                >
                  {entry.ts}
                </Text>
                <Text
                  sx={{
                    fontWeight: entry.direction === 'sent' ? 600 : 400,
                  }}
                >
                  {entry.direction === 'sent' ? '▲ ' : '▼ '}
                  {entry.raw}
                </Text>
              </Box>
            ))
          )}
        </Box>
      </Box>
    </Box>
  );

  return (
    <Box
      sx={{
        height: 'calc(100vh - 60px)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {isReconnectedAgent && (
        <Box
          sx={{
            px: 3,
            py: 1,
            borderBottom: '1px solid',
            borderColor: 'border.default',
          }}
        >
          <Text sx={{ color: 'fg.muted', fontSize: 0 }}>
            Agent already running — reconnected.
          </Text>
        </Box>
      )}

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Chat
            protocol="vercel-ai"
            baseUrl={agentBaseUrl}
            agentId={agentId}
            authToken={chatAuthToken}
            title="Sandbox Agent"
            placeholder="Ask the agent to write and run code…"
            showHeader={true}
            showNewChatButton={true}
            showClearButton={false}
            showTokenUsage={true}
            autoFocus
            height="100%"
            runtimeId={agentId}
            historyEndpoint={`${agentBaseUrl}/api/v1/history`}
            headerActions={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <SegmentedControl
                  aria-label="Sandbox variant"
                  size="small"
                  onChange={index =>
                    void switchVariant(index === 0 ? 'eval' : 'jupyter')
                  }
                >
                  <SegmentedControl.Button
                    selected={variant === 'eval'}
                    leadingIcon={TerminalIcon}
                  >
                    eval
                  </SegmentedControl.Button>
                  <SegmentedControl.Button
                    selected={variant === 'jupyter'}
                    leadingIcon={CodeIcon}
                  >
                    jupyter
                  </SegmentedControl.Button>
                </SegmentedControl>
                {variantSwitching && <Spinner size="small" />}
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
            }
            suggestions={[
              {
                title: 'Run some Python',
                message:
                  'Write a Python script that computes the first 20 Fibonacci numbers and prints them.',
              },
              {
                title: 'Generate a plot',
                message:
                  'Write Python code to generate a matplotlib bar chart of the top 5 programming languages by popularity, and save it to chart.png.',
              },
              {
                title: 'Long-running task',
                message:
                  'Write Python code that counts from 1 to 30 with a 1-second sleep between each number, printing each one.',
              },
            ]}
            submitOnSuggestionClick
          />
        </Box>

        {sidebar}
      </Box>
    </Box>
  );
};

// ─── Auth wrapper ──────────────────────────────────────────────────────────

const syncTokenToIamStore = (newToken: string) => {
  import('@datalayer/core/lib/state').then(({ iamStore }) => {
    iamStore.setState({ token: newToken });
  });
};

const AgentSandboxExample: React.FC = () => {
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
          title="Sandbox Agent"
          description="Sign in to explore sandbox variants and live WebSocket status."
          leadingIcon={<TerminalIcon size={24} />}
        />
      </ThemedProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemedProvider>
        <AgentSandboxInner onLogout={handleLogout} />
      </ThemedProvider>
    </QueryClientProvider>
  );
};

export default AgentSandboxExample;
