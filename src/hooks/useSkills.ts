/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useContext } from 'react';
import { useQuery, QueryClientContext } from '@tanstack/react-query';
import { useAgentRuntimesClient } from '../client/AgentRuntimesClientContext';

/**
 * Hook to fetch available skills via `IAgentRuntimesClient`.
 *
 * @param enabled - Whether the query should run.
 * @param baseUrl - Runtime base URL (ingress).
 * @param authToken - Optional auth token.
 *
 * @returns React Query result with SkillsResponse.
 */
export function useSkills(
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
      refetch: () => Promise.resolve({ data: undefined }),
    };
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useQuery({
    queryFn: async () => {
      if (!baseUrl) {
        return { skills: [], total: 0 };
      }
      return client.getSkills(baseUrl, authToken);
    },
    queryKey: ['skills', baseUrl || 'none'],
    enabled: enabled && !!baseUrl,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
