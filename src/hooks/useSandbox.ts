/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useContext } from 'react';
import { useQuery, QueryClientContext } from '@tanstack/react-query';
import { useAgentRuntimesClient } from '../client/AgentRuntimesClientContext';
import type { SandboxStatusData } from '../types/context';

/**
 * Hook to poll sandbox execution status via `IAgentRuntimesClient`.
 *
 * @param enabled - Whether the query should run.
 * @param baseUrl - Runtime base URL (ingress).
 * @param authToken - Optional auth token.
 *
 * @returns React Query result with SandboxStatusData.
 */
export function useSandbox(
  enabled: boolean,
  baseUrl?: string,
  authToken?: string,
) {
  const queryClient = useContext(QueryClientContext);
  const client = useAgentRuntimesClient();

  if (!queryClient) {
    return {
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: () => Promise.resolve({} as any),
    };
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useQuery<SandboxStatusData>({
    queryKey: ['sandbox-status', baseUrl],
    queryFn: async () => {
      if (!baseUrl) {
        throw new Error('No baseUrl provided for sandbox status');
      }
      return client.getSandboxStatus(baseUrl, authToken);
    },
    enabled: enabled && !!baseUrl,
    refetchInterval: query => (query.state.status === 'error' ? false : 2_000),
    refetchOnMount: 'always',
    staleTime: 0,
    retry: 1,
  });
}
