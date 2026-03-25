/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import type { AgentSkillSpec } from './skills';
import type { MCPServer } from './mcp';
import type { ToolSpec } from './tools';

export interface AgentTriggerConfig {
  type?: string;
  cron?: string;
  event_source?: string;
  event?: string;
  description?: string;
  prompt?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface AgentModelConfig {
  temperature?: number;
  max_tokens?: number;
  [key: string]: string | number | boolean | undefined;
}

export interface AgentMCPServerToolConfig {
  server?: string;
  tool?: string;
  enabled?: boolean;
  approval_required?: boolean;
  [key: string]: unknown;
}

export interface AgentCodemodeConfig {
  enabled?: boolean;
  token_reduction?: string;
  speedup?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface AgentOutputConfig {
  type?: string;
  formats?: string[];
  template?: string;
  storage?: string;
  [key: string]: unknown;
}

export interface AgentValidationConfig {
  timeout?: string;
  retryOnFailure?: boolean;
  maxRetries?: number;
  [key: string]: string | number | boolean | undefined;
}

export interface AgentGuardrailConfig {
  id?: string;
  name?: string;
  description?: string;
  identity_provider?: string;
  identity_name?: string;
  permissions?: Record<string, boolean>;
  token_limits?: Record<string, string>;
  data_scope?: Record<string, unknown>;
  data_handling?: Record<string, unknown>;
  approval_policy?: Record<string, unknown>;
  tool_limits?: Record<string, unknown>;
  audit?: Record<string, unknown>;
  content_safety?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AgentEvalConfig {
  id?: string;
  name?: string;
  description?: string;
  category?: string;
  task_count?: number;
  metric?: string;
  source?: string;
  difficulty?: string;
  languages?: string[];
  [key: string]: unknown;
}

export interface AgentAdvancedConfig {
  cost_limit?: string;
  time_limit?: string;
  max_iterations?: number;
  validation?: AgentValidationConfig | string;
  [key: string]: unknown;
}

export interface AgentNotificationConfig {
  email?: string;
  slack?: string;
  teams?: string;
  webhook?: string;
  [key: string]: string | number | boolean | undefined;
}

/**
 * Specification for an AI agent.
 *
 * Defines the configuration for a reusable agent template that can be
 * instantiated as an Agent Runtime.
 */
export interface AgentSpec {
  /** Unique agent identifier */
  id: string;
  /** Version */
  version?: string;
  /** Display name for the agent */
  name: string;
  /** Agent description */
  description: string;
  /** System prompt for the agent */
  systemPrompt?: string;
  /** System prompt addons when codemode is enabled */
  systemPromptCodemodeAddons?: string;
  /** Tags for categorization */
  tags: string[];
  /** Whether the agent is enabled */
  enabled: boolean;
  /** AI model identifier to use for this agent */
  model?: string;
  /** MCP servers used by this agent */
  mcpServers: MCPServer[];
  /** Skills available to this agent */
  skills: AgentSkillSpec[];
  /** Runtime tools available to this agent */
  tools?: ToolSpec[];
  /** Runtime environment name for this agent */
  environmentName: string;
  /** Icon identifier or URL for the agent */
  icon?: string;
  /** Emoji identifier for the agent */
  emoji?: string;
  /** Theme color for the agent (hex code) */
  color?: string;
  /** Chat suggestions to show users what this agent can do */
  suggestions?: string[];
  /** Welcome message shown when agent starts */
  welcomeMessage?: string;
  /** Path to Jupyter notebook to show on agent creation */
  welcomeNotebook?: string;
  /** Path to Lexical document to show on agent creation */
  welcomeDocument?: string;
  /** Sandbox variant to use for this agent ('local-eval', 'jupyter', 'local-jupyter') */
  sandboxVariant?: string;
  /** User-facing objective for the agent */
  goal?: string;
  /** Communication protocol (e.g., 'ag-ui', 'acp', 'a2a', 'vercel-ai') */
  protocol?: string;
  /** UI extension type (e.g., 'a2ui', 'mcp-apps') */
  uiExtension?: string;
  /** Trigger configuration (type, cron, event source, prompt) */
  trigger?: AgentTriggerConfig;
  /** Model configuration (temperature, max_tokens) */
  modelConfig?: AgentModelConfig;
  /** MCP server tool configurations with approval settings */
  mcpServerTools?: AgentMCPServerToolConfig[];
  /** Guardrail configurations */
  guardrails?: AgentGuardrailConfig[];
  /** Evaluation configurations */
  evals?: AgentEvalConfig[];
  /** Codemode configuration (enabled, token_reduction, speedup) */
  codemode?: AgentCodemodeConfig;
  /** Output configuration (type/formats, template) */
  output?: AgentOutputConfig;
  /** Advanced settings (cost_limit, time_limit, max_iterations, validation) */
  advanced?: AgentAdvancedConfig;
  /** Authorization policy */
  authorizationPolicy?: string;
  /** Notification configuration (email, slack) */
  notifications?: AgentNotificationConfig;
  /** Memory backend identifier (e.g., 'ephemeral', 'mem0', 'memu', 'simplemem') */
  memory?: string;
}
