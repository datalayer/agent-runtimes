/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Custom React hooks used by ChatBase.
 *
 * @module components/chat/components/base/hooks
 */

import { useContext, useEffect } from 'react';
import { useQuery, QueryClientContext } from '@tanstack/react-query';
import { requestAPI } from '../../handler';
import { PRIMER_PORTAL_ROOT_ID, getApiBaseFromConfig } from './utils';
import type {
  RemoteConfig,
  SkillsResponse,
  ContextSnapshotData,
  SandboxStatusData,
} from './types';

// ---------------------------------------------------------------------------
// useHighZIndexPortal
// ---------------------------------------------------------------------------

/**
 * Hook to ensure Primer's default portal root has a high z-index.
 * This ensures dropdown menus appear above floating chat panels.
 */
export function useHighZIndexPortal() {
  useEffect(() => {
    // Set up a MutationObserver to watch for the portal root being added
    const setPortalZIndex = () => {
      const portalRoot = document.getElementById(PRIMER_PORTAL_ROOT_ID);
      if (portalRoot) {
        portalRoot.style.zIndex = '9999';
        return true;
      }
      return false;
    };

    // Try immediately
    if (setPortalZIndex()) {
      return;
    }

    // If not found yet, observe for it
    const observer = new MutationObserver(() => {
      if (setPortalZIndex()) {
        observer.disconnect();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
    };
  }, []);
}

// ---------------------------------------------------------------------------
// useConfigQuery
// ---------------------------------------------------------------------------

/**
 * Hook to safely use query when QueryClient is available.
 * Returns null if no QueryClientProvider is present.
 */
export function useConfigQuery(
  enabled: boolean,
  configEndpoint?: string,
  authToken?: string,
) {
  const queryClient = useContext(QueryClientContext);

  // If no QueryClient is available, return a mock result
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
      // If configEndpoint is provided, use direct fetch (for FastAPI)
      if (configEndpoint) {
        const headers: HeadersInit = {
          'Content-Type': 'application/json',
        };
        if (authToken) {
          headers['Authorization'] = `Bearer ${authToken}`;
        }
        const response = await fetch(configEndpoint, { headers });
        if (!response.ok) {
          throw new Error(`Config fetch failed: ${response.statusText}`);
        }
        return response.json() as Promise<RemoteConfig>;
      }
      // Otherwise use Jupyter requestAPI
      return requestAPI<RemoteConfig>('configure');
    },
    queryKey: ['models', configEndpoint || 'jupyter'],
    enabled,
    retry: 1,
  });
}

// ---------------------------------------------------------------------------
// useSkillsQuery
// ---------------------------------------------------------------------------

/**
 * Hook to fetch available skills from backend
 */
export function useSkillsQuery(
  enabled: boolean,
  baseEndpoint?: string,
  authToken?: string,
) {
  const queryClient = useContext(QueryClientContext);

  // If no QueryClient is available, return a mock result
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
      // Derive skills endpoint from config endpoint
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
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });
}

// ---------------------------------------------------------------------------
// useContextSnapshotQuery
// ---------------------------------------------------------------------------

/**
 * Hook to poll agent context-snapshot from the backend.
 * Returns cumulative token usage (input/output breakdown) tracked by the agent server.
 * Uses the same endpoint as codeai: GET /api/v1/configure/agents/{agentId}/context-snapshot
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
  const result = useQuery<ContextSnapshotData>({
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
    // Poll every 10 seconds, but stop polling once the query has errored (e.g. runtime terminated)
    refetchInterval: query => (query.state.status === 'error' ? false : 10_000),
    refetchOnMount: 'always',
    staleTime: 0,
    retry: 1,
  });

  return result;
}

// ---------------------------------------------------------------------------
// useSandboxStatusQuery
// ---------------------------------------------------------------------------

/**
 * Hook to poll sandbox execution status from the backend.
 * Returns whether a sandbox is available and if code is currently executing.
 */
export function useSandboxStatusQuery(
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
  const result = useQuery<SandboxStatusData>({
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

  return result;
}
