/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Generic WebSocket hook for the AI Agents service.
 *
 * Connects to the single `/ws` endpoint and subscribes to channels.
 * When the server pushes a message on a subscribed channel the
 * corresponding React Query cache is automatically invalidated so
 * the UI refreshes with fresh data from the server.
 *
 * @module hooks/useAIAgentsWebSocket
 */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useCoreStore, useIAMStore } from '@datalayer/core/lib/state';
import {
  DEFAULT_SERVICE_URLS,
  API_BASE_PATHS,
} from '@datalayer/core/lib/api/constants';

// ─── Auth / URL helpers ──────────────────────────────────────────────

function useAuthToken(): string {
  const token = useIAMStore((s: { token?: string | null }) => s.token);
  return token ?? '';
}

function useBaseUrl(): string {
  const config = useCoreStore(
    (s: { configuration?: { aiagentsRunUrl?: string } }) => s.configuration,
  );
  return config?.aiagentsRunUrl ?? DEFAULT_SERVICE_URLS.AI_AGENTS;
}

// ─── Types ───────────────────────────────────────────────────────────

/** A message pushed by the server. */
interface WSMessage {
  channel: string;
  event: string;
  data: Record<string, unknown>;
}

/** Options for the WebSocket hook. */
export interface UseAIAgentsWebSocketOptions {
  /** Additional channels to subscribe to beyond the auto-subscribed user channel. */
  channels?: string[];
  /** Called for every incoming message (optional). */
  onMessage?: (msg: WSMessage) => void;
}

// ─── Hook ────────────────────────────────────────────────────────────

const RECONNECT_DELAY_MS = 3_000;

/**
 * Connect to the AI Agents generic WebSocket.
 *
 * The hook automatically:
 * - subscribes to the user's own channel (done server-side)
 * - subscribes to any extra channels passed via `options.channels`
 * - invalidates the matching React Query keys when events arrive
 * - reconnects on unexpected disconnects
 *
 * @example
 * ```tsx
 * useAIAgentsWebSocket({ channels: [`agent:${agentId}`] });
 * ```
 */
export function useAIAgentsWebSocket(options?: UseAIAgentsWebSocketOptions) {
  const token = useAuthToken();
  const baseUrl = useBaseUrl();
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep a ref of channels so we can re-subscribe on reconnect without
  // tearing down the socket when the array reference changes.
  const channelsRef = useRef<string[]>(options?.channels ?? []);
  channelsRef.current = options?.channels ?? [];
  const onMessageRef = useRef(options?.onMessage);
  onMessageRef.current = options?.onMessage;

  useEffect(() => {
    if (!token) return;

    let disposed = false;

    function connect() {
      if (disposed) return;

      // Build the WebSocket URL.  Replace http(s) with ws(s).
      const httpUrl = `${baseUrl}${API_BASE_PATHS.AI_AGENTS}/ws`;
      const wsUrl =
        httpUrl.replace(/^http/, 'ws') + `?token=${encodeURIComponent(token)}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        // Subscribe to extra channels.
        const channels = channelsRef.current;
        if (channels.length > 0) {
          ws.send(JSON.stringify({ subscribe: { channels } }));
        }
      };

      ws.onmessage = ev => {
        let msg: WSMessage;
        try {
          msg = JSON.parse(ev.data) as WSMessage;
        } catch {
          return;
        }

        // Fire optional callback.
        onMessageRef.current?.(msg);

        // Invalidate React Query caches based on the event type.
        const { event } = msg;

        if (event.startsWith('event_')) {
          queryClient.invalidateQueries({ queryKey: ['agent-events'] });
        }

        if (event.startsWith('tool_approval_')) {
          queryClient.invalidateQueries({ queryKey: ['tool-approvals'] });
        }

        if (event.startsWith('notification_')) {
          queryClient.invalidateQueries({ queryKey: ['agent-notifications'] });
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (!disposed) {
          reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      };

      ws.onerror = () => {
        // onclose will fire after onerror; reconnect happens there.
        ws.close();
      };
    }

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [token, baseUrl, queryClient]);

  // When the channel list changes, send subscribe/unsubscribe diffs.
  const prevChannelsRef = useRef<string[]>([]);
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const prev = new Set(prevChannelsRef.current);
    const next = new Set(channelsRef.current);

    const toSubscribe = channelsRef.current.filter(ch => !prev.has(ch));
    const toUnsubscribe = prevChannelsRef.current.filter(ch => !next.has(ch));

    if (toSubscribe.length > 0) {
      ws.send(JSON.stringify({ subscribe: { channels: toSubscribe } }));
    }
    if (toUnsubscribe.length > 0) {
      ws.send(JSON.stringify({ unsubscribe: { channels: toUnsubscribe } }));
    }

    prevChannelsRef.current = [...channelsRef.current];
  }, [options?.channels]);
}
