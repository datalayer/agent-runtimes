/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import type { TransportType } from './protocol';

// ============================================================================
// Agent Status
// ============================================================================

/**
 * Status of an example agent (for UI demos).
 */
export type ExampleAgentStatus =
  | 'starting'
  | 'running'
  | 'paused'
  | 'terminated'
  | 'archived';

// ============================================================================
// Example Agent Types
// ============================================================================

export type Transport = 'acp' | 'ag-ui' | 'vercel-ai' | 'a2a';

export interface ExampleAgent {
  id: string;
  name: string;
  description: string;
  author: string;
  lastEdited: string;
  screenshot: string;
  status?: ExampleAgentStatus;
  transport: Transport;
  avatarUrl: string;
  notebookFile: string;
  lexicalFile: string;
  stars: number;
  notifications: number;
}

export type ExampleAgentsState = {
  agents: readonly ExampleAgent[];
  getAgentById: (id: string) => ExampleAgent | undefined;
  updateAgentStatus: (id: string, status: ExampleAgentStatus) => void;
  toggleAgentStatus: (id: string) => void;
};

// ============================================================================
// Conversation Types
// ============================================================================

export interface ConversationEntry {
  id: string;
  firstMessage?: string;
  timestamp: number;
}

// ============================================================================
// MCP Server Types
// ============================================================================

/**
 * A tool provided by an MCP server.
 */
export interface MCPServerTool {
  /** Tool name/identifier */
  name: string;
  /** Tool description */
  description: string;
  /** Whether the tool is enabled */
  enabled: boolean;
  /** JSON schema for tool input parameters */
  inputSchema?: Record<string, unknown>;
}

/**
 * Configuration for an MCP server.
 */
export interface MCPServer {
  /** Unique server identifier */
  id: string;
  /** Display name for the server */
  name: string;
  /** Server description */
  description?: string;
  /** Server URL (for HTTP-based servers) */
  url: string;
  /** Whether the server is enabled */
  enabled: boolean;
  /** List of available tools */
  tools: MCPServerTool[];
  /** Command to run the MCP server (e.g., 'npx', 'uvx') */
  command?: string;
  /** Command arguments for the MCP server */
  args: string[];
  /** Whether the server is available (based on tool discovery) */
  isAvailable: boolean;
  /** Transport type: 'stdio' or 'http' */
  transport: 'stdio' | 'http';
  /** Environment variables required by this server (e.g., API keys) */
  requiredEnvVars?: string[];
  /** Icon identifier for the server */
  icon?: string;
  /** Emoji identifier for the server */
  emoji?: string;
}

// ============================================================================
// Agent Skill Types
// ============================================================================

/**
 * Specification for an agent skill.
 *
 * Simplified version of the full Skill type from agent-skills,
 * containing only the fields needed for agent specification.
 */
export interface AgentSkillSpec {
  /** Unique skill identifier */
  id: string;
  /** Display name for the skill */
  name: string;
  /** Skill description */
  description: string;
  /** Skill version */
  version: string;
  /** Tags for categorization */
  tags: string[];
  /** Whether the skill is enabled */
  enabled: boolean;
  /** Environment variables required by this skill (e.g., API keys) */
  requiredEnvVars?: string[];
}

/**
 * Specification for a runtime tool.
 */
export interface ToolSpec {
  /** Unique tool identifier */
  id: string;
  /** Display name for the tool */
  name: string;
  /** Tool description */
  description: string;
  /** Tags for categorization */
  tags: string[];
  /** Whether the tool is enabled */
  enabled: boolean;
  /** Approval policy for this tool */
  approval: 'auto' | 'manual';
  /** Icon identifier */
  icon?: string;
  /** Emoji identifier */
  emoji?: string;
}

// ============================================================================
// Guardrail Types
// ============================================================================

/**
 * Permission flags for a guardrail identity.
 */
export interface GuardrailPermissions {
  'read:data': boolean;
  'write:data': boolean;
  'execute:code': boolean;
  'access:internet': boolean;
  'send:email': boolean;
  'deploy:production': boolean;
}

/**
 * Token usage limits for a guardrail.
 */
export interface GuardrailTokenLimits {
  per_run: string;
  per_day: string;
  per_month: string;
}

/**
 * Data scope restrictions — which systems/objects are accessible.
 */
export interface GuardrailDataScope {
  allowed_systems: string[];
  allowed_objects: string[];
  denied_objects: string[];
  denied_fields: string[];
}

/**
 * Data handling policies — aggregation, row-level, PII, redaction.
 */
export interface GuardrailDataHandling {
  default_aggregation: boolean;
  allow_row_level_output: boolean;
  max_rows_in_output: number;
  redact_fields: string[];
  hash_fields: string[];
  pii_detection: boolean;
  pii_action: string;
}

/**
 * Approval policy for sensitive operations.
 */
export interface GuardrailApprovalPolicy {
  require_manual_approval_for: string[];
  auto_approved: string[];
}

/**
 * Tool invocation limits.
 */
export interface GuardrailToolLimits {
  max_tool_calls: number;
  max_query_rows: number;
  max_query_runtime: string;
  max_time_window_days: number;
}

/**
 * Audit trail configuration.
 */
export interface GuardrailAudit {
  log_tool_calls: boolean;
  log_query_metadata_only: boolean;
  retain_days: number;
  require_lineage_in_report: boolean;
}

/**
 * Content safety settings.
 */
export interface GuardrailContentSafety {
  treat_crm_text_fields_as_untrusted: boolean;
  do_not_follow_instructions_from_data: boolean;
}

/**
 * Full guardrail specification.
 */
export interface GuardrailSpec {
  /** Unique guardrail identifier */
  id: string;
  /** Display name */
  name: string;
  /** Description of the guardrail */
  description: string;
  /** Identity provider (e.g., 'datalayer', 'github', 'azure-ad', 'google') */
  identity_provider: string;
  /** Identity name within the provider */
  identity_name: string;
  /** Permission flags */
  permissions: GuardrailPermissions;
  /** Token usage limits */
  token_limits: GuardrailTokenLimits;
  /** Data scope restrictions */
  data_scope?: GuardrailDataScope;
  /** Data handling policies */
  data_handling?: GuardrailDataHandling;
  /** Approval policy */
  approval_policy?: GuardrailApprovalPolicy;
  /** Tool invocation limits */
  tool_limits?: GuardrailToolLimits;
  /** Audit trail configuration */
  audit?: GuardrailAudit;
  /** Content safety settings */
  content_safety?: GuardrailContentSafety;
}

// ============================================================================
// Eval Types
// ============================================================================

/**
 * Evaluation benchmark specification.
 */
export interface EvalSpec {
  /** Unique eval identifier */
  id: string;
  /** Display name */
  name: string;
  /** Description of the evaluation */
  description: string;
  /** Category: Coding, Knowledge, Reasoning, Agentic, or Safety */
  category: 'Coding' | 'Knowledge' | 'Reasoning' | 'Agentic' | 'Safety';
  /** Number of tasks in the benchmark */
  task_count: number;
  /** Primary metric (e.g., 'pass@1', 'accuracy', 'success_rate') */
  metric: string;
  /** Source URL or repository */
  source: string;
  /** Difficulty level */
  difficulty: 'easy' | 'medium' | 'hard' | 'expert';
  /** Relevant languages */
  languages: string[];
}

// ============================================================================
// Trigger Types
// ============================================================================

/**
 * Dynamic field definition for a trigger type.
 */
export interface TriggerField {
  /** Field key */
  name: string;
  /** Human-readable label */
  label: string;
  /** Field type */
  type: 'string' | 'boolean' | 'number';
  /** Whether the field is required */
  required: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Help text */
  help?: string;
  /** Font family hint (e.g., 'mono') */
  font?: string;
}

/**
 * Trigger type specification.
 */
export interface TriggerSpec {
  /** Unique trigger identifier */
  id: string;
  /** Display name */
  name: string;
  /** Description of the trigger */
  description: string;
  /** Trigger type discriminator */
  type: 'once' | 'schedule' | 'event';
  /** Dynamic fields for this trigger type */
  fields?: TriggerField[];
}

// ============================================================================
// Output Types
// ============================================================================

/**
 * Output format specification.
 */
export interface OutputSpec {
  /** Unique output identifier */
  id: string;
  /** Display name */
  name: string;
  /** Description of the output format */
  description: string;
  /** Icon identifier */
  icon: string;
  /** Whether this format supports templates */
  supports_template: boolean;
  /** Whether this format supports storage paths */
  supports_storage: boolean;
  /** MIME types produced */
  mime_types: string[];
}

// ============================================================================
// Notification Channel Types
// ============================================================================

/**
 * Dynamic field definition for a notification channel.
 */
export interface NotificationField {
  /** Field key */
  name: string;
  /** Human-readable label */
  label: string;
  /** Field type */
  type: 'string' | 'boolean' | 'number';
  /** Whether the field is required */
  required: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Default value */
  default?: string | boolean | number;
}

/**
 * Notification channel specification.
 */
export interface NotificationChannelSpec {
  /** Unique channel identifier */
  id: string;
  /** Display name */
  name: string;
  /** Description of the channel */
  description: string;
  /** Icon identifier */
  icon: string;
  /** Whether this channel is currently available */
  available: boolean;
  /** Whether this channel is marked as coming soon */
  coming_soon?: boolean;
  /** Dynamic configuration fields for this channel */
  fields: NotificationField[];
}

// ============================================================================
// Agent Types
// ============================================================================

/**
 * Specification for an AI agent.
 *
 * Defines the configuration for a reusable agent template that can be
 * instantiated as an Agent Runtime.
 */
export interface AgentSpec {
  /** Unique agent identifier */
  id: string;
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
  /** Trigger configuration (type, cron, description) */
  trigger?: Record<string, any>;
  /** Model configuration (temperature, max_tokens) */
  modelConfig?: Record<string, any>;
  /** MCP server tool configurations with approval settings */
  mcpServerTools?: Record<string, any>[];
  /** Guardrail configurations */
  guardrails?: Record<string, any>[];
  /** Evaluation configurations */
  evals?: Record<string, any>[];
  /** Codemode configuration (enabled, token_reduction, speedup) */
  codemode?: Record<string, any>;
  /** Output configuration (type/formats, template) */
  output?: Record<string, any>;
  /** Advanced settings (cost_limit, time_limit, max_iterations, validation) */
  advanced?: Record<string, any>;
  /** Authorization policy */
  authorizationPolicy?: string;
  /** Notification configuration (email, slack) */
  notifications?: Record<string, any>;
  /** Memory backend identifier (e.g., 'ephemeral', 'mem0', 'memu', 'simplemem') */
  memory?: string;
}

// ============================================================================
// Team Types
// ============================================================================

/**
 * Specification for an agent within a team.
 */
export interface TeamAgentSpec {
  /** Agent identifier within the team */
  id: string;
  /** Display name for the team agent */
  name: string;
  /** Role within the team (e.g., 'Primary · Initiator', 'Secondary', 'Final') */
  role?: string;
  /** Goal or objective for this agent */
  goal?: string;
  /** AI model identifier */
  model?: string;
  /** MCP server used by this agent */
  mcpServer?: string;
  /** Tools available to this agent */
  tools?: string[];
  /** Trigger condition for this agent */
  trigger?: string;
  /** Approval policy: 'auto' or 'manual' */
  approval?: string;
}

/**
 * Supervisor agent configuration for a team.
 */
export interface TeamSupervisorSpec {
  /** Supervisor agent name */
  name: string;
  /** AI model used by the supervisor */
  model?: string;
}

/**
 * Validation settings for a team.
 */
export interface TeamValidationSpec {
  /** Maximum execution time (e.g., '300s') */
  timeout?: string;
  /** Whether to retry on failure */
  retryOnFailure?: boolean;
  /** Maximum number of retries */
  maxRetries?: number;
}

/**
 * A reaction rule for automatic team event handling.
 */
export interface TeamReactionRule {
  /** Rule identifier */
  id: string;
  /** Trigger event (e.g., 'task-failed', 'member-unresponsive') */
  trigger: string;
  /** Action to take (e.g., 'send-to-agent', 'restart-member', 'notify') */
  action: string;
  /** Whether the action is automatic */
  auto: boolean;
  /** Maximum number of retries */
  maxRetries: number;
  /** Escalate after this many retries */
  escalateAfterRetries: number;
  /** Priority level (e.g., 'warning', 'action', 'urgent') */
  priority: string;
}

/**
 * Health monitoring configuration for a team.
 */
export interface TeamHealthMonitoring {
  /** Duration between expected heartbeats (e.g. '30s', '1m') */
  heartbeatInterval: string;
  /** Member marked stale after this duration (e.g. '120s') */
  staleThreshold: string;
  /** Member marked unresponsive after this duration (e.g. '300s') */
  unresponsiveThreshold: string;
  /** Member marked stuck after this duration (e.g. '600s') */
  stuckThreshold: string;
  /** Maximum restart attempts before giving up */
  maxRestartAttempts: number;
}

/**
 * Output configuration for a team.
 */
export interface TeamOutputSpec {
  /** Output formats (e.g., 'JSON', 'PDF', 'CSV') */
  formats: string[];
  /** Output template name */
  template?: string;
  /** Storage location */
  storage?: string;
}

/**
 * Specification for a multi-agent team.
 */
export interface TeamSpec {
  /** Unique team identifier */
  id: string;
  /** Display name for the team */
  name: string;
  /** Team description */
  description: string;
  /** Classification tags */
  tags: string[];
  /** Whether the team is enabled */
  enabled: boolean;
  /** Icon identifier */
  icon?: string;
  /** Emoji representation */
  emoji?: string;
  /** Theme color (hex) */
  color?: string;
  /** ID of the associated agent spec */
  agentSpecId: string;
  /** Orchestration protocol (e.g., 'datalayer') */
  orchestrationProtocol: string;
  /** Execution mode: 'sequential' or 'parallel' */
  executionMode: string;
  /** Supervisor agent configuration */
  supervisor?: TeamSupervisorSpec;
  /** Instructions for routing tasks between agents */
  routingInstructions?: string;
  /** Validation settings for the team */
  validation?: TeamValidationSpec;
  /** List of agents in the team */
  agents: TeamAgentSpec[];
  /** Reaction rules for automatic event handling */
  reactionRules?: TeamReactionRule[];
  /** Health monitoring configuration */
  healthMonitoring?: TeamHealthMonitoring;
  /** Notification channel configuration */
  notifications?: Record<string, boolean>;
  /** Output configuration */
  output?: TeamOutputSpec;
}

// ============================================================================
// AI Model Types
// ============================================================================

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

// ============================================================================
// Frontend Config Types
// ============================================================================

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

// ============================================================================
// Agent Runtime Config Types
// ============================================================================

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
  protocol?: TransportType;
}
