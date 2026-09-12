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
import { isLocalUrl } from './localUrl';

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

  const configured = normalizeBaseUrl(
    import.meta.env.VITE_DATALAYER_AGENT_RUNTIMES_URL,
  );

  /*
   * The Local target's server runs on this machine, and only a URL that
   * names this machine can be it.
   *
   * `VITE_DATALAYER_AGENT_RUNTIMES_URL` serves both targets, and the
   * `examples:vite` script sets it to the cloud host by default — so taking
   * it here unconditionally, which is what this used to do, answered "where
   * is the local agent-runtimes server?" with `https://r1.datalayer.run`.
   * The summary then read `Location: local` beside `Agent base URL:
   * https://r1.datalayer.run`, every agent call was cross-origin, and the
   * chat failed with a bare "Failed to fetch".
   *
   * `main.tsx` already learned this for the Jupyter server URL — see
   * `isLocalUrl`, whose comment describes the same bug — and the predicate is
   * shared so the two cannot drift apart again. An override that really is
   * local (a different port, say) is still honoured.
   */
  const localUrl =
    configured && isLocalUrl(configured) ? configured : LOCAL_DEFAULT;
  const cloudUrl =
    (configured && !isLocalUrl(configured) ? configured : undefined) ??
    normalizeBaseUrl(import.meta.env.VITE_DATALAYER_RUNTIMES_URL) ??
    CLOUD_DEFAULT;

  // Only the Datalayer target reaches the hosted service; the rest are local
  // or have no agent at all, and asking the cloud for one would be wrong.
  return target === 'datalayer' ? cloudUrl : localUrl;
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
    if (target === 'datalayer' && activeRuntimeBaseUrl) {
      return normalizeBaseUrl(activeRuntimeBaseUrl) ?? activeRuntimeBaseUrl;
    }
    return resolveExampleAgentRuntimesUrl(target, override);
  }, [activeRuntimeBaseUrl, target, override]);
}
