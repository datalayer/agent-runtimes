/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * CostTracker component — displays running cost for an agent.
 *
 * Shows per-run cost, cumulative cost, and budget utilization
 * with a progress bar and optional alert when approaching limits.
 *
 * @module components/context/CostTracker
 */

import { Box, Heading, Text, ProgressBar, Flash, Label } from '@primer/react';
import { CreditCardIcon, AlertIcon } from '@primer/octicons-react';

/**
 * Cost usage response from the agent-runtimes API.
 */
export interface CostUsageResponse {
  agentId: string;
  /** Cost for the last completed turn in USD */
  lastTurnCostUsd: number;
  /** Total cumulative cost in USD */
  cumulativeCostUsd: number;
  /** Per-run budget limit (from guardrails) */
  perRunBudgetUsd: number | null;
  /** Cumulative budget limit (from guardrails) */
  cumulativeBudgetUsd: number | null;
  /** Number of model requests made */
  requestCount: number;
  /** Total tokens used across all requests */
  totalTokensUsed: number;
  /** Breakdown by model */
  modelBreakdown: Array<{
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    requests: number;
  }>;
  /** Optional run traces with pricing resolution info */
  runs?: Array<{
    pricingResolved: boolean;
  }>;
}

function formatUsd(amount: number): string {
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  if (amount < 1) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(2)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toString();
}

export interface CostTrackerProps {
  /** Agent ID for fetching cost data */
  agentId: string;
  /** Compact mode — show only the summary bar */
  compact?: boolean;
  /** Live cost data pushed by websocket (single source of truth). */
  liveData?: CostUsageResponse | null;
}

/**
 * Displays running cost and budget utilization for an agent.
 */
export function CostTracker({
  agentId: _agentId,
  compact = false,
  liveData,
}: CostTrackerProps) {
  const costData = liveData;

  if (!costData) {
    return (
      <Box sx={{ p: 2 }}>
        <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
          Waiting for websocket snapshot...
        </Text>
      </Box>
    );
  }

  const cumulativePercent =
    costData.cumulativeBudgetUsd != null && costData.cumulativeBudgetUsd > 0
      ? (costData.cumulativeCostUsd / costData.cumulativeBudgetUsd) * 100
      : null;

  const lastTurnCostUsd = costData.lastTurnCostUsd;
  const lastTurnPercent =
    costData.perRunBudgetUsd != null && costData.perRunBudgetUsd > 0
      ? (lastTurnCostUsd / costData.perRunBudgetUsd) * 100
      : null;

  const isOverBudget = cumulativePercent != null && cumulativePercent > 100;
  const isNearBudget = cumulativePercent != null && cumulativePercent > 80;
  const hasUnresolvedPricing =
    Array.isArray(costData.runs) &&
    costData.runs.some(run => run.pricingResolved === false);
  const displayUsd = (amount: number): string =>
    hasUnresolvedPricing && amount === 0 ? '…' : formatUsd(amount);

  // Compact: single row summary
  if (compact) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          px: 2,
          py: 1,
        }}
      >
        <CreditCardIcon size={14} />
        <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
          Cumulative: {displayUsd(costData.cumulativeCostUsd)}
          {costData.cumulativeBudgetUsd != null &&
            ` (budget ${formatUsd(costData.cumulativeBudgetUsd)})`}
          {' | '}Last turn: {displayUsd(lastTurnCostUsd)}
          {costData.perRunBudgetUsd != null &&
            ` (budget ${formatUsd(costData.perRunBudgetUsd)})`}
        </Text>
        {isOverBudget && (
          <Label variant="danger" size="small">
            Over budget
          </Label>
        )}
        {!isOverBudget && isNearBudget && (
          <Label variant="attention" size="small">
            Near limit
          </Label>
        )}
      </Box>
    );
  }

  // Full display
  return (
    <Box>
      <Heading
        as="h4"
        sx={{ fontSize: 1, fontWeight: 'semibold', mb: 2, color: 'fg.muted' }}
      >
        Cost Tracker
      </Heading>

      {isOverBudget && (
        <Flash variant="danger" sx={{ mb: 2 }}>
          <AlertIcon size={16} />
          Cumulative cost ({formatUsd(costData.cumulativeCostUsd)}) exceeds
          budget ({formatUsd(costData.cumulativeBudgetUsd!)}).
        </Flash>
      )}

      {hasUnresolvedPricing && costData.requestCount > 0 && (
        <Flash variant="warning" sx={{ mb: 2 }}>
          <AlertIcon size={16} />
          Some model pricing could not be resolved yet, so cost may remain at …
          even when requests/tokens are increasing.
        </Flash>
      )}

      <Box
        sx={{
          p: 3,
          bg: 'canvas.subtle',
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'border.default',
        }}
      >
        {/* Cumulative cost */}
        <Box sx={{ mb: 3 }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              mb: 1,
            }}
          >
            <Text sx={{ fontSize: 1, fontWeight: 'semibold' }}>Cumulative</Text>
            <Text sx={{ fontSize: 1 }}>
              {displayUsd(costData.cumulativeCostUsd)}
              {costData.cumulativeBudgetUsd != null &&
                ` (budget ${formatUsd(costData.cumulativeBudgetUsd)})`}
            </Text>
          </Box>
          {cumulativePercent != null && (
            <ProgressBar
              progress={Math.min(cumulativePercent, 100)}
              sx={{ height: 6 }}
              bg={
                cumulativePercent > 100
                  ? 'danger.emphasis'
                  : cumulativePercent > 80
                    ? 'attention.emphasis'
                    : 'accent.emphasis'
              }
            />
          )}
        </Box>

        {/* Last turn cost */}
        <Box sx={{ mb: 3 }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              mb: 1,
            }}
          >
            <Text sx={{ fontSize: 1, fontWeight: 'semibold' }}>Last turn</Text>
            <Text sx={{ fontSize: 1 }}>
              {displayUsd(lastTurnCostUsd)}
              {costData.perRunBudgetUsd != null &&
                ` (budget ${formatUsd(costData.perRunBudgetUsd)})`}
            </Text>
          </Box>
          {lastTurnPercent != null && (
            <ProgressBar
              progress={Math.min(lastTurnPercent, 100)}
              sx={{ height: 6 }}
              bg={lastTurnPercent > 80 ? 'danger.emphasis' : 'accent.emphasis'}
            />
          )}
        </Box>

        {/* Stats summary */}
        <Box
          sx={{
            display: 'flex',
            gap: 3,
            borderTop: '1px solid',
            borderColor: 'border.default',
            pt: 2,
          }}
        >
          <Box>
            <Text sx={{ fontSize: 0, color: 'fg.muted', display: 'block' }}>
              Requests
            </Text>
            <Text sx={{ fontSize: 1, fontWeight: 'semibold' }}>
              {costData.requestCount}
            </Text>
          </Box>
          <Box>
            <Text sx={{ fontSize: 0, color: 'fg.muted', display: 'block' }}>
              Tokens
            </Text>
            <Text sx={{ fontSize: 1, fontWeight: 'semibold' }}>
              {formatTokens(costData.totalTokensUsed)}
            </Text>
          </Box>
        </Box>

        {/* Model breakdown */}
        {costData.modelBreakdown.length > 0 && (
          <Box
            sx={{
              mt: 2,
              pt: 2,
              borderTop: '1px solid',
              borderColor: 'border.default',
            }}
          >
            <Text
              sx={{ fontSize: 0, color: 'fg.muted', display: 'block', mb: 1 }}
            >
              By model
            </Text>
            {costData.modelBreakdown.map(m => (
              <Box
                key={m.model}
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  py: '2px',
                }}
              >
                <Text sx={{ fontSize: 0 }}>{m.model}</Text>
                <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                  {displayUsd(m.costUsd)} ({m.requests} req)
                  {hasUnresolvedPricing && m.costUsd === 0
                    ? ' - pricing pending'
                    : ''}
                </Text>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}

export default CostTracker;
