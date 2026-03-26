/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useContext } from 'react';
import { useQuery, QueryClientContext } from '@tanstack/react-query';
import { getApiBaseFromConfig } from '../utils';
import type { SandboxStatusData } from '../types/context';

/**
 * Hook to poll sandbox execution status from the backend.
 * Returns whether a sandbox is available and if code is currently executing.
 */
export function useSandbox(
  enabled: boolean,
  configEndpoint?: string,
  authToken?: string,
) {
  const queryClient = useContext(QueryClientContext);

  if (!queryClient) {
    return {
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: () => Promise.resolve({} as any),
    };
  }

  const statusUrl = configEndpoint
    ? `${getApiBaseFromConfig(configEndpoint)}/configure/sandbox-status`
    : undefined;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useQuery<SandboxStatusData>({
    queryKey: ['sandbox-status', statusUrl],
    queryFn: async () => {
      if (!statusUrl) {
        throw new Error('No sandbox status URL available');
      }
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      const response = await fetch(statusUrl, { headers });
      if (!response.ok) {
        throw new Error(`Sandbox status fetch failed: ${response.statusText}`);
      }
      return response.json();
    },
    enabled: enabled && !!statusUrl,
    refetchInterval: query => (query.state.status === 'error' ? false : 2_000),
    refetchOnMount: 'always',
    staleTime: 0,
    retry: 1,
  });
}
