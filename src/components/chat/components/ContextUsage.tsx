// Copyright (c) 2025-2026 Datalayer, Inc.
// Distributed under the terms of the Modified BSD License.

/**
 * ContextUsage component - Shows context usage details with token breakdown.
 */

import {
  CommentDiscussionIcon,
  DatabaseIcon,
  FileIcon,
  ToolsIcon,
  ClockIcon,
} from '@primer/octicons-react';
import { Box, Heading, Text, ProgressBar, Spinner } from '@primer/react';
import { useQuery } from '@tanstack/react-query';

/**
 * Context category child item
 */
interface ContextCategoryChild {
  name: string;
  value: number;
}

/**
 * Context category with children
 */
interface ContextCategory {
  name: string;
  value: number;
  children: ContextCategoryChild[];
}

/**
 * Context details response from API
 */
export interface ContextDetailsResponse {
  name: string;
  totalTokens: number;
  usedTokens: number;
  children: ContextCategory[];
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

/**
 * Get icon for context category
 */
function getCategoryIcon(name: string) {
  switch (name.toLowerCase()) {
    case 'files':
      return FileIcon;
    case 'messages':
      return CommentDiscussionIcon;
    case 'tools':
      return ToolsIcon;
    case 'memory':
      return DatabaseIcon;
    case 'system':
      return FileIcon;
    case 'cache':
      return DatabaseIcon;
    default:
      return ClockIcon;
  }
}

export interface ContextUsageProps {
  /** Agent ID for fetching context details (required) */
  agentId: string;
}

/**
 * ContextUsage component displays token usage breakdown by category.
 */
export function ContextUsage({ agentId }: ContextUsageProps) {
  const {
    data: contextData,
    isLoading,
    error,
  } = useQuery<ContextDetailsResponse>({
    queryKey: ['context-details', agentId],
    queryFn: async () => {
      const apiBase = getLocalApiBase();
      const response = await fetch(
        `${apiBase}/api/v1/configure/agents/${encodeURIComponent(agentId)}/context-details`,
      );
      if (!response.ok) {
        throw new Error('Failed to fetch context details');
      }
      return response.json();
    },
    refetchInterval: 10000, // Refresh every 10 seconds
    refetchOnMount: 'always', // Always refetch when component mounts
    staleTime: 0, // Data is always considered stale
  });

  if (isLoading) {
    return (
      <Box>
        <Heading
          as="h4"
          sx={{
            fontSize: 1,
            fontWeight: 'semibold',
            mb: 2,
            color: 'fg.muted',
          }}
        >
          Cumulative Context Usage
        </Heading>
        <Box
          sx={{
            p: 3,
            bg: 'canvas.subtle',
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'border.default',
            display: 'flex',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <Spinner size="small" />
          <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
            Loading context details...
          </Text>
        </Box>
      </Box>
    );
  }

  if (error || !contextData) {
    return (
      <Box>
        <Heading
          as="h4"
          sx={{
            fontSize: 1,
            fontWeight: 'semibold',
            mb: 2,
            color: 'fg.muted',
          }}
        >
          Cumulative Context Usage
        </Heading>
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
            Failed to load context details
          </Text>
        </Box>
      </Box>
    );
  }

  const contextUsagePercent =
    (contextData.usedTokens / contextData.totalTokens) * 100;

  return (
    <Box>
      <Heading
        as="h4"
        sx={{
          fontSize: 1,
          fontWeight: 'semibold',
          mb: 2,
          color: 'fg.muted',
        }}
      >
        Cumulative Context Usage
      </Heading>
      <Box
        sx={{
          p: 3,
          bg: 'canvas.subtle',
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'border.default',
        }}
      >
        {/* Overall progress */}
        <Box sx={{ mb: 3 }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              mb: 1,
            }}
          >
            <Text sx={{ fontSize: 1, fontWeight: 'semibold' }}>
              {formatTokens(contextData.usedTokens)} /{' '}
              {formatTokens(contextData.totalTokens)} tokens
            </Text>
            <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
              {contextUsagePercent.toFixed(0)}%
            </Text>
          </Box>
          <ProgressBar
            progress={contextUsagePercent}
            sx={{ height: 8 }}
            bg={
              contextUsagePercent > 80 ? 'danger.emphasis' : 'accent.emphasis'
            }
          />
        </Box>

        {/* Category breakdown */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {contextData.children.map(category => {
            const CategoryIcon = getCategoryIcon(category.name);
            const categoryPercent =
              (category.value / contextData.totalTokens) * 100;

            return (
              <Box
                key={category.name}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                <Box sx={{ color: 'fg.muted', width: 20 }}>
                  <CategoryIcon size={16} />
                </Box>
                <Text sx={{ fontSize: 1, flex: 1 }}>{category.name}</Text>
                <Text sx={{ fontSize: 0, color: 'fg.muted', minWidth: 60 }}>
                  {formatTokens(category.value)}
                </Text>
                <Box sx={{ width: 80 }}>
                  <ProgressBar progress={categoryPercent} sx={{ height: 4 }} />
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}

export default ContextUsage;
