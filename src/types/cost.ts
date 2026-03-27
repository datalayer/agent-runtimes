/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

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
