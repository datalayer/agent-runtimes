/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import type { SkillSpec } from './skills';
import type { MCPServer, AgentMCPServerToolConfig } from './mcp';
import type {
  ToolSpec,
  FrontendToolSpec,
  FrontendRenderToolSpec,
} from './tools';
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
/**
 * An opener offered to somebody arriving at an empty chat.
 *
 * Text and, optionally, a mark to show beside it. It was a bare string, which
 * is enough for a chip in an empty state and not enough for anywhere else a
 * suggestion is offered — a menu, a launcher, a list of what an agent is for —
 * where an unmarked row of sentences is hard to scan. Both marks are optional
 * and independent: an octicon suits chrome already drawn in line art, an emoji
 * suits a place that has colour.
 */
export interface AgentSuggestion {
  /** What is sent when the suggestion is taken. */
  text: string;
  /** Octicon name to show beside it. */
  icon?: string;
  /** Unicode emoji to show beside it. */
  emoji?: string;
}

export interface Agentspec {
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
  /** Domain used to group agents in the gallery */
  domain?: string;
  /** Whether the agent is enabled */
  enabled: boolean;
  /** AI model identifier to use for this agent */
  model?: string;
  /** Inference provider routing strategy */
  inferenceProvider?: 'local' | 'datalayer';
  /** MCP servers used by this agent */
  mcpServers: MCPServer[];
  /** Skills available to this agent */
  skills: SkillSpec[];
  /** Runtime tools available to this agent */
  tools?: ToolSpec[];
  /** Disable tool approvals for this spec (default: false). */
  disableToolApprovals?: boolean;
  /** Frontend tool sets available to this agent */
  frontendTools?: FrontendToolSpec[];
  /** Bindings of backend tools to frontend renderers (tool name + css) */
  frontendRenderTools?: FrontendRenderToolSpec[];
  /** Runtime environment name for this agent */
  environmentName: string;
  /** Icon identifier or URL for the agent */
  icon?: string;
  /** Emoji identifier for the agent */
  emoji?: string;
  /** Theme color for the agent (hex code) */
  color?: string;
  /** Chat suggestions to show users what this agent can do */
  suggestions?: AgentSuggestion[];
  /** Welcome message shown when agent starts */
  welcomeMessage?: string;
  /** Path to Jupyter notebook to show on agent creation */
  welcomeNotebook?: string;
  /** Path to Lexical document to show on agent creation */
  welcomeDocument?: string;
  /**
   * Which agent framework runs this agent's loop.
   *
   * `pydantic-ai` (the default) runs it server-side in the agent runtime;
   * `vercel-ai` runs it in the browser with the Vercel AI SDK, for an agent
   * that has to work with no server behind it. Distinct from `protocol`,
   * which says how a client and an agent talk rather than what runs the loop.
   */
  harness?: string;
  /** Sandbox variant to use for this agent (e.g. 'eval', 'jupyter-server', 'kaggle'). */
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
  /** Pre-launch hooks (package installs and sandbox code). */
  preHooks?: {
    packages?: string[];
    sandbox?: string | string[];
  };
  /** Post-stop hooks (sandbox cleanup code). */
  postHooks?: {
    sandbox?: string | string[];
  };
  /** Per-tool-call hooks (authorization/audit integration). */
  toolHooks?: Record<string, any>;
  /** JSON schema for launch-time parameter values. */
  parameters?: Record<string, any>;
  /** Subagent delegation configuration. */
  subagents?: SubAgentsConfig;
}

/**
 * Where a subagent reached over A2A lives, or how to launch it.
 *
 * Either `url` names an agent already running, or the subagent's `ref` names
 * the agentspec to launch one from — on the local agent-runtimes server when
 * the parent runs locally and on a Datalayer runtime when it runs in the
 * cloud (`launch: 'auto'`, the default), or on one of those explicitly.
 */
export interface A2ASubagentConfig {
  /** JSON-RPC endpoint of an A2A agent already running. */
  url?: string;
  /** Where to launch the agent named by `ref`. */
  launch?: 'local' | 'cloud' | 'auto';
  /** Runtime environment for a cloud launch. */
  environment?: string;
}

/**
 * Configuration for a subagent within an agent specification.
 */
export interface SubAgentspecConfig {
  /** Unique identifier for the subagent */
  name: string;
  /** Brief description shown to the parent agent */
  description: string;
  /**
   * System prompt for the subagent. Optional when `ref` names an agentspec to
   * take it from.
   */
  instructions?: string;
  /**
   * An agentspec this subagent *is*, as `<id>:<version>`.
   *
   * A specialist defined once and referenced by many parents, rather than its
   * instructions copy-pasted into each — which is how they drift apart.
   */
  ref?: string;
  /**
   * Reach this subagent over A2A, as a separate agent, instead of running it
   * inside the parent's process.
   */
  a2a?: A2ASubagentConfig;
  /** LLM model to use (defaults to parent agent's model) */
  model?: string;
  /** Whether the subagent can ask the parent for clarification */
  canAskQuestions?: boolean;
  /** Maximum questions the subagent may ask per task */
  maxQuestions?: number;
  /** Default execution mode preference */
  preferredMode?: 'sync' | 'async' | 'auto';
  /** Typical task complexity hint for auto-mode selection */
  typicalComplexity?: 'simple' | 'moderate' | 'complex';
  /** Whether this subagent typically needs user context */
  typicallyNeedsContext?: boolean;
}

/**
 * Top-level subagents configuration for an agent specification.
 */
export interface SubAgentsConfig {
  /** List of subagent configurations */
  subagents: SubAgentspecConfig[];
  /** Default model for subagents that don't specify one */
  defaultModel?: string;
  /** Include a general-purpose fallback subagent */
  includeGeneralPurpose?: boolean;
  /** Maximum depth for nested subagent delegation (0 = no nesting) */
  maxNestingDepth?: number;
}
