/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useEffect, useMemo } from 'react';
import type { UseAgentReturn } from '../../hooks/useAgentRuntimes';
import type { AgentConfig } from '../../types/config';
import { useRuntimeTargetStore } from '../utils/runtimeTargetStore';
import { agentSummaryStore } from '../utils/agentSummaryStore';
import { useExampleAgentRuntimes } from './useExampleAgentRuntimes';

export interface UseExampleAgentRuntimeOptions {
  exampleId: string;
  agentName: string;
  specId?: string;
  autoStart?: boolean;
  autoCreateAgent?: boolean;
  agentConfig?: AgentConfig;
}

export interface UseExampleAgentRuntimeResult extends UseAgentReturn {
  location: 'local' | 'cloud';
  baseUrl: string;
  agentId?: string;
  agentBaseUrl?: string;
}

/**
 * Connects examples to agent runtimes through shared hooks and supports
 * both local and cloud execution modes.
 */
export function useExampleAgentRuntime(
  options: UseExampleAgentRuntimeOptions,
): UseExampleAgentRuntimeResult {
  const {
    exampleId,
    agentName,
    specId,
    autoStart = true,
    autoCreateAgent = true,
    agentConfig,
  } = options;

  const location = useRuntimeTargetStore(state => state.target);
  const isCloud = location === 'cloud';

  const combinedConfig = useMemo<AgentConfig>(
    () => ({
      name: agentName,
      agentSpecId: specId,
      ...agentConfig,
    }),
    [agentName, specId, agentConfig],
  );

  const result = useExampleAgentRuntimes({
    agentSpecId: specId,
    autoCreateAgent,
    autoStart,
    agentConfig: combinedConfig,
  });
  const { runtime, status, isReady, error } = result;
  const baseUrl = isCloud
    ? runtime?.agentBaseUrl || result.runtimeCreationBaseUrl
    : result.runtimeCreationBaseUrl;

  useEffect(() => {
    // Agent status and code sandbox status are both reported by the
    // agent-runtimes API server. For local runs that server is `baseUrl`
    // (e.g. http://localhost:8765); the Jupyter sandbox lives elsewhere
    // (`runtime.agentBaseUrl`). For cloud runs the per-agent runtime URL
    // (`runtime.agentBaseUrl`) hosts the API, so prefer it when present.
    const agentApiBaseUrl = isCloud
      ? runtime?.agentBaseUrl || baseUrl
      : baseUrl;
    agentSummaryStore.getState().setActive({
      exampleId,
      agentName,
      agentId: runtime?.agentId,
      specId,
      location,
      baseUrl: agentApiBaseUrl,
      sandboxBaseUrl: runtime?.agentBaseUrl,
      status,
      isReady,
      error: error || undefined,
    });

    return () => {
      agentSummaryStore.getState().clearActive(exampleId);
    };
  }, [
    exampleId,
    agentName,
    runtime?.agentId,
    runtime?.agentBaseUrl,
    specId,
    location,
    baseUrl,
    isCloud,
    status,
    isReady,
    error,
  ]);

  return {
    ...result,
    location,
    baseUrl,
    agentId: runtime?.agentId,
    agentBaseUrl: runtime?.agentBaseUrl,
    status,
    isReady,
    error,
  };
}
