/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useMemo } from 'react';
import {
  type ExampleRuntimeTarget,
  useRuntimeTargetStore,
} from './runtimeTargetStore';
import { useAgentSummaryStore } from './agentSummaryStore';

const normalizeBaseUrl = (value?: string): string | undefined => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.replace(/\/$/, '');
};

const LOCAL_DEFAULT = 'http://localhost:8765';
const CLOUD_DEFAULT = 'https://r1.datalayer.run';

export function resolveExampleAgentRuntimesUrl(
  target: ExampleRuntimeTarget,
  override?: string,
): string {
  if (override) {
    return normalizeBaseUrl(override) ?? override;
  }

  const localUrl =
    normalizeBaseUrl(import.meta.env.VITE_DATALAYER_AGENT_RUNTIMES_URL) ??
    LOCAL_DEFAULT;
  const cloudUrl =
    normalizeBaseUrl(import.meta.env.VITE_DATALAYER_AGENT_RUNTIMES_URL) ??
    normalizeBaseUrl(import.meta.env.VITE_DATALAYER_RUNTIMES_URL) ??
    CLOUD_DEFAULT;

  return target === 'cloud' ? cloudUrl : localUrl;
}

/**
 * Resolve the base URL used by examples to call the agent-runtimes service.
 * Priority: explicit override -> dedicated env -> legacy base env -> localhost.
 */
export function useExampleAgentRuntimesUrl(override?: string): string {
  const target = useRuntimeTargetStore(state => state.target);
  const activeRuntimeBaseUrl = useAgentSummaryStore(state =>
    state.active?.location === target ? state.active.baseUrl : undefined,
  );

  return useMemo(() => {
    if (target === 'cloud' && activeRuntimeBaseUrl) {
      return normalizeBaseUrl(activeRuntimeBaseUrl) ?? activeRuntimeBaseUrl;
    }
    return resolveExampleAgentRuntimesUrl(target, override);
  }, [activeRuntimeBaseUrl, target, override]);
}
