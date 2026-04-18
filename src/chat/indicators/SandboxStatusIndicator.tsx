/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * SandboxStatusIndicator — Round coloured dot that shows the
 * real-time sandbox execution status via a WebSocket connection.
 *
 * Aggregate logic
 * ───────────────
 * - variant === "unavailable" → hidden
 * - sandbox_running === false → "stopped"  (gray)
 * - is_executing === false    → "idle"     (green)
 * - is_executing === true     → "executing" (blue, pulsing)
 *
 * The component connects to the `/configure/sandbox/ws` WebSocket
 * and receives status updates in real time.  It can also send
 * an interrupt request via `{"action": "interrupt"}`.
 *
 * @module chat/indicators/SandboxStatusIndicator
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Tooltip } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import type {
  SandboxAggregateStatus,
  SandboxWsStatus,
} from '../../types/sandbox';
import {
  SANDBOX_STATUS_COLORS,
  SANDBOX_STATUS_LABELS,
} from '../../types/sandbox';

/* ── Props ─────────────────────────────────────────────── */

export interface SandboxStatusIndicatorProps {
  /** API base URL (e.g. "http://127.0.0.1:8765"). */
  apiBase?: string;
  /** Optional auth token for authenticated requests (e.g. K8s ingress). */
  authToken?: string;
  /** Agent ID to scope sandbox status to a specific agent. */
  agentId?: string;
  /** Optional status override to update indicator immediately from parent UI. */
  statusOverride?: SandboxWsStatus | null;
}

/* ── Helpers ───────────────────────────────────────────── */

function getWsUrl(
  apiBase?: string,
  authToken?: string,
  agentId?: string,
): string {
  if (typeof window === 'undefined') return '';
  const base = apiBase
    ? apiBase
    : window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1'
      ? 'http://127.0.0.1:8765'
      : '';
  // Convert http(s) to ws(s).
  const wsBase = base.replace(/^http/, 'ws');
  let wsUrl = `${wsBase}/api/v1/configure/sandbox/ws`;
  // Include agent_id so the backend returns agent-scoped status.
  const params: string[] = [];
  if (agentId) {
    params.push(`agent_id=${encodeURIComponent(agentId)}`);
  }
  // WebSocket API doesn't support custom headers, pass token as query param.
  if (authToken) {
    params.push(`token=${encodeURIComponent(authToken)}`);
  }
  if (params.length > 0) {
    wsUrl += `?${params.join('&')}`;
  }
  return wsUrl;
}

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

const SANDBOX_PULSE_KEYFRAMES = `
@keyframes sandbox-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
`;

function useInjectKeyframes() {
  useEffect(() => {
    const id = '__sandbox-pulse-keyframes__';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = SANDBOX_PULSE_KEYFRAMES;
    document.head.appendChild(style);
  }, []);
}

/* ── Component ─────────────────────────────────────────── */

export function SandboxStatusIndicator({
  apiBase,
  authToken,
  agentId,
  statusOverride,
}: SandboxStatusIndicatorProps) {
  useInjectKeyframes();
  const [status, setStatus] = useState<SandboxWsStatus | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const wsUrl = useMemo(
    () => getWsUrl(apiBase, authToken, agentId),
    [apiBase, authToken, agentId],
  );

  // ---- WebSocket lifecycle ----
  useEffect(() => {
    if (!wsUrl) return;

    let disposed = false;

    function connect() {
      if (disposed) return;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        wsRef.current = ws;
      };

      ws.onmessage = event => {
        try {
          const msg = JSON.parse(event.data);
          // Ignore interrupt ack messages.
          if (msg.action === 'interrupt') return;
          setStatus(msg as SandboxWsStatus);
        } catch {
          // Ignore malformed messages.
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (!disposed) {
          // Reconnect after a short delay.
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
    };
  }, [wsUrl]);

  // ---- Interrupt helper (exposed for stop-button integration) ----
  const sendInterrupt = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: 'interrupt' }));
    }
  }, []);

  // ---- Derived display values ----
  const effectiveStatus = statusOverride ?? status;
  const aggregate = useMemo(
    () => deriveAggregate(effectiveStatus),
    [effectiveStatus],
  );

  const tooltipText = useMemo(() => {
    if (!effectiveStatus) return 'No Sandbox defined';
    const label = SANDBOX_STATUS_LABELS[aggregate];
    const variant = effectiveStatus.variant;
    return `${label} (${variant})`;
  }, [aggregate, effectiveStatus]);

  // Show a subtle gray dot when sandbox is unavailable.
  // The tooltip tells the user none is configured.

  return (
    <Tooltip text={tooltipText} direction="n">
      <button
        type="button"
        aria-label={tooltipText}
        onClick={aggregate === 'executing' ? sendInterrupt : undefined}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          padding: 0,
          border: 'none',
          background: 'none',
          cursor: aggregate === 'executing' ? 'pointer' : 'default',
          lineHeight: 0,
        }}
      >
        <Box
          as="span"
          sx={{
            display: 'inline-block',
            width: 12,
            height: 12,
            borderRadius: '50%',
            bg: SANDBOX_STATUS_COLORS[aggregate],
            flexShrink: 0,
            ...(aggregate === 'executing' && {
              animation: 'sandbox-pulse 1.5s ease-in-out infinite',
            }),
          }}
        />
      </button>
    </Tooltip>
  );
}

export default SandboxStatusIndicator;
