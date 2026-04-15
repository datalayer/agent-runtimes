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
import type {
  LoadedSkillInfo,
  SkillSpec,
  SkillsResponse,
} from '../types/skills';
import { getSkillSpec } from '../specs/skills';
import { useAgentRuntimeLoadedSkills, useAgentRuntimeStore } from '../stores';

const FALLBACK_QUERY_CLIENT = new QueryClient();

type AgentSpecSkillLike =
  | string
  | {
      id?: string;
      name?: string;
      description?: string;
      module?: string;
      package?: string;
      method?: string;
      path?: string;
      tags?: string[];
      emoji?: string;
      license?: string;
      compatibility?: string;
      allowedTools?: string[];
      skillMetadata?: Record<string, string>;
    };

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

function resolveSkillId(skill: AgentSpecSkillLike): string | null {
  if (typeof skill === 'string') {
    return skill;
  }
  if (skill.id) {
    return skill.id;
  }
  if (skill.name) {
    return skill.name;
  }
  return null;
}

function variantFromSpec(
  catalogSpec: SkillSpec | undefined,
  raw: Exclude<AgentSpecSkillLike, string> | null,
): LoadedSkillInfo['variant'] {
  if (catalogSpec?.path || raw?.path) return 'path';
  if (
    (catalogSpec?.package && catalogSpec?.method) ||
    (raw?.package && raw?.method)
  ) {
    return 'package';
  }
  if (catalogSpec?.module || raw?.module) return 'module';
  return 'unknown';
}

function normalizeLoadedSkills(
  skills: AgentSpecSkillLike[],
): LoadedSkillInfo[] {
  return skills.reduce<LoadedSkillInfo[]>((acc, skill) => {
    const raw = typeof skill === 'string' ? null : skill;
    const resolvedId = resolveSkillId(skill);
    if (!resolvedId) {
      return acc;
    }

    const baseId = resolvedId.includes(':')
      ? resolvedId.split(':')[0]
      : resolvedId;
    const catalogSpec = getSkillSpec(baseId);
    const variant = variantFromSpec(catalogSpec, raw);

    const normalized: LoadedSkillInfo = {
      id: baseId,
      name: catalogSpec?.name ?? raw?.name ?? baseId,
      description:
        catalogSpec?.description ?? raw?.description ?? `Skill: ${baseId}`,
      variant,
      module: catalogSpec?.module ?? raw?.module,
      package: catalogSpec?.package ?? raw?.package,
      method: catalogSpec?.method ?? raw?.method,
      path: catalogSpec?.path ?? raw?.path,
      license: catalogSpec?.license ?? raw?.license,
      compatibility: catalogSpec?.compatibility ?? raw?.compatibility,
      allowedTools: catalogSpec?.allowedTools ?? raw?.allowedTools,
      skillMetadata: catalogSpec?.skillMetadata ?? raw?.skillMetadata,
      tags: catalogSpec?.tags
        ? [...catalogSpec.tags]
        : raw?.tags
          ? [...raw.tags]
          : [],
      emoji: catalogSpec?.emoji ?? raw?.emoji,
    };

    acc.push(normalized);
    return acc;
  }, []);
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

        const response = await fetch(
          `${agentBaseUrl}/api/v1/agents/${agentId}/spec`,
          { headers },
        );
        if (!response.ok) {
          throw new Error(`Agent spec fetch failed: ${response.statusText}`);
        }

        const spec = (await response.json()) as {
          skills?: AgentSpecSkillLike[];
        };
        return normalizeLoadedSkills(spec.skills ?? []);
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
