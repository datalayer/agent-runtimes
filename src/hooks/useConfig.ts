/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useContext } from 'react';
import { useQuery, QueryClientContext } from '@tanstack/react-query';
import { useAgentRuntimesClient } from '../client/AgentRuntimesClientContext';

/**
 * Hook to fetch chat configuration (models, tools, MCP servers)
 * via `IAgentRuntimesClient`.
 *
 * @param enabled - Whether the query should run.
 * @param baseUrl - Runtime base URL (ingress).
 * @param authToken - Optional auth token.
 *
 * @returns React Query result with RemoteConfig data.
 */
export function useConfig(
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
    };
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useQuery({
    queryFn: async () => {
      if (!baseUrl) {
        throw new Error('No baseUrl provided for config');
      }
      return client.getChatConfig(baseUrl, authToken);
    },
    queryKey: ['models', baseUrl || 'none'],
    enabled: enabled && !!baseUrl,
    retry: 1,
  });
}
