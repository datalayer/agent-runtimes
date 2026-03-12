/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Re-export shim — the actual store now lives in `state/substates/AIAgentState`.
 *
 * This file is kept so that existing `import … from './agentStore'` and
 * `import … from '@datalayer/agent-runtimes/lib/agents/agentStore'` paths
 * continue to work without changes.
 *
 * @module agents/agentStore
 */

export {
  useAgentRuntimeStore,
  useAgentRuntime,
  useAgentFromStore,
  useAgentStatus,
  useAgentError,
  useIsLaunching,
  getAgentState,
  subscribeToAgent,
} from '../state/substates/AIAgentState';

export type {
  AgentStore,
  AgentStoreState,
  AgentStoreActions,
} from '../state/substates/AIAgentState';
