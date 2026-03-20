/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useContext } from 'react';
import { useQuery, QueryClientContext } from '@tanstack/react-query';
import type { SkillsResponse } from '../types/chat';

/**
 * Hook to fetch available skills from backend.
 */
export function useSkillsQuery(
  enabled: boolean,
  baseEndpoint?: string,
  authToken?: string,
) {
  const queryClient = useContext(QueryClientContext);

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
      if (!baseEndpoint) {
        return { skills: [], total: 0 };
      }

      // Derive skills endpoint from config endpoint.
      const skillsEndpoint = baseEndpoint.replace('/configure', '/skills');
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const response = await fetch(skillsEndpoint, { headers });
      if (!response.ok) {
        throw new Error(`Skills fetch failed: ${response.statusText}`);
      }
      return response.json() as Promise<SkillsResponse>;
    },
    queryKey: ['skills', baseEndpoint || 'jupyter'],
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
