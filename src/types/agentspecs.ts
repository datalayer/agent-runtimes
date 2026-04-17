/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import type { SkillSpec } from './skills';
import type { MCPServer, AgentMCPServerToolConfig } from './mcp';
import type { ToolSpec, FrontendToolSpec } from './tools';
import type { AgentTriggerConfig } from './triggers';
import type { AgentModelConfig } from './models';
import type { AgentOutputConfig } from './outputs';
import type { GuardrailSpec } from './guardrails';
import type { AgentEvalConfig } from './evals';
import type { AgentNotificationConfig } from './notifications';
import type { AgentCodemodeConfig, AgentAdvancedConfig } from './config';

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
  skills: SkillSpec[];
  /** Runtime tools available to this agent */
  tools?: ToolSpec[];
  /** Frontend tool sets available to this agent */
  frontendTools?: FrontendToolSpec[];
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
  /** Sandbox variant to use for this agent ('eval', 'jupyter') */
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
  guardrails?: GuardrailSpec[];
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
