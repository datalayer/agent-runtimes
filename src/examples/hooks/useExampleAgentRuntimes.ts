/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import {
  useAgentRuntimes,
  type UseAgentOptions,
  type UseAgentReturn,
} from '../../hooks/useAgentRuntimes';
import { useMemo } from 'react';
import {
  runtimeTargetCapabilities,
  useRuntimeTargetStore,
} from '../utils/runtimeTargetStore';
import { useExampleAgentRuntimesUrl } from '../utils/useExampleAgentRuntimesUrl';

/**
 * High-level examples hook that applies the shared Local/Cloud runtime target
 * defaults while preserving explicit overrides from individual examples.
 */
export function useExampleAgentRuntimes(
  options: UseAgentOptions,
): UseAgentReturn {
  const runtimeTarget = useRuntimeTargetStore(state => state.target);
  const capabilities = runtimeTargetCapabilities(runtimeTarget);
  const localRuntimeBaseUrl = useExampleAgentRuntimesUrl();

  const runtimeCreationTarget =
    options.runtimeCreationTarget ??
    (runtimeTarget === 'datalayer'
      ? 'backend-services'
      : 'local-agent-runtimes');

  const runtimeCreationBaseUrl =
    options.runtimeCreationBaseUrl ??
    (runtimeCreationTarget === 'local-agent-runtimes'
      ? localRuntimeBaseUrl
      : undefined);

  // Two of the four targets are a sandbox and nothing else. Launching an agent
  // there would call a service that is not running, so the hook simply does
  // not — and `useExampleAgentRuntime` reports why, for the chat to show.
  const autoStart = capabilities.hasAgent
    ? (options.autoStart ?? runtimeCreationTarget === 'backend-services')
    : false;

  const fallbackRuntimeName = useMemo(() => {
    const configuredName = options.agentConfig?.name?.trim();
    return (
      configuredName || options.agentSpecId?.trim() || 'example-agent-runtime'
    );
  }, [options.agentConfig?.name, options.agentSpecId]);

  const runtimeConnection = useMemo(
    () =>
      runtimeCreationTarget === 'local-agent-runtimes'
        ? {
            runtimeName: fallbackRuntimeName,
            environmentName: 'local-agent-runtimes',
            jupyterBaseUrl: runtimeCreationBaseUrl,
          }
        : undefined,
    [fallbackRuntimeName, runtimeCreationBaseUrl, runtimeCreationTarget],
  );

  const agentConfig = useMemo(
    () =>
      runtimeCreationTarget === 'local-agent-runtimes' && options.agentSpecId
        ? {
            ...options.agentConfig,
            agentSpecId:
              options.agentConfig?.agentSpecId ?? options.agentSpecId,
          }
        : options.agentConfig,
    [options.agentConfig, options.agentSpecId, runtimeCreationTarget],
  );

  return useAgentRuntimes({
    ...options,
    agentConfig,
    runtimeCreationTarget,
    runtimeCreationBaseUrl,
    autoStart,
    autoCreateAgent: capabilities.hasAgent
      ? options.autoCreateAgent
      : false,
    runtimeConnection: options.runtimeConnection ?? runtimeConnection,
  });
}

export default useExampleAgentRuntimes;
