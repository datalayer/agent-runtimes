/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import {
  useAgentRuntimes,
  type UseAgentOptions,
  type UseAgentReturn,
} from '../../hooks/useAgentRuntimes';
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

  return useAgentRuntimes({
    ...options,
    runtimeCreationTarget,
    runtimeCreationBaseUrl,
    autoStart,
  });
}

export default useExampleAgentRuntimes;
