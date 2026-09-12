/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';

import type { ExampleRuntimeTarget } from './runtimeTargetStore';

/** Where the summarised runtime lives — the same four the control offers. */
export type AgentSummaryLocation = ExampleRuntimeTarget;

export interface AgentSummary {
  exampleId: string;
  agentName: string;
  agentId?: string;
  specId?: string;
  /** The framework turning the loop, as the spec declares it. */
  harness?: string;
  /** The runtime variant the example runs on: `<location>-<harness>`. */
  variant?: string;
  location: AgentSummaryLocation;
  /**
   * Base URL of the agent-runtimes API server. Hosts both the agent status
   * endpoint (`/api/v1/runtime/status`) and the code sandbox status endpoint
   * (`/api/v1/agents/sandbox/status`).
   */
  baseUrl: string;
  /**
   * Base URL of the code sandbox (Jupyter for local runs). Shown for context;
   * the sandbox status itself is reported by the agent-runtimes server.
   */
  sandboxBaseUrl?: string;
  runtimeEnvironment?: {
    environmentName?: string;
    environmentTitle?: string;
    cpu?: string;
    memory?: string;
    gpu?: string;
  };
  status?: string;
  isReady?: boolean;
  error?: string;
}

interface AgentSummaryState {
  active: AgentSummary | null;
  setActive: (summary: AgentSummary) => void;
  clearActive: (exampleId?: string) => void;
}

export const agentSummaryStore = createStore<AgentSummaryState>(set => ({
  active: null,
  setActive: (summary: AgentSummary) => set({ active: summary }),
  clearActive: (exampleId?: string) =>
    set(state => {
      if (!state.active) {
        return state;
      }
      if (!exampleId || state.active.exampleId === exampleId) {
        return { active: null };
      }
      return state;
    }),
}));

export function useAgentSummaryStore(): AgentSummaryState;
export function useAgentSummaryStore<T>(
  selector: (state: AgentSummaryState) => T,
): T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useAgentSummaryStore(selector?: any) {
  return useStore(agentSummaryStore, selector);
}
