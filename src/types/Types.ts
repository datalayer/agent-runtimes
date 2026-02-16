/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

// ============================================================================
// Agent Status
// ============================================================================

/**
 * Status of an agent.
 */
export type AgentStatus =
  | 'starting'
  | 'running'
  | 'paused'
  | 'terminated'
  | 'archived';

// ============================================================================
// Example Agent Types
// ============================================================================

export type Transport = 'acp' | 'ag-ui' | 'vercel-ai' | 'a2a';

export interface Agent {
  id: string;
  name: string;
  description: string;
  author: string;
  lastEdited: string;
  screenshot: string;
  status?: AgentStatus;
  transport: Transport;
  avatarUrl: string;
  notebookFile: string;
  lexicalFile: string;
  stars: number;
  notifications: number;
}

export type AgentsState = {
  agents: readonly Agent[];
  getAgentById: (id: string) => Agent | undefined;
  updateAgentStatus: (id: string, status: AgentStatus) => void;
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

// ============================================================================
// Agent Types
// ============================================================================

/**
 * Specification for an AI agent.
 *
 * Defines the configuration for a reusable agent template that can be
 * instantiated as an AgentSpace.
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
}
