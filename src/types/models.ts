/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import type { MCPServer } from './mcp';

/**
 * Specification for an AI model from the catalog.
 */
export interface AIModel {
  /** Unique model identifier (e.g., 'anthropic:claude-sonnet-4-5-20250514') */
  id: string;
  /** Model spec version */
  version: string;
  /** Display name for the model */
  name: string;
  /** Model description */
  description: string;
  /** Provider name (anthropic, openai, bedrock, azure-openai) */
  provider: string;
  /** Whether this is the default model */
  default: boolean;
  /** Required environment variable names */
  requiredEnvVars: string[];
}

/**
 * Configuration for an AI model runtime (as returned by the server).
 */
export interface AIModelRuntime {
  /** Model identifier (e.g., 'anthropic:claude-sonnet-4-5') */
  id: string;
  /** Display name for the model */
  name: string;
  /** List of builtin tool IDs */
  builtinTools: string[];
  /** Required environment variables for this model */
  requiredEnvVars: string[];
  /** Whether the model is available (based on env vars) */
  isAvailable: boolean;
}

/**
 * Configuration for a builtin tool.
 */
export interface BuiltinTool {
  /** Tool identifier */
  id: string;
  /** Display name for the tool */
  name: string;
}

/**
 * Configuration returned to frontend.
 */
export interface FrontendConfig {
  /** Available AI models */
  models: AIModelRuntime[];
  /** Available builtin tools */
  builtinTools: BuiltinTool[];
  /** Configured MCP servers */
  mcpServers: MCPServer[];
}

/**
 * Model configuration for an agent spec.
 */
export interface AgentModelConfig {
  temperature?: number;
  max_tokens?: number;
  [key: string]: string | number | boolean | undefined;
}
