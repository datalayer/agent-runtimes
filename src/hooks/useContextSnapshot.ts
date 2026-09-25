/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What the agent's context window is holding.
 *
 * The REST endpoint this used to poll was removed, and the snapshot moved to
 * the WebSocket stream — but the hook was left returning `undefined` with a
 * note that a replacement would be wired in later. It never was, so the
 * token-usage bar and its context ring stayed hidden for *every* agent, on
 * every target, however the host configured them. The data had been arriving
 * the whole time; nothing was reading it.
 *
 * It arrives on `agent.snapshot` and the runtime store already keeps it. This
 * reads that.
 *
 * The arguments are the ones the REST version took. They are unused and kept
 * so the call sites that pass an endpoint and a token still compile — what
 * they described (where to ask, and as whom) is settled by the socket now.
 *
 * @module hooks/useContextSnapshot
 */

import type { ContextSnapshotData } from '../types/context';
import { useAgentRuntimeContextSnapshot } from '../stores';

export function useContextSnapshot(
  _enabled: boolean,
  _configEndpoint?: string,
  _agentId?: string,
  _authToken?: string,
): {
  data: ContextSnapshotData | undefined;
  isLoading: boolean;
  isError: boolean;
  error: null;
} {
  const snapshot = useAgentRuntimeContextSnapshot();
  /*
   * Never "loading". There is no request to be in flight — the socket either
   * has reported a snapshot or has not — and a caller that showed a spinner
   * for this would show it for as long as the agent stayed quiet.
   */
  return {
    data: snapshot ?? undefined,
    isLoading: false,
    isError: false,
    error: null,
  };
}

export default useContextSnapshot;
