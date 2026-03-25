/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

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
  /** Version */
  version?: string;
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
