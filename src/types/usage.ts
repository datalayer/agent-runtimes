/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

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
