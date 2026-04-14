/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import type { ContextSnapshotData } from '../types/context';

/**
 * Hook that previously polled agent context-snapshot from the backend.
 *
 * The REST endpoint has been removed — context snapshot data is now
 * delivered via the WebSocket stream (`agent.snapshot` messages).
 * This hook is kept as a no-op so existing call-sites compile without
 * changes; the token-usage bar simply stays hidden until a WS-based
 * replacement is wired in.
 */
export function useContextSnapshot(
  _enabled: boolean,
  _configEndpoint?: string,
  _agentId?: string,
  _authToken?: string,
): {
  data: ContextSnapshotData | undefined;
  isLoading: boolean;
  isError: boolean;
  error: null;
} {
  return { data: undefined, isLoading: false, isError: false, error: null };
}
