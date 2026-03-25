/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import type { MCPServer } from './mcp';

/**
 * Configuration for an AI model.
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
