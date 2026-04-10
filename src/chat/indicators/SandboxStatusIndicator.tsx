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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Tooltip } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { useAgentRuntimesClient } from '../../client/AgentRuntimesClientContext';
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
}

/* ── Helpers ───────────────────────────────────────────── */

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
}: SandboxStatusIndicatorProps) {
  useInjectKeyframes();
  const client = useAgentRuntimesClient();
  const [status, setStatus] = useState<SandboxWsStatus | null>(null);

  // ---- Polling via client ----
  useEffect(() => {
    if (!apiBase) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      if (disposed) return;
      try {
        const data = await client.getSandboxStatus(apiBase!, authToken);
        if (!disposed) {
          setStatus(data as unknown as SandboxWsStatus);
        }
      } catch {
        // Polling is best-effort.
      }
      if (!disposed) {
        timer = setTimeout(poll, 3000);
      }
    }
    poll();

    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [client, apiBase, authToken]);

  // ---- Interrupt helper (exposed for stop-button integration) ----
  const sendInterrupt = useCallback(() => {
    if (apiBase) {
      client.interruptSandbox(apiBase, agentId, authToken).catch(() => {});
    }
  }, [client, apiBase, agentId, authToken]);

  // ---- Derived display values ----
  const aggregate = useMemo(() => deriveAggregate(status), [status]);

  const tooltipText = useMemo(() => {
    if (!status) return SANDBOX_STATUS_LABELS.unavailable;
    const label = SANDBOX_STATUS_LABELS[aggregate];
    const variant = status.variant;
    return `${label} (${variant})`;
  }, [aggregate, status]);

  // Hide when sandbox is not available at all.
  if (aggregate === 'unavailable') return null;

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
