/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AgentCodeSandboxExample
 *
 * The code sandbox: the agent runs Python through `execute_code` in a sandbox
 * the server manages, and the page shows that sandbox.
 *
 * - The Loop creates the `example-code-sandbox` agent on the Local target
 * - A control above the chat switches this agent's sandbox variant (eval /
 *   jupyter) live, through `/agents/{id}/sandbox/ensure`
 * - A sidebar follows the sandbox over `/configure/sandbox/ws`: its variant,
 *   whether it runs and executes, the raw messages, and an interrupt button
 *
 * @module examples/AgentCodeSandboxExample
 */

/// <reference types="vite/client" />

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Box } from '@datalayer/primer-addons';
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
  CodespacesIcon,
  StopIcon,
  TerminalIcon,
} from '@primer/octicons-react';
import { ThemedProvider } from './utils/themedProvider';
import { uniqueAgentId } from './utils/agentId';
import { resolveExampleAgentRuntimesUrl } from './utils/useExampleAgentRuntimesUrl';
import { LoopEmbed } from '../loop';
import { AgentCodeSandboxPlugin } from '../loop/plugins/agent-code-sandbox';
import type { SandboxWsStatus } from '../types/sandbox';
import { SANDBOX_STATUS_COLORS, SANDBOX_STATUS_LABELS } from '../types/sandbox';
import type { SandboxAggregateStatus } from '../types/sandbox';

// ─── Constants ─────────────────────────────────────────────────────────────

const AGENT_NAME = 'code-sandbox-example-agent';

type SandboxVariant = 'eval' | 'jupyter-server';

const VARIANTS: readonly SandboxVariant[] = ['eval', 'jupyter-server'];

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

const tsNow = () => new Date().toLocaleTimeString([], { hour12: false });

function formatSwitchTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString();
}

/** The one word the sidebar's dot and label say about the sandbox. */
function deriveAggregate(
  status: SandboxWsStatus | null,
): SandboxAggregateStatus {
  if (!status) return 'unavailable';
  if (status.error) return 'unavailable';
  if (!status.sandbox_running) return 'stopped';
  if (status.is_executing) return 'executing';
  return 'idle';
}

// ─── The example ───────────────────────────────────────────────────────────

const AgentCodeSandboxInner: React.FC = () => {
  const agentId = useMemo(() => uniqueAgentId(AGENT_NAME), []);
  const agentBaseUrl = useMemo(
    () => resolveExampleAgentRuntimesUrl('local'),
    [],
  );
  const chatPlugins = useMemo(() => [AgentCodeSandboxPlugin], []);

  // ── Sandbox variant switch ──
  const [pendingVariant, setPendingVariant] = useState<SandboxVariant | null>(
    null,
  );
  // The variant a switch chose, held until the socket reports it: the status
  // stream says the old variant until the new sandbox has actually been used.
  const [chosenVariant, setChosenVariant] = useState<SandboxVariant | null>(
    null,
  );
  const [switchError, setSwitchError] = useState<string | null>(null);
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
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const addLog = useCallback((direction: 'recv' | 'sent', raw: string) => {
    setWsLog(prev => {
      const next = [{ id: ++_logId, ts: tsNow(), direction, raw }, ...prev];
      // Keep newest 200 entries
      return next.slice(0, 200);
    });
  }, []);

  // ── Switch the variant of this agent's sandbox: the server stops the one it
  //    has and starts one of the asked variant in its place. ──
  const switchVariant = useCallback(
    async (newVariant: SandboxVariant) => {
      setPendingVariant(newVariant);
      setSwitchError(null);
      const path = `/agents/${agentId}/sandbox/ensure`;
      try {
        addLog('sent', `POST ${path} {variant:${newVariant}}`);
        const response = await fetch(`${agentBaseUrl}/api/v1${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ variant: newVariant }),
        });
        addLog('recv', `HTTP ${response.status} ${path}`);
        if (!response.ok) {
          const text = await response.text().catch(() => '');
          throw new Error(
            text || `Failed to switch the sandbox (${response.status})`,
          );
        }
        await response.json().catch(() => null);
        setLastSwitch({
          variant: newVariant,
          switchedAt: new Date().toISOString(),
        });
        setChosenVariant(newVariant);
      } catch (error) {
        setSwitchError(
          error instanceof Error ? error.message : 'Failed to switch variant',
        );
      } finally {
        setPendingVariant(null);
      }
    },
    [agentBaseUrl, agentId, addLog],
  );

  // ── WebSocket lifecycle: follows the sandbox from the start; the server
  //    admits the socket once the Loop has created the agent, and until then
  //    the reconnect loop simply tries again. ──
  useEffect(() => {
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
  }, [agentBaseUrl, agentId, addLog]);

  // ── Send interrupt via WS ──
  const sendInterrupt = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      const payload = JSON.stringify({ action: 'interrupt' });
      ws.send(payload);
      addLog('sent', payload);
    }
  }, [addLog]);

  useEffect(() => {
    if (chosenVariant && sandboxStatus?.variant === chosenVariant) {
      setChosenVariant(null);
    }
  }, [chosenVariant, sandboxStatus?.variant]);

  // ── Derived display ──
  const aggregate = useMemo(
    () => deriveAggregate(sandboxStatus),
    [sandboxStatus],
  );
  // The variant on the control is the sandbox's own, as the socket reports
  // it, except while a switch is under way.
  const liveVariant = sandboxStatus?.variant ?? null;
  const displayedVariant = pendingVariant ?? chosenVariant ?? liveVariant;
  const isTransitionLocked = pendingVariant !== null;
  const statusColor = SANDBOX_STATUS_COLORS[aggregate];
  const statusLabel = SANDBOX_STATUS_LABELS[aggregate];

  // ── Sidebar ──
  const sidebar = (
    <Box
      data-sandbox-sidebar
      data-sandbox-aggregate={aggregate}
      data-sandbox-variant={liveVariant ?? undefined}
      sx={{
        width: 360,
        minWidth: 300,
        borderLeft: '1px solid',
        borderColor: 'border.default',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        bg: 'canvas.default',
      }}
    >
      {/* ── Header ── */}
      <Box
        sx={{
          p: 2,
          bg: 'canvas.default',
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
          Active variant: {displayedVariant ?? '—'}
          {pendingVariant ? ' (switching...)' : ''}
        </Text>
        <Text sx={{ fontSize: 0, color: 'fg.muted', mt: 1, display: 'block' }}>
          Last switch:{' '}
          {lastSwitch
            ? `${lastSwitch.variant} at ${formatSwitchTime(lastSwitch.switchedAt)}`
            : 'n/a'}
        </Text>
      </Box>

      {switchError && (
        <Flash variant="danger" sx={{ mx: 2, mt: 2, fontSize: 0, p: 2 }}>
          {switchError}
        </Flash>
      )}

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
          disabled={aggregate !== 'executing' || isTransitionLocked}
          onClick={sendInterrupt}
          leadingVisual={StopIcon}
          block
          data-sandbox-interrupt
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
            disabled={isTransitionLocked}
            onClick={() => setWsLog([])}
            sx={{ fontSize: 0, px: 1 }}
          >
            Clear
          </Button>
        </Box>
        <Box
          data-sandbox-ws-log
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
                      ? 'neutral.muted'
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
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        bg: 'canvas.default',
      }}
    >
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
        <CodespacesIcon size={16} />
        <Heading as="h3" sx={{ fontSize: 2, flex: 1 }}>
          Code Sandbox Demo
        </Heading>
        <Label variant="accent">local</Label>
        <Label variant="accent">{VARIANTS.length} sandbox variants</Label>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ position: 'relative', height: '100%' }}>
            <Box
              sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}
            >
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
                <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                  Sandbox variant
                </Text>
                <SegmentedControl
                  aria-label="Sandbox variant"
                  size="small"
                  onChange={index => {
                    if (isTransitionLocked) return;
                    const next = VARIANTS[index];
                    if (next && next !== displayedVariant) {
                      void switchVariant(next);
                    }
                  }}
                >
                  <SegmentedControl.Button
                    selected={displayedVariant === 'eval'}
                    leadingIcon={TerminalIcon}
                    disabled={isTransitionLocked}
                    data-sandbox-variant-button="eval"
                  >
                    eval
                  </SegmentedControl.Button>
                  <SegmentedControl.Button
                    selected={displayedVariant === 'jupyter-server'}
                    leadingIcon={CodeIcon}
                    disabled={isTransitionLocked}
                    data-sandbox-variant-button="jupyter-server"
                  >
                    jupyter
                  </SegmentedControl.Button>
                </SegmentedControl>
                {pendingVariant && <Spinner size="small" />}
              </Box>
              {/* The Loop creates the agent on the Local target from the
                  capacity plugin's blueprint; the variants stay visible so
                  the agent is not pinned to the page. */}
              <Box sx={{ flex: 1, minHeight: 0 }}>
                <LoopEmbed
                  serverUrl={agentBaseUrl}
                  target="local"
                  showAgentVariants
                  agentId={agentId}
                  editors={false}
                  showHeader
                  plugins={chatPlugins}
                />
              </Box>
            </Box>

            {isTransitionLocked && (
              <Box
                sx={{
                  position: 'absolute',
                  inset: 0,
                  bg: 'canvas.default',
                  opacity: 0.35,
                  zIndex: 2,
                  cursor: 'wait',
                }}
              />
            )}
          </Box>
        </Box>

        {sidebar}
      </Box>
    </Box>
  );
};

const AgentCodeSandboxExample: React.FC = () => (
  <ThemedProvider>
    <AgentCodeSandboxInner />
  </ThemedProvider>
);

export default AgentCodeSandboxExample;
