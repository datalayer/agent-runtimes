/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * TypeScript types for the AI Agents API.
 *
 * Matches the Python models in agent-runtimes and the
 * ai-agents Kubernetes service.
 *
 * @module api/types
 */

// ---- Running Agents ----

export interface RunningAgent {
  /** Unique agent ID within the runtime */
  agentId: string;
  /** Pod name in Kubernetes */
  podName: string;
  /** Agent display name */
  name: string;
  /** AgentSpec ID used to create the agent */
  specId?: string;
  /** Current agent status */
  status: AgentStatus;
  /** Model being used */
  model: string;
  /** When the agent was created */
  createdAt: string;
  /** Number of completed turns */
  turnCount: number;
  /** Total tokens consumed */
  totalTokens: number;
  /** Estimated cost in USD */
  totalCostUsd: number;
  /** Whether DBOS durability is enabled */
  durableEnabled: boolean;
}

export type AgentStatus =
  | 'running'
  | 'idle'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'checkpointed';

// ---- Tool Approvals ----

export interface ToolApproval {
  /** Unique approval request ID */
  id: string;
  /** Agent that requested the tool call */
  agentId: string;
  /** Pod running the agent */
  podName: string;
  /** Tool being requested */
  toolName: string;
  /** Tool call arguments */
  toolArgs: Record<string, unknown>;
  /** Current approval status */
  status: ToolApprovalStatus;
  /** When the request was created */
  createdAt: string;
  /** When the request was resolved */
  resolvedAt?: string;
  /** Who resolved the request */
  resolvedBy?: string;
  /** Optional note from the approver */
  note?: string;
  /** Time limit for the approval (ISO timestamp) */
  expiresAt?: string;
}

export type ToolApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'auto_approved';

export interface ToolApprovalFilters {
  /** Filter by agent ID */
  agentId?: string;
  /** Filter by status */
  status?: ToolApprovalStatus;
  /** Filter by tool name */
  toolName?: string;
  /** Maximum results to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

// ---- Agent Notifications ----

export interface AgentNotification {
  /** Unique notification ID */
  id: string;
  /** Agent that generated the notification */
  agentId: string;
  /** Pod running the agent */
  podName: string;
  /** Notification severity */
  level: NotificationLevel;
  /** Notification title */
  title: string;
  /** Notification body (markdown) */
  body: string;
  /** Whether the user has read this notification */
  read: boolean;
  /** When the notification was created */
  createdAt: string;
  /** Category for grouping */
  category: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export type NotificationLevel = 'info' | 'warning' | 'error' | 'success';

export interface NotificationFilters {
  /** Filter by agent ID */
  agentId?: string;
  /** Filter by level */
  level?: NotificationLevel;
  /** Only unread notifications */
  unreadOnly?: boolean;
  /** Filter by category */
  category?: string;
  /** Maximum results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

// ---- Conversation Checkpoints ----

export interface ConversationCheckpoint {
  /** Unique checkpoint ID */
  id: string;
  /** Human-readable label */
  label: string;
  /** Turn number when checkpointed */
  turn: number;
  /** Number of messages at checkpoint time */
  messageCount: number;
  /** When the checkpoint was created */
  createdAt: string;
  /** Additional metadata */
  metadata: Record<string, unknown>;
}

// ---- Agent Usage / Cost ----

export interface AgentUsageSummary {
  /** Agent ID */
  agentId: string;
  /** Total tokens (input + output) */
  totalTokens: number;
  /** Input tokens */
  inputTokens: number;
  /** Output tokens */
  outputTokens: number;
  /** Estimated cost in USD */
  totalCostUsd: number;
  /** Number of model requests */
  requestCount: number;
  /** Number of tool calls */
  toolCallCount: number;
  /** Period start */
  periodStart: string;
  /** Period end */
  periodEnd: string;
}

// ---- Output Artifacts ----

export interface OutputArtifact {
  /** Unique artifact ID */
  id: string;
  /** Agent that produced the artifact */
  agentId: string;
  /** Artifact type (e.g. 'pdf', 'csv') */
  type: string;
  /** Filename for download */
  filename: string;
  /** Download URL */
  url: string;
  /** Size in bytes */
  sizeBytes: number;
  /** MIME content type */
  contentType: string;
  /** When the artifact was generated */
  createdAt: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ---- Eval Reports ----

export interface EvalReport {
  /** Unique eval run ID */
  evalId: string;
  /** Agent that was evaluated */
  agentId: string;
  /** Total number of test cases */
  totalCases: number;
  /** Number of passing cases */
  passed: number;
  /** Number of failing cases */
  failed: number;
  /** Average score (0-1) if applicable */
  avgScore: number | null;
  /** Total eval duration in milliseconds */
  durationMs: number;
  /** Path or URL to detailed report */
  reportPath: string | null;
}

export interface RunEvalsRequest {
  /** The evals config list from the agentspec */
  evalSpec: Array<Record<string, unknown>>;
  /** Agent system prompt for synthetic case generation */
  agentSystemPrompt?: string;
  /** Tool JSON schemas for grounding */
  toolSchemas?: Array<Record<string, unknown>>;
}

// ---- Context Usage ----

export interface ContextUsage {
  /** Agent ID */
  agentId: string;
  /** Current token count in the context window */
  currentTokens: number;
  /** Maximum tokens in the context window */
  maxTokens: number;
  /** Usage percentage (0-100) */
  usagePercent: number;
  /** Number of messages in context */
  messageCount: number;
  /** Number of archived/evicted messages */
  archivedCount: number;
  /** Number of auto-summarizations performed */
  summarizationCount: number;
}

// ---- Cost Tracking ----

export interface CostUsage {
  /** Current run cost in USD */
  currentRunCostUsd: number;
  /** Cumulative cost in USD */
  cumulativeCostUsd: number;
  /** Budget limit per run (from agentspec) */
  budgetLimitPerRunUsd: number | null;
  /** Total budget limit */
  budgetLimitTotalUsd: number | null;
  /** Number of model requests */
  requestCount: number;
  /** Total tokens used */
  totalTokensUsed: number;
  /** Breakdown by model */
  modelBreakdown: ModelCostBreakdown[];
}

export interface ModelCostBreakdown {
  /** Model name */
  model: string;
  /** Requests for this model */
  requests: number;
  /** Tokens for this model */
  tokens: number;
  /** Cost for this model */
  costUsd: number;
}
