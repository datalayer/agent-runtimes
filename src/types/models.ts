/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import type { MCPServer } from './mcp';

/**
 * Specification for an AI model from the catalog.
 */
export interface AIModel {
  /** Unique model identifier (e.g., 'anthropic:claude-3-5-haiku-20241022') */
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
  /**
   * Whether this model is offered to a person choosing one.
   *
   * The catalogue is what the platform knows how to talk to; this says what
   * is worth offering today. Without the distinction a picker lists every
   * model ever added, most of them superseded, and choosing becomes a chore
   * rather than a help.
   */
  available: boolean;
  /** Required environment variable names */
  requiredEnvVars: string[];
  /**
   * Maximum output tokens the model can generate in a single run
   * (maps to pydantic-ai output_tokens_limit).
   */
  tokensLimit?: number;
  /**
   * Whether the model runs on the user's own machine (Ollama, LM Studio,
   * vLLM, llama.cpp). A local model needs no API key, and choosing one moves
   * execution to a local sandbox so the code stays where the tokens do.
   */
  local?: boolean;
  /** OpenAI-compatible base URL, for local and self-hosted endpoints. */
  baseUrl?: string;
  /** Environment variable holding an API key, when the endpoint wants one. */
  apiKeyEnv?: string;
  /**
   * What the model can be trusted with: 'tools', 'codemode', 'vision',
   * 'thinking'. Empty means unstated rather than incapable.
   */
  capabilities?: string[];
}

/**
 * Configuration for an AI model runtime (as returned by the server).
 */
export interface AIModelRuntime {
  /** Model identifier (e.g., 'anthropic:claude-3-5-haiku-20241022') */
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
