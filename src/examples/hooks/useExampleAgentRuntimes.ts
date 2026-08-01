/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import {
  useAgentRuntimes,
  type UseAgentOptions,
  type UseAgentReturn,
} from '../../hooks/useAgentRuntimes';
import { useEffect, useMemo, useRef } from 'react';
import { useRuntimeTargetStore } from '../utils/runtimeTargetStore';
import { useExampleAgentRuntimesUrl } from '../utils/useExampleAgentRuntimesUrl';

/**
 * High-level examples hook that applies the shared Local/Cloud runtime target
 * defaults while preserving explicit overrides from individual examples.
 */
export function useExampleAgentRuntimes(
  options: UseAgentOptions,
): UseAgentReturn {
  const runtimeTarget = useRuntimeTargetStore(state => state.target);
  const localRuntimeBaseUrl = useExampleAgentRuntimesUrl();

  const runtimeCreationTarget =
    options.runtimeCreationTarget ??
    (runtimeTarget === 'cloud'
      ? 'backend-services'
      : 'local-agent-runtimes');

  const runtimeCreationBaseUrl =
    options.runtimeCreationBaseUrl ??
    (runtimeCreationTarget === 'local-agent-runtimes'
      ? localRuntimeBaseUrl
      : undefined);

  const autoStart =
    options.autoStart ?? runtimeCreationTarget === 'backend-services';

  const result = useAgentRuntimes({
    ...options,
    runtimeCreationTarget,
    runtimeCreationBaseUrl,
    autoStart,
  });

  const bootstrapAttemptKeyRef = useRef<string | null>(null);
  const fallbackPodName = useMemo(() => {
    const configuredName =
      typeof options.agentConfig?.name === 'string'
        ? options.agentConfig.name.trim()
        : '';
    if (configuredName) {
      return configuredName;
    }
    const configuredSpecId =
      typeof options.agentSpecId === 'string' ? options.agentSpecId.trim() : '';
    if (configuredSpecId) {
      return configuredSpecId;
    }
    return 'example-agent-runtime';
  }, [options.agentConfig?.name, options.agentSpecId]);

  useEffect(() => {
    if (result.runtime || result.isLaunching) {
      return;
    }

    const bootstrapKey = `${runtimeTarget}:${runtimeCreationTarget}:${fallbackPodName}`;
    if (bootstrapAttemptKeyRef.current === bootstrapKey) {
      return;
    }

    if (runtimeCreationTarget === 'local-agent-runtimes') {
      bootstrapAttemptKeyRef.current = bootstrapKey;
      result.connectToRuntime({
        podName: fallbackPodName,
        environmentName: 'local-agent-runtimes',
        jupyterBaseUrl: runtimeCreationBaseUrl,
      });
      return;
    }

    if (
      runtimeCreationTarget === 'backend-services' &&
      !autoStart &&
      options.agentSpecId
    ) {
      bootstrapAttemptKeyRef.current = bootstrapKey;
      void result.launchRuntime().catch(() => {
        bootstrapAttemptKeyRef.current = null;
      });
    }
  }, [
    runtimeTarget,
    runtimeCreationTarget,
    runtimeCreationBaseUrl,
    fallbackPodName,
    autoStart,
    options.agentSpecId,
    result.runtime,
    result.isLaunching,
    result.connectToRuntime,
    result.launchRuntime,
  ]);

  return result;
}

export default useExampleAgentRuntimes;
