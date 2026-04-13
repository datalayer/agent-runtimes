/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useContext } from 'react';
import { useQuery, QueryClientContext } from '@tanstack/react-query';
import { requestAPI } from '../api/handler';
import type { RemoteConfig } from '../types/config';

/**
 * Hook to safely use query when QueryClient is available.
 * Returns a mock result if no QueryClientProvider is present.
 */
export function useConfig(
  enabled: boolean,
  configEndpoint?: string,
  authToken?: string,
  agentId?: string,
) {
  const queryClient = useContext(QueryClientContext);

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
      // If configEndpoint is provided, use direct fetch (for FastAPI).
      if (configEndpoint) {
        const headers: HeadersInit = {
          'Content-Type': 'application/json',
        };
        if (authToken) {
          headers['Authorization'] = `Bearer ${authToken}`;
        }
        let endpoint = configEndpoint;
        if (agentId) {
          const url = new URL(configEndpoint, window.location.origin);
          url.searchParams.set('agent_id', agentId);
          endpoint = url.toString();
        }
        const response = await fetch(endpoint, { headers });
        if (!response.ok) {
          throw new Error(`Config fetch failed: ${response.statusText}`);
        }
        return response.json() as Promise<RemoteConfig>;
      }
      // Otherwise use Jupyter requestAPI.
      return requestAPI<RemoteConfig>('configure');
    },
    queryKey: ['models', configEndpoint || 'jupyter', agentId || 'global'],
    enabled,
    retry: 1,
  });
}
