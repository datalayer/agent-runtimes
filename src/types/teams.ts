/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Specification for an agent within a team.
 */
/**
 * A specialist a team member may hand work to.
 *
 * The same shape as a subagent on an agent spec: delegation is one idea, and
 * it should be written the same way wherever it appears.
 */
export interface TeamSubagentspec {
  /** How the member addresses it, e.g. `@CellFixer`. */
  name: string;
  /** Agent catalogue reference, `id` or `id:version`. */
  ref?: string;
  /** What it is for, and when to reach for it. Read by the delegating model. */
  description?: string;
  /** System prompt, for a subagent defined only here. */
  instructions?: string;
}

/**
 * What each member of a team is told about the conversation so far.
 *
 * The two things every multi-agent framework does, named rather than assumed —
 * see {@link TeamContextSpec.sharing}.
 */
export type TeamContextSharing = 'shared' | 'isolated' | 'own-turns';

/** What each member is told about the conversation so far. */
export interface TeamContextSpec {
  /**
   * How much of the conversation each member is given.
   *
   * - `shared` — one thread, and every member is sent all of it. What a
   *   supervisor team wants: routing only makes sense if the member receiving
   *   the work can see what was already said. AutoGen group chats, LangGraph
   *   supervisors and OpenAI handoffs all work this way.
   * - `isolated` — a thread per member, swapped when the person switches. What
   *   a delegation model wants: the child runs blind and returns a result, as
   *   Claude Code subagents and CrewAI tasks do. Choose it when members would
   *   mislead each other more than they would help.
   * - `own-turns` — one thread on screen, but each member is sent only the
   *   turns it took part in. Deliberately makes what the reader sees differ
   *   from what the model sees, which is a cost worth naming.
   *
   * A team's property rather than a runtime's setting, because it follows from
   * what the team *is*.
   */
  sharing: TeamContextSharing;
}

/** How far members may hand work to each other, and to subagents. */
export interface TeamDelegationSpec {
  /** Levels of delegation allowed; 0 forbids it. */
  maxDepth: number;
  /** Whether a member may hand work to another member of the same team. */
  allowPeerDelegation: boolean;
  /** Whether members also get the general-purpose subagent. */
  includeGeneralPurpose: boolean;
}

export interface TeamAgentspec {
  /** Agent identifier within the team */
  id: string;
  /** Display name for the team agent */
  name: string;
  /**
   * Agent catalogue reference, `id` or `id:version`.
   *
   * A member that names one inherits its model, tools, prompt and subagents;
   * the fields below then say what is different about it in this team.
   */
  ref?: string;
  /** Structural role: coordinator, initiator, contributor, reviewer, finalizer. */
  role?: string;
  /**
   * Member ids that must finish first.
   *
   * What makes the running order computable — it replaced a prose `trigger`
   * that read well and could not be executed.
   */
  dependsOn?: string[];
  /** Specialists this member may delegate to. */
  subagents?: TeamSubagentspec[];
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
  /** Display name for the supervisor. */
  name: string;
  /** Agent catalogue reference, `id` or `id:version`. */
  ref?: string;
  /** Model id, overriding the referenced agent's. */
  model?: string;
  /** What the supervisor is accountable for across the whole run. */
  goal?: string;
  /** Supervision prompt, for a supervisor defined only here. */
  instructions?: string;
  /** Whether a person signs off the routing decisions. */
  approval?: string;
  /**
   * Whether the supervisor may end the run before every member has gone.
   * False makes it a router only.
   */
  canTerminate?: boolean;
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
  /** Who decides what happens next. Every team has one. */
  supervisor: TeamSupervisorSpec;
  /** Instructions for routing tasks between agents */
  routingInstructions?: string;
  /**
   * Openers shown in an empty chat.
   *
   * At the team level because they describe the team's front door: the
   * supervisor answers first, and what is worth asking is a property of the
   * whole team rather than of any one member. A person who has just opened a
   * workspace does not yet know there are two agents behind it.
   */
  suggestions?: string[];
  /** How far members may hand work to each other, and to subagents. */
  delegation?: TeamDelegationSpec;
  /** What each member is told about the conversation so far. */
  context?: TeamContextSpec;
  /** Validation settings for the team */
  validation?: TeamValidationSpec;
  /** List of agents in the team */
  agents: TeamAgentspec[];
  /** Reaction rules for automatic event handling */
  reactionRules?: TeamReactionRule[];
  /** Health monitoring configuration */
  healthMonitoring?: TeamHealthMonitoring;
  /** Notification channel configuration */
  notifications?: Record<string, boolean>;
  /** Output configuration */
  output?: TeamOutputSpec;
}
