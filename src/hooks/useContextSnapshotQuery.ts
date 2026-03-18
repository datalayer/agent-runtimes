/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useContext } from 'react';
import { useQuery, QueryClientContext } from '@tanstack/react-query';
import { getApiBaseFromConfig } from '../chat/utils';
import type { ContextSnapshotData } from '../chat/types';

/**
 * Hook to poll agent context-snapshot from the backend.
 * Returns cumulative token usage (input/output breakdown) tracked by the agent server.
 */
export function useContextSnapshotQuery(
  enabled: boolean,
  configEndpoint?: string,
  agentId?: string,
  authToken?: string,
) {
  const queryClient = useContext(QueryClientContext);

  if (!queryClient) {
    return { data: undefined, isLoading: false, isError: false, error: null };
  }

  const snapshotUrl =
    configEndpoint && agentId
      ? `${getApiBaseFromConfig(configEndpoint)}/configure/agents/${encodeURIComponent(agentId)}/context-snapshot`
      : undefined;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useQuery<ContextSnapshotData>({
    queryKey: ['context-snapshot-header', agentId, snapshotUrl],
    queryFn: async () => {
      if (!snapshotUrl) {
        throw new Error('No context-snapshot URL available');
      }
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      const response = await fetch(snapshotUrl, { headers });
      if (!response.ok) {
        throw new Error(
          `Context snapshot fetch failed: ${response.statusText}`,
        );
      }
      return response.json();
    },
    enabled: enabled && !!snapshotUrl,
    // Poll every 10s, but stop after an error (e.g. runtime terminated).
    refetchInterval: query => (query.state.status === 'error' ? false : 10_000),
    refetchOnMount: 'always',
    staleTime: 0,
    retry: 1,
  });
}
