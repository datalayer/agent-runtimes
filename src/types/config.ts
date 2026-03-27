/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { AgentLibrary } from './agents';
import { MCPServerConfig, ModelConfig } from './chat';
import type { Protocol } from './protocol';
import type { AgentValidationConfig } from './execution';
import { BuiltinTool } from './models';

/**
 * Default agent configuration values.
 */
export const DEFAULT_AGENT_CONFIG: Required<AgentConfig> = {
  name: 'ai-agent',
  description: 'AI Assistant',
  model: '',
  systemPrompt: 'You are a helpful AI assistant.',
  agentLibrary: 'pydantic-ai',
  protocol: 'vercel-ai',
};

/**
 * Configuration for creating an agent on a runtime.
 */
export interface AgentConfig {
  /** Agent name/ID (defaults to runtime pod name). */
  name?: string;
  /** Agent description. */
  description?: string;
  /** AI model to use. */
  model?: string;
  /** System prompt for the agent. */
  systemPrompt?: string;
  /** Agent library (defaults to `pydantic-ai`). */
  agentLibrary?: AgentLibrary;
  /** Transport protocol (defaults to `ag-ui`). */
  protocol?: Protocol;
}

/**
 * Remote configuration from server
 */
export interface RemoteConfig {
  models: ModelConfig[];
  defaultModel?: string;
  builtinTools: BuiltinTool[];
  mcpServers?: MCPServerConfig[];
}

/**
 * Configuration for connecting to an agent runtime.
 */
export interface AgentRuntimeConfig {
  /** URL of the agent runtime server */
  url: string;
  /** Optional agent ID to connect to */
  agentId?: string;
  /** Optional authentication token */
  authToken?: string;
  /** Optional protocol type (defaults handled by consumers) */
  protocol?: Protocol;
}

/**
 * Codemode configuration for an agent spec.
 */
export interface AgentCodemodeConfig {
  enabled?: boolean;
  token_reduction?: string;
  speedup?: string;
  [key: string]: string | number | boolean | undefined;
}

/**
 * Advanced configuration for an agent spec.
 */
export interface AgentAdvancedConfig {
  cost_limit?: string;
  time_limit?: string;
  max_iterations?: number;
  validation?: AgentValidationConfig | string;
  [key: string]: unknown;
}
