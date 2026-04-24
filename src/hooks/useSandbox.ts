/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiBaseFromConfig } from '../utils';
import type { SandboxStatusData } from '../types/context';

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

    const connect = () => {
      if (disposed) return;
      const ws = new WebSocket(url);
      wsRef.current = ws;

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

      ws.onclose = () => {
        wsRef.current = null;
        if (!disposed) {
          reconnectTimer = setTimeout(connect, 3000);
        }
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
