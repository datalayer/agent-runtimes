/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useContext } from 'react';
import {
  QueryClient,
  QueryClientContext,
  useQuery,
} from '@tanstack/react-query';
import { useEffect } from 'react';
import type { LoadedSkillInfo, SkillsResponse } from '../types/skills';
import { useAgentRuntimeLoadedSkills, useAgentRuntimeStore } from '../stores';

const FALLBACK_QUERY_CLIENT = new QueryClient();

function resolveSkillsEndpoint(baseEndpoint: string): string {
  if (baseEndpoint.includes('/api/v1/skills')) {
    return baseEndpoint;
  }
  if (baseEndpoint.includes('/api/v1/configure')) {
    return baseEndpoint.replace('/api/v1/configure', '/api/v1/skills');
  }
  if (baseEndpoint.includes('/api/v1/config')) {
    return baseEndpoint.replace('/api/v1/config', '/api/v1/skills');
  }
  return baseEndpoint.replace(/\/$/, '') + '/api/v1/skills';
}

/**
 * Hook to fetch available skills from backend.
 */
export function useSkills(
  enabled: boolean,
  baseEndpoint?: string,
  authToken?: string,
) {
  const queryClient = useContext(QueryClientContext);

  const query = useQuery(
    {
      queryFn: async () => {
        if (!baseEndpoint) {
          return { skills: [], total: 0 };
        }

        const skillsEndpoint = resolveSkillsEndpoint(baseEndpoint);
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
      enabled: Boolean(queryClient) && enabled,
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
    queryClient ?? FALLBACK_QUERY_CLIENT,
  );

  if (!queryClient) {
    return {
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: () => Promise.resolve({ data: undefined }),
    };
  }

  return query;
}

/**
 * Hook to fetch and persist loaded skills for a given agent.
 *
 * Seeds the store from the `/api/v1/skills` REST endpoint on mount.
 * Subsequent updates are expected via the `onToolCallComplete` hook
 * on the Chat component, which reacts to `load_skill` tool results
 * and calls `setLoadedSkillsForAgent` directly.
 */
export function useAgentLoadedSkills(
  enabled: boolean,
  agentBaseUrl?: string,
  agentId?: string,
  authToken?: string,
) {
  const queryClient = useContext(QueryClientContext);
  const persistedSkills = useAgentRuntimeLoadedSkills(agentId);
  const setLoadedSkillsForAgent = useAgentRuntimeStore(
    state => state.setLoadedSkillsForAgent,
  );

  const query = useQuery(
    {
      queryFn: async () => {
        if (!agentBaseUrl || !agentId) {
          return [] as LoadedSkillInfo[];
        }
        const headers: HeadersInit = {
          'Content-Type': 'application/json',
        };
        if (authToken) {
          headers['Authorization'] = `Bearer ${authToken}`;
        }

        // Seed from the skills list endpoint (always available).
        const response = await fetch(`${agentBaseUrl}/api/v1/skills`, {
          headers,
        });
        if (!response.ok) {
          throw new Error(`Skills fetch failed: ${response.statusText}`);
        }

        const data = (await response.json()) as SkillsResponse;
        // Map SkillInfo[] → LoadedSkillInfo[] for the store.
        return (data.skills ?? []).map<LoadedSkillInfo>(s => ({
          id: s.id ?? s.name,
          name: s.name,
          description: s.description ?? `Skill: ${s.name}`,
          variant: s.has_scripts ? 'path' : 'unknown',
          tags: s.tags,
        }));
      },
      queryKey: ['agent-loaded-skills', agentBaseUrl || '', agentId || ''],
      enabled:
        Boolean(queryClient) &&
        enabled &&
        Boolean(agentBaseUrl) &&
        Boolean(agentId),
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
    queryClient ?? FALLBACK_QUERY_CLIENT,
  );

  useEffect(() => {
    if (!queryClient || !agentId || !query.data) {
      return;
    }
    setLoadedSkillsForAgent(agentId, query.data);
  }, [queryClient, agentId, query.data, setLoadedSkillsForAgent]);

  if (!queryClient) {
    return {
      skills: persistedSkills,
      data: persistedSkills,
      isLoading: false,
      isError: false,
      error: null,
      refetch: () => Promise.resolve({ data: persistedSkills }),
    };
  }

  return {
    ...query,
    skills: query.data ?? persistedSkills,
    data: query.data ?? persistedSkills,
  };
}
