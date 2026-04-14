/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Shared WebSocket connection pool for the OTEL service.
 *
 * Multiple chart components that subscribe to the same OTEL WS URL will
 * share a single underlying WebSocket connection via reference counting.
 */

type OtelWsMessage = {
  signal?: string;
  data?: Array<Record<string, unknown>>;
  count?: number;
};

type MessageListener = (msg: OtelWsMessage) => void;

interface PoolEntry {
  ws: WebSocket | null;
  listeners: Set<MessageListener>;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  disposed: boolean;
  url: string;
}

const pool = new Map<string, PoolEntry>();

function connectEntry(entry: PoolEntry) {
  if (entry.disposed || entry.listeners.size === 0) return;

  const ws = new WebSocket(entry.url);

  ws.onmessage = (event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data) as OtelWsMessage;
      for (const listener of entry.listeners) {
        listener(msg);
      }
    } catch {
      // Ignore unparseable messages.
    }
  };

  ws.onerror = () => {};

  ws.onclose = () => {
    entry.ws = null;
    if (entry.disposed || entry.listeners.size === 0) return;
    entry.reconnectTimer = setTimeout(() => connectEntry(entry), 2000);
  };

  entry.ws = ws;
}

/**
 * Subscribe to a shared OTEL WebSocket connection.
 *
 * Returns an unsubscribe function.  When the last subscriber unsubscribes,
 * the underlying WebSocket is closed and removed from the pool.
 */
export function subscribeOtelWs(
  wsUrl: string,
  listener: MessageListener,
): () => void {
  let entry = pool.get(wsUrl);

  if (!entry) {
    entry = {
      ws: null,
      listeners: new Set(),
      reconnectTimer: null,
      disposed: false,
      url: wsUrl,
    };
    pool.set(wsUrl, entry);
  }

  entry.listeners.add(listener);

  // If the WS isn't connected yet (first subscriber or after full teardown),
  // start the connection.
  if (!entry.ws && !entry.disposed) {
    connectEntry(entry);
  }

  return () => {
    if (!entry) return;
    entry.listeners.delete(listener);

    if (entry.listeners.size === 0) {
      entry.disposed = true;
      if (entry.reconnectTimer) {
        clearTimeout(entry.reconnectTimer);
        entry.reconnectTimer = null;
      }
      entry.ws?.close();
      entry.ws = null;
      pool.delete(wsUrl);
    }
  };
}
