/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Ask for something once, and stop.
 *
 * Its own module because "attempt exactly once, and if it fails say why rather
 * than try again" is a policy, and it was the missing one. Five examples each
 * ended their creation attempt with `.catch(() => setCreateRequested(false))`
 * while the effect making the attempt listed `createRequested` among its
 * dependencies — so a failure re-armed the effect. With an unreachable sandbox
 * the examples app posted `/api/v1/agents` as fast as the server could return
 * 503, and the page looked like it was reloading without end.
 *
 * A `useState` guard cleared in a `.catch` is not a guard; it is a retry loop
 * with extra steps.
 *
 * @module examples/hooks/useCreateAgentOnce
 */

import { useEffect, useRef, useState } from 'react';

import type { AgentConfig } from '../../types/config';

export interface UseCreateAgentOnceOptions {
  /** Whether there is anything to attempt. */
  enabled: boolean;
  /**
   * Whether *this* agent already exists, which makes the attempt moot.
   *
   * A boolean rather than an id, because the caller is the only one who can
   * answer it. The runtime state is a shared singleton that the shell writes
   * to as well: on the cloud target it launches a runtime and registers an
   * agent of its own before an example mounts. Skipping on "some agent id is
   * set" therefore skipped creating the example's agent because somebody
   * else's was already there — and every message then came back "No agent
   * registered for this ID".
   */
  alreadyCreated?: boolean;
  createAgent: (config: AgentConfig) => Promise<AgentCreated>;
  config: AgentConfig;
}

/** What creating an agent gives back. */
export type AgentCreated = {
  agentId?: string;
  endpoint?: string;
  isReady?: boolean;
};

export interface UseCreateAgentOnceResult {
  /** Whether the single attempt has been made. */
  attempted: boolean;
  /**
   * The agent this hook created, once the call has returned.
   *
   * The trustworthy signal that the agent exists: it is the answer to our own
   * request, rather than a read of state anything else can overwrite.
   */
  created?: AgentCreated;
  /** Why it failed, when it did. Reported, never retried. */
  error?: string;
}

/** Create an agent at most once. */
export function useCreateAgentOnce(
  options: UseCreateAgentOnceOptions,
): UseCreateAgentOnceResult {
  const { enabled, alreadyCreated, createAgent, config } = options;

  const [attempted, setAttempted] = useState(false);
  const [created, setCreated] = useState<AgentCreated | undefined>();
  const [error, setError] = useState<string | undefined>();

  // A ref, not state: the effect must not depend on a value its own failure
  // path writes, or the failure re-arms it.
  const attemptedRef = useRef(false);
  // Read at attempt time rather than depended upon, so a caller that rebuilds
  // its config object on every render cannot provoke a second attempt.
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    if (attemptedRef.current || alreadyCreated || !enabled) {
      return;
    }
    attemptedRef.current = true;
    setAttempted(true);
    void createAgent(configRef.current)
      .then(setCreated)
      .catch((reason: unknown) => {
        // Recorded, never retried: `attemptedRef` is not cleared here, which
        // is the whole of the fix.
        setError(reason instanceof Error ? reason.message : String(reason));
      });
  }, [alreadyCreated, createAgent, enabled]);

  return { attempted, created, error };
}

export default useCreateAgentOnce;
