// Copyright (c) 2025-2026 Datalayer, Inc.
// Distributed under the terms of the Modified BSD License.

/**
 * ContextDistribution component - Shows context distribution as a treemap.
 */

import { Box, Text, Spinner, Button } from '@primer/react';
import { ListUnorderedIcon } from '@primer/octicons-react';
import { useQuery } from '@tanstack/react-query';
import ReactECharts from 'echarts-for-react';
import { useState } from 'react';

/**
 * Distribution child item
 */
interface DistributionChild {
  name: string;
  value: number;
  children?: DistributionChild[];
}

/**
 * Distribution data for treemap
 */
interface Distribution {
  name: string;
  value: number;
  children: DistributionChild[];
}

/**
 * Context snapshot response from API
 */
export interface ContextSnapshotResponse {
  agentId: string;
  systemPrompts: string[];
  systemPromptTokens: number;
  messages: Array<{
    role: string;
    content: string;
    estimatedTokens: number;
    timestamp: string | null;
  }>;
  userMessageTokens: number;
  assistantMessageTokens: number;
  totalTokens: number;
  contextWindow: number;
  distribution: Distribution;
  error?: string;
}

function getLocalApiBase(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1'
    ? 'http://127.0.0.1:8765'
    : '';
}

/**
 * Format token count for display
 */
function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}

export interface ContextDistributionProps {
  /** Agent ID for fetching context snapshot */
  agentId: string;
  /** Height of the chart */
  height?: string;
}

/**
 * ContextDistribution component displays context distribution as a treemap.
 */
export function ContextDistribution({
  agentId,
  height = '250px',
}: ContextDistributionProps) {
  const [showDetails, setShowDetails] = useState(false);

  const {
    data: snapshotData,
    isLoading,
    error,
  } = useQuery<ContextSnapshotResponse>({
    queryKey: ['context-snapshot', agentId],
    queryFn: async () => {
      const apiBase = getLocalApiBase();
      const response = await fetch(
        `${apiBase}/api/v1/configure/agents/${encodeURIComponent(agentId)}/context-snapshot`,
      );
      if (!response.ok) {
        throw new Error('Failed to fetch context snapshot');
      }
      return response.json();
    },
    refetchInterval: 10000, // Refresh every 10 seconds
    refetchOnMount: 'always',
    staleTime: 0,
  });

  if (isLoading) {
    return (
      <Box
        sx={{
          p: 3,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height,
        }}
      >
        <Spinner size="small" />
        <Text sx={{ ml: 2, fontSize: 1, color: 'fg.muted' }}>
          Loading context distribution...
        </Text>
      </Box>
    );
  }

  if (error || !snapshotData) {
    return (
      <Box
        sx={{
          p: 3,
          bg: 'canvas.subtle',
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'border.default',
        }}
      >
        <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
          Failed to load context distribution
        </Text>
      </Box>
    );
  }

  const { distribution, totalTokens, contextWindow } = snapshotData;
  const hasData = distribution.children && distribution.children.length > 0;

  // ECharts option for treemap
  const chartOption = {
    tooltip: {
      formatter: (info: { name: string; value: number }) => {
        return `${info.name}: ${formatTokens(info.value)} tokens`;
      },
    },
    series: [
      {
        type: 'treemap',
        data: hasData ? distribution.children : [{ name: 'No data', value: 1 }],
        roam: false,
        breadcrumb: {
          show: false,
        },
        label: {
          show: true,
          formatter: '{b}',
          fontSize: 12,
        },
        itemStyle: {
          borderColor: '#fff',
          borderWidth: 2,
        },
        levels: [
          {
            itemStyle: {
              borderColor: '#777',
              borderWidth: 0,
              gapWidth: 1,
            },
          },
          {
            itemStyle: {
              borderColor: '#555',
              borderWidth: 5,
              gapWidth: 1,
            },
            colorSaturation: [0.35, 0.5],
          },
          {
            colorSaturation: [0.35, 0.5],
          },
        ],
      },
    ],
  };

  return (
    <Box>
      {/* Header with title and controls */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
        }}
      >
        <Text sx={{ fontSize: 1, fontWeight: 'bold' }}>
          Current Context ({formatTokens(totalTokens)} /{' '}
          {formatTokens(contextWindow)} tokens)
        </Text>
        <Button
          size="small"
          variant="invisible"
          onClick={() => setShowDetails(!showDetails)}
          leadingVisual={ListUnorderedIcon}
        >
          {showDetails ? 'Hide Details' : 'Show Details'}
        </Button>
      </Box>

      {/* Treemap chart */}
      {hasData ? (
        <ReactECharts
          option={chartOption}
          style={{ height }}
          opts={{ renderer: 'svg' }}
        />
      ) : (
        <Box
          sx={{
            p: 4,
            bg: 'canvas.subtle',
            borderRadius: 2,
            textAlign: 'center',
            height,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
            No context data yet. Start a conversation to see context
            distribution.
          </Text>
        </Box>
      )}

      {/* Details panel */}
      {showDetails && hasData && (
        <Box
          sx={{
            mt: 3,
            p: 2,
            border: '1px solid',
            borderColor: 'border.default',
            borderRadius: 2,
            bg: 'canvas.default',
            fontFamily: 'mono',
            fontSize: 0,
          }}
        >
          <Text sx={{ fontWeight: 'bold', display: 'block', mb: 2 }}>
            Context Breakdown:
          </Text>

          {/* System prompts */}
          {snapshotData.systemPromptTokens > 0 && (
            <Box sx={{ mb: 2 }}>
              <Text sx={{ fontWeight: 'bold' }}>
                System Prompts: {formatTokens(snapshotData.systemPromptTokens)}{' '}
                tokens
              </Text>
              {snapshotData.systemPrompts.map((prompt, idx) => (
                <Text
                  key={idx}
                  sx={{ display: 'block', ml: 3, mt: 1, color: 'fg.muted' }}
                >
                  •{' '}
                  {prompt.length > 100 ? prompt.slice(0, 100) + '...' : prompt}
                </Text>
              ))}
            </Box>
          )}

          {/* Messages breakdown */}
          {(snapshotData.userMessageTokens > 0 ||
            snapshotData.assistantMessageTokens > 0) && (
            <Box sx={{ mb: 2 }}>
              <Text sx={{ fontWeight: 'bold' }}>
                Messages:{' '}
                {formatTokens(
                  snapshotData.userMessageTokens +
                    snapshotData.assistantMessageTokens,
                )}{' '}
                tokens
              </Text>
              <Box sx={{ ml: 3, mt: 1 }}>
                <Text sx={{ display: 'block' }}>
                  • User Messages:{' '}
                  {formatTokens(snapshotData.userMessageTokens)} tokens
                </Text>
                <Text sx={{ display: 'block' }}>
                  • Assistant Responses:{' '}
                  {formatTokens(snapshotData.assistantMessageTokens)} tokens
                </Text>
              </Box>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

export default ContextDistribution;
