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

import { useEffect, useRef, useState } from 'react';
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
  channel?: string;
  event?: string;
  data?: Record<string, unknown>;
  type?: string;
  payload?: unknown;
  raw: unknown;
}

export interface AIAgentsWebSocketCloseInfo {
  code: number;
  reason: string;
  wasClean: boolean;
  detail: string;
}

export type AIAgentsWebSocketConnectionState =
  | 'connecting'
  | 'connected'
  | 'closed';

/** Options for the WebSocket hook. */
export interface UseAIAgentsWebSocketOptions {
  /** Enable/disable the socket lifecycle. */
  enabled?: boolean;
  /** Override the service base URL (defaults to aiagentsRunUrl). */
  baseUrl?: string;
  /** WebSocket path (or full http/https URL) for the stream endpoint. */
  path?: string;
  /** Query string parameters to append to the WebSocket URL. */
  queryParams?: Record<string, string | number | boolean | null | undefined>;
  /** Auto-reconnect on unexpected disconnects. */
  autoReconnect?: boolean;
  /** Max reconnect attempts before giving up (unbounded by default). */
  maxReconnectAttempts?: number;
  /** Reconnect delay strategy (ms) or static delay in ms. */
  reconnectDelayMs?: number | ((attempt: number) => number);
  /** Additional channels to subscribe to beyond the auto-subscribed user channel. */
  channels?: string[];
  /** Called when the socket opens. */
  onOpen?: () => void;
  /** Called for every incoming message (optional). */
  onMessage?: (msg: WSMessage) => void;
  /** Called when the socket closes. */
  onClose?: (info: AIAgentsWebSocketCloseInfo) => void;
}

export interface UseAIAgentsWebSocketResult {
  connectionState: AIAgentsWebSocketConnectionState;
  lastClose: AIAgentsWebSocketCloseInfo | null;
  reconnectAttempt: number;
}

// ─── Hook ────────────────────────────────────────────────────────────

const RECONNECT_DELAY_MS = 3_000;
const WS_DEFAULT_PATH = `${API_BASE_PATHS.AI_AGENTS}/ws`;

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object';

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
export function useAIAgentsWebSocket(
  options?: UseAIAgentsWebSocketOptions,
): UseAIAgentsWebSocketResult {
  const token = useAuthToken();
  const baseUrl = useBaseUrl();
  const configuredBaseUrl = options?.baseUrl ?? baseUrl;
  const enabled = options?.enabled ?? true;
  const wsPath = options?.path ?? WS_DEFAULT_PATH;
  const queryParamsKey = JSON.stringify(options?.queryParams ?? {});
  const queryClient = useQueryClient();
  const [connectionState, setConnectionState] =
    useState<AIAgentsWebSocketConnectionState>('closed');
  const [lastClose, setLastClose] = useState<AIAgentsWebSocketCloseInfo | null>(
    null,
  );
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep a ref of channels so we can re-subscribe on reconnect without
  // tearing down the socket when the array reference changes.
  const channelsRef = useRef<string[]>(options?.channels ?? []);
  channelsRef.current = options?.channels ?? [];
  const autoReconnectRef = useRef(options?.autoReconnect ?? true);
  autoReconnectRef.current = options?.autoReconnect ?? true;
  const maxReconnectAttemptsRef = useRef<number | undefined>(
    options?.maxReconnectAttempts,
  );
  maxReconnectAttemptsRef.current = options?.maxReconnectAttempts;
  const reconnectDelayRef = useRef<
    UseAIAgentsWebSocketOptions['reconnectDelayMs']
  >(options?.reconnectDelayMs);
  reconnectDelayRef.current = options?.reconnectDelayMs;
  const onOpenRef = useRef(options?.onOpen);
  onOpenRef.current = options?.onOpen;
  const onMessageRef = useRef(options?.onMessage);
  onMessageRef.current = options?.onMessage;
  const onCloseRef = useRef(options?.onClose);
  onCloseRef.current = options?.onClose;

  useEffect(() => {
    if (!enabled || !token) {
      setConnectionState('closed');
      return;
    }

    let disposed = false;
    let reconnectAttempts = 0;

    const toWsUrl = () => {
      const httpUrl =
        wsPath.startsWith('http://') || wsPath.startsWith('https://')
          ? wsPath
          : `${configuredBaseUrl}${wsPath.startsWith('/') ? '' : '/'}${wsPath}`;
      const url = new URL(httpUrl.replace(/^http/, 'ws'));
      url.searchParams.set('token', token);

      const queryParams = JSON.parse(queryParamsKey) as Record<
        string,
        string | number | boolean | null | undefined
      >;
      Object.entries(queryParams).forEach(([key, value]) => {
        if (value === null || value === undefined) {
          return;
        }
        url.searchParams.set(key, String(value));
      });

      return url.toString();
    };

    function connect() {
      if (disposed) return;

      const wsUrl = toWsUrl();
      setConnectionState('connecting');

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttempts = 0;
        setReconnectAttempt(0);
        setConnectionState('connected');
        setLastClose(null);
        console.debug('[ws:connect] url=%s', wsUrl);
        onOpenRef.current?.();

        // Subscribe to extra channels.
        const channels = channelsRef.current;
        if (channels.length > 0) {
          ws.send(JSON.stringify({ subscribe: { channels } }));
        }
      };

      ws.onmessage = ev => {
        let raw: unknown;
        try {
          raw = JSON.parse(String(ev.data));
        } catch {
          return;
        }

        const msg: WSMessage = isObject(raw)
          ? {
              channel:
                typeof raw.channel === 'string' ? raw.channel : undefined,
              event: typeof raw.event === 'string' ? raw.event : undefined,
              data: isObject(raw.data)
                ? (raw.data as Record<string, unknown>)
                : undefined,
              type: typeof raw.type === 'string' ? raw.type : undefined,
              payload: raw.payload,
              raw,
            }
          : { raw };

        // Fire optional callback.
        console.debug('[ws:recv] type=%s', msg.type ?? msg.event ?? 'unknown');
        onMessageRef.current?.(msg);

        // Invalidate React Query caches based on the event type.
        const { event } = msg;

        if (typeof event !== 'string') {
          return;
        }

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

      ws.onclose = event => {
        wsRef.current = null;
        setConnectionState('closed');

        const closeInfo: AIAgentsWebSocketCloseInfo = {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
          detail: `code ${event.code}${event.reason ? `: ${event.reason}` : ''}${event.wasClean ? ' (clean)' : ' (unclean)'}`,
        };
        setLastClose(closeInfo);
        console.debug(
          '[ws:disconnect] code=%d reason=%s',
          event.code,
          event.reason || '(none)',
        );
        onCloseRef.current?.(closeInfo);

        if (disposed || !autoReconnectRef.current) {
          return;
        }

        reconnectAttempts += 1;
        setReconnectAttempt(reconnectAttempts);

        const maxAttempts = maxReconnectAttemptsRef.current;
        if (
          typeof maxAttempts === 'number' &&
          Number.isFinite(maxAttempts) &&
          reconnectAttempts > maxAttempts
        ) {
          return;
        }

        const configuredDelay = reconnectDelayRef.current;
        const delay =
          typeof configuredDelay === 'function'
            ? configuredDelay(reconnectAttempts)
            : typeof configuredDelay === 'number'
              ? configuredDelay
              : RECONNECT_DELAY_MS;
        reconnectTimer.current = setTimeout(connect, Math.max(0, delay));
      };

      ws.onerror = () => {
        // onclose will fire after onerror; reconnect happens there.
        if (
          ws.readyState === WebSocket.CONNECTING ||
          ws.readyState === WebSocket.OPEN
        ) {
          ws.close();
        }
      };
    }

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
      setConnectionState('closed');
    };
  }, [token, configuredBaseUrl, wsPath, queryParamsKey, enabled, queryClient]);

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

  return {
    connectionState,
    lastClose,
    reconnectAttempt,
  };
}
