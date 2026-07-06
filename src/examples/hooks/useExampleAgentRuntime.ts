/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useEffect, useMemo } from 'react';
import { useAgentRuntimes } from '../../hooks/useAgentRuntimes';
import type { AgentConfig } from '../../types/config';
import { useExampleAgentRuntimesUrl } from '../utils/useExampleAgentRuntimesUrl';
import { useRuntimeTargetStore } from '../utils/runtimeTargetStore';
import { agentSummaryStore } from '../utils/agentSummaryStore';

interface UseExampleAgentRuntimeOptions {
  exampleId: string;
  agentName: string;
  specId?: string;
  environmentName?: string;
  autoStart?: boolean;
  autoCreateAgent?: boolean;
  agentConfig?: AgentConfig;
}

interface UseExampleAgentRuntimeResult {
  location: 'local' | 'cloud';
  baseUrl: string;
  agentId?: string;
  agentBaseUrl?: string;
  status: string;
  isReady: boolean;
  error: string | null;
  createAgent: (config?: AgentConfig) => Promise<{
    agentId?: string;
    endpoint?: string;
    isReady?: boolean;
  }>;
  /**
   * Tear down the agent launched by this hook: delete it on the server and
   * wipe in-process agent state so a fresh runtime can be launched.
   */
  teardown: () => Promise<void>;
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
    environmentName = 'local-agent-runtimes',
    autoStart = true,
    autoCreateAgent = true,
    agentConfig,
  } = options;

  const location = useRuntimeTargetStore(state => state.target);
  const baseUrl = useExampleAgentRuntimesUrl();
  const isCloud = location === 'cloud';

  const combinedConfig = useMemo<AgentConfig>(
    () => ({
      name: agentName,
      agentSpecId: specId,
      ...agentConfig,
    }),
    [agentName, specId, agentConfig],
  );

  const {
    runtime,
    status,
    isReady,
    error,
    connectToRuntime,
    createAgent,
    teardown,
  } = useAgentRuntimes({
    agentSpecId: isCloud ? specId : undefined,
    autoCreateAgent,
    autoStart: isCloud ? autoStart : false,
    runtimeCreationTarget: isCloud
      ? 'backend-services'
      : 'local-agent-runtimes',
    runtimeCreationBaseUrl: isCloud ? undefined : baseUrl,
    agentConfig: combinedConfig,
  });

  useEffect(() => {
    if (isCloud) {
      return;
    }
    connectToRuntime({
      podName: agentName,
      environmentName,
      jupyterBaseUrl: baseUrl,
    });
  }, [isCloud, connectToRuntime, agentName, environmentName, baseUrl]);

  useEffect(() => {
    agentSummaryStore.getState().setActive({
      exampleId,
      agentName,
      agentId: runtime?.agentId,
      specId,
      location,
      baseUrl: runtime?.agentBaseUrl || baseUrl,
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
    status,
    isReady,
    error,
  ]);

  return {
    location,
    baseUrl,
    agentId: runtime?.agentId,
    agentBaseUrl: runtime?.agentBaseUrl,
    status,
    isReady,
    error,
    createAgent,
    teardown,
  };
}
