/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useMemo } from 'react';

/**
 * Resolve the base URL used by examples to call the agent-runtimes service.
 * Priority: explicit override -> dedicated env -> legacy base env -> localhost.
 */
export function useExampleAgentRuntimesUrl(override?: string): string {
  return useMemo(() => {
    if (override) {
      return override;
    }
    return (
      import.meta.env.VITE_DATALAYER_AGENT_RUNTIMES_URL ||
      import.meta.env.VITE_BASE_URL ||
      'http://localhost:8765'
    );
  }, [override]);
}
