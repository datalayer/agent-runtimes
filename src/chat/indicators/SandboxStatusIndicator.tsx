/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * SandboxStatusIndicator — Round coloured dot that shows the
 * real-time sandbox execution status via a WebSocket connection.
 *
 * Aggregate logic (mapped to jupyter-react KernelIndicator states)
 * ───────────────
 * - variant === "unavailable" → connected-unknown
 * - sandbox_running === false → disconnected
 * - is_executing === false    → connected-idle
 * - is_executing === true     → connected-busy (themed fade animation)
 *
 * The component connects to the `/configure/sandbox/ws` WebSocket
 * and receives status updates in real time.  It can also send
 * an interrupt request via `{"action": "interrupt"}`.
 *
 * @module chat/indicators/SandboxStatusIndicator
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box } from '@datalayer/primer-addons';
import type {
  SandboxAggregateStatus,
  SandboxWsStatus,
} from '../../types/sandbox';
import { SANDBOX_STATUS_LABELS } from '../../types/sandbox';

const SANDBOX_INDICATOR_COLORS: Record<SandboxAggregateStatus, string> = {
  unavailable: 'fg.muted',
  stopped: 'fg.muted',
  idle: 'success.fg',
  executing: 'attention.fg',
};

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

function renderSandboxGlyph(aggregate: SandboxAggregateStatus) {
  return (
    <Box
      as="span"
      sx={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: '50%',
        bg: SANDBOX_INDICATOR_COLORS[aggregate],
        ...(aggregate === 'executing' && {
          animation: 'sandbox-busy-fade 1.2s ease-in-out infinite',
          '@keyframes sandbox-busy-fade': {
            '0%': {
              opacity: 1,
              transform: 'scale(1)',
              filter: 'saturate(1)',
            },
            '50%': {
              opacity: 0.45,
              transform: 'scale(0.92)',
              filter: 'saturate(0.75)',
            },
            '100%': {
              opacity: 1,
              transform: 'scale(1)',
              filter: 'saturate(1)',
            },
          },
        }),
      }}
    />
  );
}

/* ── Component ─────────────────────────────────────────── */

export function SandboxStatusIndicator({
  apiBase,
  authToken,
  agentId,
  statusOverride,
}: SandboxStatusIndicatorProps) {
  const [status, setStatus] = useState<SandboxWsStatus | null>(null);
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);
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
    <Box
      as="span"
      sx={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onMouseEnter={() => setIsOverlayOpen(true)}
      onMouseLeave={() => setIsOverlayOpen(false)}
    >
      <button
        type="button"
        aria-label={tooltipText}
        onClick={aggregate === 'executing' ? sendInterrupt : undefined}
        onFocus={() => setIsOverlayOpen(true)}
        onBlur={() => setIsOverlayOpen(false)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          padding: 0,
          border: 'none',
          background: 'none',
          outline: 'none',
          boxShadow: 'none',
          borderRadius: 0,
          WebkitAppearance: 'none',
          appearance: 'none',
          cursor: aggregate === 'executing' ? 'pointer' : 'default',
          lineHeight: 0,
        }}
      >
        <Box
          as="span"
          sx={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}
        >
          {renderSandboxGlyph(aggregate)}
        </Box>
      </button>

      {isOverlayOpen && (
        <Box
          role="tooltip"
          sx={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 6px)',
            minWidth: 220,
            px: 2,
            py: 2,
            borderRadius: 2,
            bg: 'canvas.overlay',
            color: 'fg.default',
            fontSize: 0,
            lineHeight: 1.5,
            boxShadow: 'shadow.medium',
            border: '1px solid',
            borderColor: 'border.default',
            zIndex: 1000,
            fontFamily: 'mono',
            pointerEvents: 'none',
          }}
        >
          <Box sx={{ mb: 1, fontWeight: 600, fontFamily: 'normal' }}>
            {tooltipText}
          </Box>
          {effectiveStatus ? (
            <>
              <Box>
                <Box as="span" sx={{ fontWeight: 600 }}>
                  variant:{' '}
                </Box>
                <Box as="span">{effectiveStatus.variant}</Box>
              </Box>
              <Box>
                <Box as="span" sx={{ fontWeight: 600 }}>
                  sandbox_running:{' '}
                </Box>
                <Box as="span">{String(effectiveStatus.sandbox_running)}</Box>
              </Box>
              <Box>
                <Box as="span" sx={{ fontWeight: 600 }}>
                  is_executing:{' '}
                </Box>
                <Box as="span">{String(effectiveStatus.is_executing)}</Box>
              </Box>
              {effectiveStatus.jupyter_url && (
                <Box sx={{ wordBreak: 'break-all' }}>
                  <Box as="span" sx={{ fontWeight: 600 }}>
                    jupyter_url:{' '}
                  </Box>
                  <Box as="span">{effectiveStatus.jupyter_url}</Box>
                </Box>
              )}
              {effectiveStatus.error && (
                <Box sx={{ mt: 1, color: 'danger.fg' }}>
                  {effectiveStatus.error}
                </Box>
              )}
              {aggregate === 'executing' && (
                <Box sx={{ mt: 1, fontFamily: 'normal', color: 'fg.muted' }}>
                  Click to interrupt execution
                </Box>
              )}
            </>
          ) : (
            <Box sx={{ fontFamily: 'normal', color: 'fg.muted' }}>
              No sandbox configured for this agent.
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

export default SandboxStatusIndicator;
