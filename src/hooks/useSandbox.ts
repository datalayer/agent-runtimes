/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiBaseFromConfig } from '../utils';
import type { SandboxStatusData } from '../types/context';

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

function isRetryableCloseCode(code: number): boolean {
  // Avoid reconnect loops for policy/auth/protocol closures.
  const nonRetryable = new Set([1002, 1003, 1007, 1008, 4401, 4403]);
  return !nonRetryable.has(code);
}

/**
 * Subscribe to the sandbox execution status via the
 * `/api/v1/configure/sandbox/ws` WebSocket.
 *
 * This hook replaces the previous REST-polling implementation — the server
 * now pushes status updates in real time and accepts interrupt requests over
 * the same connection.
 *
 * @param enabled         Whether to open the WebSocket connection.
 * @param configEndpoint  Base `configEndpoint` used by other chat hooks
 *                        (e.g. `http://localhost:8765/api/v1/configure/config`).
 * @param authToken       Optional bearer token (passed as `?token=` query param
 *                        because browsers cannot set headers on WebSocket).
 * @param agentId         Optional agent id; the backend returns an
 *                        agent-scoped status when provided.
 * @returns `{ data, interrupt }` where `data` is the latest status (or
 *          `undefined` until the first message) and `interrupt()` sends an
 *          `{ action: 'interrupt' }` message over the same WebSocket.
 */
export function useSandbox(
  enabled: boolean,
  configEndpoint?: string,
  authToken?: string,
  agentId?: string,
) {
  const [data, setData] = useState<SandboxStatusData | undefined>(undefined);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled || !configEndpoint) {
      setData(undefined);
      return;
    }

    const apiBase = getApiBaseFromConfig(configEndpoint);
    if (!apiBase) return;
    const wsBase = apiBase.replace(/^http/, 'ws');
    const params: string[] = [];
    if (agentId) {
      params.push(`agent_id=${encodeURIComponent(agentId)}`);
    }
    if (authToken) {
      // WebSocket API cannot set custom headers — pass token via query param.
      params.push(`token=${encodeURIComponent(authToken)}`);
    }
    const url = `${wsBase}/configure/sandbox/ws${
      params.length ? `?${params.join('&')}` : ''
    }`;

    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectAttempts = 0;

    const scheduleReconnect = (code: number) => {
      if (disposed || !isRetryableCloseCode(code)) return;
      const delay = Math.min(
        RECONNECT_BASE_MS * 2 ** reconnectAttempts,
        RECONNECT_MAX_MS,
      );
      reconnectAttempts += 1;
      reconnectTimer = setTimeout(connect, delay);
    };

    const connect = () => {
      if (disposed) return;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttempts = 0;
      };

      ws.onmessage = event => {
        try {
          const msg = JSON.parse(event.data);
          if (msg && msg.action === 'interrupt') return;
          const variant = typeof msg?.variant === 'string' ? msg.variant : '';
          setData({
            available: variant !== 'unavailable' && variant !== 'error',
            sandbox_running: Boolean(msg?.sandbox_running),
            is_executing: Boolean(msg?.is_executing),
            variant,
          });
        } catch {
          // Ignore malformed messages.
        }
      };

      ws.onclose = event => {
        wsRef.current = null;
        scheduleReconnect(event.code);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
      setData(undefined);
    };
  }, [enabled, configEndpoint, authToken, agentId]);

  const interrupt = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: 'interrupt' }));
    }
  }, []);

  return { data, interrupt };
}
