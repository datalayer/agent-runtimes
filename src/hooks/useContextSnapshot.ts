/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useContext } from 'react';
import { useQuery, QueryClientContext } from '@tanstack/react-query';
import { useAgentRuntimesClient } from '../client/AgentRuntimesClientContext';
import type { ContextSnapshotData } from '../types/context';

/**
 * Hook to poll agent context-snapshot via `IAgentRuntimesClient`.
 *
 * @param enabled - Whether the query should run.
 * @param baseUrl - Runtime base URL (ingress).
 * @param agentId - Agent identifier.
 * @param authToken - Optional auth token.
 *
 * @returns React Query result with ContextSnapshotData.
 */
export function useContextSnapshot(
  enabled: boolean,
  baseUrl?: string,
  agentId?: string,
  authToken?: string,
) {
  const queryClient = useContext(QueryClientContext);
  const client = useAgentRuntimesClient();

  if (!queryClient) {
    return { data: undefined, isLoading: false, isError: false, error: null };
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useQuery<ContextSnapshotData>({
    queryKey: ['context-snapshot-header', agentId, baseUrl],
    queryFn: async () => {
      if (!baseUrl || !agentId) {
        throw new Error('No baseUrl or agentId for context snapshot');
      }
      return client.getContextSnapshot(baseUrl, agentId, authToken);
    },
    enabled: enabled && !!baseUrl && !!agentId,
    refetchInterval: query => (query.state.status === 'error' ? false : 10_000),
    refetchOnMount: 'always',
    staleTime: 0,
    retry: 1,
  });
}
