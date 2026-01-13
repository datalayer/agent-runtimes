/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Type definitions for runtime management.
 *
 * Re-exports relevant types from @datalayer/core and defines
 * agent-runtimes specific types for AI agent management.
 *
 * @module runtime/types
 */

import type { ServiceManager } from '@jupyterlab/services';

// Re-export core runtime types from @datalayer/core
export type {
  IRuntimeLocation,
  IRuntimeType,
  IRuntimeCapabilities,
  IRuntimePod,
  IRuntimeDesc,
} from '@datalayer/core/lib/models';

export type { IRuntimeOptions } from '@datalayer/core/lib/stateful/runtimes/apis';

/**
 * Runtime connection status for the agent-runtimes store.
 */
export type AgentRuntimeStatus =
  | 'idle'
  | 'launching'
  | 'connecting'
  | 'ready'
  | 'error'
  | 'disconnected';

/**
 * Information about a connected runtime with agent-runtimes server.
 * Extends the basic runtime info with URLs for both Jupyter and agent services.
 */
export interface RuntimeConnection {
  /** Runtime pod name (unique identifier) */
  podName: string;
  /** Environment name */
  environmentName: string;
  /** Base URL for the Jupyter server */
  jupyterBaseUrl: string;
  /** Base URL for the agent-runtimes server */
  agentBaseUrl: string;
  /** JupyterLab ServiceManager for the runtime */
  serviceManager: ServiceManager.IManager;
  /** Runtime status */
  status: AgentRuntimeStatus;
  /** Kernel ID if connected */
  kernelId?: string;
}

/**
 * Configuration for creating an agent on a runtime.
 */
export interface AgentConfig {
  /** Agent name/ID (defaults to runtime pod name) */
  name?: string;
  /** Agent description */
  description?: string;
  /** AI model to use (e.g., 'anthropic:claude-sonnet-4-5') */
  model?: string;
  /** System prompt for the agent */
  systemPrompt?: string;
  /** Agent library (defaults to 'pydantic-ai') */
  agentLibrary?: 'pydantic-ai' | 'langchain' | 'openai';
  /** Transport protocol (defaults to 'ag-ui') */
  transport?: 'ag-ui' | 'vercel-ai' | 'acp' | 'a2a';
}

/**
 * Information about a connected agent.
 */
export interface AgentConnection {
  /** Agent ID */
  agentId: string;
  /** Full endpoint URL for the agent */
  endpoint: string;
  /** Whether the agent is ready to use */
  isReady: boolean;
}

/**
 * Complete state for an agent runtime in the Zustand store.
 */
export interface AgentRuntimeState {
  /** Runtime connection (null if not connected) */
  runtime: RuntimeConnection | null;
  /** Agent connection (null if not created) */
  agent: AgentConnection | null;
  /** Current status */
  status: AgentRuntimeStatus;
  /** Error message if any */
  error: string | null;
  /** Whether the runtime is launching */
  isLaunching: boolean;
  /** Whether the agent is ready */
  isReady: boolean;
}

/**
 * Default agent configuration values.
 */
export const DEFAULT_AGENT_CONFIG: Required<AgentConfig> = {
  name: 'ai-agent',
  description: 'AI Assistant',
  model: 'anthropic:claude-sonnet-4-5',
  systemPrompt: 'You are a helpful AI assistant.',
  agentLibrary: 'pydantic-ai',
  transport: 'ag-ui',
};
