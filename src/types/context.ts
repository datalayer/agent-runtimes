/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Context-related type definitions used by chat hooks and usage components.
 *
 * @module types/context
 */

/**
 * Distribution child entry for context snapshot pie chart.
 */
export interface DistributionChild {
  name: string;
  value: number;
}

/**
 * Distribution entry for context snapshot pie chart.
 */
export interface Distribution {
  name: string;
  value: number;
  children: DistributionChild[];
}

/**
 * Response from the context-snapshot API.
 * Contains cumulative token usage tracked by the agent server.
 */
export interface ContextSnapshotData {
  totalTokens: number;
  contextWindow: number;
  sumResponseInputTokens: number;
  sumResponseOutputTokens: number;
  systemPromptTokens: number;
  userMessageTokens: number;
  assistantMessageTokens: number;
  toolTokens: number;
  toolCallTokens: number;
  toolReturnTokens: number;
  historyToolCallTokens: number;
  historyToolReturnTokens: number;
  currentToolCallTokens: number;
  currentToolReturnTokens: number;
  distribution?: Distribution;
  turnUsage?: {
    inputTokens: number;
    outputTokens: number;
    requests: number;
    toolCalls: number;
    toolNames: string[];
    durationSeconds: number;
  } | null;
  sessionUsage?: {
    inputTokens: number;
    outputTokens: number;
    requests: number;
    toolCalls: number;
    turns: number;
    durationSeconds: number;
  } | null;
  costUsage?: {
    lastTurnCostUsd: number;
    cumulativeCostUsd: number;
    perRunBudgetUsd: number | null;
    cumulativeBudgetUsd: number | null;
    requestCount: number;
    totalTokensUsed: number;
    modelBreakdown: Array<{
      model: string;
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
      requests: number;
    }>;
    runs: Array<{
      timestamp: string;
      model: string;
      inputTokens: number;
      outputTokens: number;
      runCostUsd: number;
      cumulativeCostUsd: number;
      pricePerInputToken: number | null;
      pricePerOutputToken: number | null;
      pricingResolved: boolean;
    }>;
    lastUpdated: string;
  };
  error?: string;
}

/**
 * Sandbox status from the backend.
 */
export interface SandboxStatusData {
  available: boolean;
  sandbox_running?: boolean;
  is_executing?: boolean;
  variant?: string;
}
