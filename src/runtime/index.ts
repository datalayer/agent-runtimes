/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Runtime management module for agent-runtimes.
 *
 * Provides a Zustand store and hooks for launching and managing cloud runtimes
 * with integrated AI agent support.
 *
 * @module runtime
 *
 * @example
 * ```typescript
 * import { useRuntimeStore, useRuntime, useAgent } from '@datalayer/agent-runtimes/lib/runtime';
 *
 * // Launch a new runtime
 * const { launchRuntime, createAgent } = useRuntimeStore();
 * const runtime = await launchRuntime({ environmentName: 'python-simple', creditsLimit: 100 });
 * const agent = await createAgent({ model: 'anthropic:claude-sonnet-4-5' });
 *
 * // Use in ChatFloating
 * <ChatFloating endpoint={agent.endpoint} />
 *
 * // Or connect to an existing runtime
 * const { connectToRuntime } = useRuntimeStore();
 * connectToRuntime({
 *   podName: 'my-pod',
 *   environmentName: 'python-simple',
 *   serviceManager: myServiceManager,
 * });
 * ```
 */

// Zustand store
export {
  useRuntimeStore,
  useRuntime,
  useAgent,
  useRuntimeStatus,
  useRuntimeError,
  useIsLaunching,
  getRuntimeState,
  subscribeToRuntime,
} from './runtimeStore';

// Hooks
export { useAgentConnection } from './useAgentConnection';
export { useAgentRuntime } from './useAgentRuntime';

// Types - re-exported from @datalayer/core
export type {
  IRuntimeLocation,
  IRuntimeType,
  IRuntimeCapabilities,
  IRuntimePod,
  IRuntimeOptions,
  IRuntimeDesc,
} from './types';

// Types - agent-runtimes specific
export type {
  RuntimeConnection,
  AgentRuntimeStatus as RuntimeStatus,
  AgentConfig,
  AgentConnection,
  AgentRuntimeState,
} from './types';

// Constants
export { DEFAULT_AGENT_CONFIG } from './types';
