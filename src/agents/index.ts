/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Agent management module for agent-runtimes.
 *
 * Provides a Zustand store and hooks for launching and managing cloud runtimes
 * with integrated AI agent support.
 *
 * @module agents
 *
 * @example
 * ```typescript
 * import { useAgentRuntimeStore, useAgent } from '@datalayer/agent-runtimes/lib/agents';
 *
 * // Launch a new runtime
 * const { launchAgent, createAgent } = useAgentRuntimeStore();
 * const runtime = await launchAgent({ environmentName: 'python-simple', creditsLimit: 100 });
 * const agent = await createAgent({ model: 'anthropic:claude-sonnet-4-5' });
 *
 * // Use in ChatFloating
 * <ChatFloating endpoint={agent.endpoint} />
 *
 * // Or connect to an existing runtime
 * const { connectAgent } = useAgentRuntimeStore();
 * connectAgent({
 *   podName: 'my-pod',
 *   environmentName: 'python-simple',
 *   serviceManager: myServiceManager,
 * });
 * ```
 */

// Zustand store for runtime connection management
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

// Hooks
export { useAgent } from './useAgent';
export type {
  UseAgentReturn,
  UseAgentOptions,
  CheckpointRecord,
} from './useAgent';

// Types - re-exported from @datalayer/core
export type {
  IRuntimeLocation,
  IRuntimeType,
  IRuntimeCapabilities,
  IRuntimePod,
  IRuntimeOptions,
  IRuntimeDesc,
} from './types';

// Types - agent-runtimes specific (unified AgentStatus superset)
export type {
  RuntimeConnection,
  AgentRuntimeStatus,
  AgentStatus,
  AgentConfig,
  AgentConnection,
  AgentRuntimeState,
} from './types';

// Constants
export { DEFAULT_AGENT_CONFIG } from './types';
