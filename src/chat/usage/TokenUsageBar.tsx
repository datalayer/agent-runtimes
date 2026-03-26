/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * TokenUsageBar — Compact bar showing context-window usage with a
 * tiny pie chart, session totals, and a hover overlay with category
 * breakdown.
 *
 * @module components/chat/elements/TokenUsageBar
 */

import { useRef, useState } from 'react';
import { Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import ReactECharts from 'echarts-for-react';

import { formatTokenCount } from '../../utils';
import type { ContextSnapshotData } from '../../types/context';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TokenUsageBarProps {
  /** Agent usage data from the context-snapshot API */
  agentUsage: ContextSnapshotData;
  /** Horizontal padding to match the chat layout */
  padding: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TokenUsageBar({ agentUsage, padding }: TokenUsageBarProps) {
  // State for context pie chart overlay
  const [contextOverlayOpen, setContextOverlayOpen] = useState(false);
  const contextAnchorRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasTurn =
    agentUsage.turnUsage &&
    (agentUsage.turnUsage.inputTokens > 0 ||
      agentUsage.turnUsage.outputTokens > 0);
  const hasSession =
    agentUsage.sessionUsage &&
    (agentUsage.sessionUsage.inputTokens > 0 ||
      agentUsage.sessionUsage.outputTokens > 0);

  // Build pie chart data
  const usedTokens = agentUsage.totalTokens;
  const windowTokens = agentUsage.contextWindow;
  const freeTokens = Math.max(0, windowTokens - usedTokens);
  const pct = windowTokens > 0 ? (usedTokens / windowTokens) * 100 : 0;

  // Build category breakdown from distribution or individual fields
  const categories: { name: string; value: number; color: string }[] = [];
  if (agentUsage.distribution?.children?.length) {
    const colorMap: Record<string, string> = {
      'System Prompts': '#8250df',
      'Tool Definitions': '#bf8700',
      'User Messages': '#0969da',
      'Assistant Messages': '#1a7f37',
      'Tool Usage': '#cf222e',
    };
    for (const child of agentUsage.distribution.children) {
      categories.push({
        name: child.name,
        value: child.value,
        color: colorMap[child.name] || '#6e7781',
      });
    }
  } else {
    if (agentUsage.systemPromptTokens > 0) {
      categories.push({
        name: 'System Prompts',
        value: agentUsage.systemPromptTokens,
        color: '#8250df',
      });
    }
    if (agentUsage.toolTokens > 0) {
      categories.push({
        name: 'Tool Definitions',
        value: agentUsage.toolTokens,
        color: '#bf8700',
      });
    }
    const messageTokens =
      (agentUsage.userMessageTokens || 0) +
      (agentUsage.assistantMessageTokens || 0);
    if (messageTokens > 0) {
      categories.push({
        name: 'Messages',
        value: messageTokens,
        color: '#0969da',
      });
    }
    const toolResultTokens =
      (agentUsage.toolCallTokens || 0) + (agentUsage.toolReturnTokens || 0);
    if (toolResultTokens > 0) {
      categories.push({
        name: 'Tool Results',
        value: toolResultTokens,
        color: '#cf222e',
      });
    }
  }

  // Tiny filled pie chart options
  const pieColor = pct > 90 ? '#cf222e' : pct > 70 ? '#bf8700' : '#0969da';
  const freeSliceColor = 'var(--bgColor-muted, #f6f8fa)';
  const freeSliceOverlayColor = 'var(--borderColor-default, #d1d9e0)';
  const miniPieOption = {
    animation: false,
    series: [
      {
        type: 'pie',
        radius: [0, '90%'],
        center: ['50%', '50%'],
        silent: true,
        label: { show: false },
        labelLine: { show: false },
        data: [
          { value: usedTokens, itemStyle: { color: pieColor } },
          { value: freeTokens, itemStyle: { color: freeSliceColor } },
        ],
      },
    ],
  };

  // Overlay detail pie options (donut for category breakdown)
  const overlayPieOption = {
    animation: false,
    series: [
      {
        type: 'pie',
        radius: ['45%', '80%'],
        center: ['50%', '50%'],
        silent: true,
        label: { show: false },
        labelLine: { show: false },
        itemStyle: {
          borderColor: 'var(--bgColor-default, #ffffff)',
          borderWidth: 1,
        },
        data: [
          ...categories.map(c => ({
            value: c.value,
            itemStyle: { color: c.color },
          })),
          { value: freeTokens, itemStyle: { color: freeSliceOverlayColor } },
        ],
      },
    ],
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 2,
        py: 1,
        px: padding,
        bg: 'canvas.subtle',
        flexWrap: 'nowrap',
        overflow: 'visible',
        whiteSpace: 'nowrap',
        minWidth: 0,
      }}
    >
      {/* Tiny pie chart with hover overlay */}
      <Box
        sx={{ position: 'relative', flexShrink: 0 }}
        onMouseEnter={() => {
          if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
          hoverTimeoutRef.current = setTimeout(
            () => setContextOverlayOpen(true),
            150,
          );
        }}
        onMouseLeave={() => {
          if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
          hoverTimeoutRef.current = setTimeout(
            () => setContextOverlayOpen(false),
            250,
          );
        }}
      >
        <Box
          ref={contextAnchorRef}
          sx={{
            cursor: 'pointer',
            width: 20,
            height: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid',
            borderColor: 'border.default',
            borderRadius: '50%',
          }}
        >
          <ReactECharts
            option={miniPieOption}
            style={{ width: 18, height: 18 }}
            opts={{ renderer: 'svg' }}
          />
        </Box>
        {contextOverlayOpen && (
          <Box
            sx={{
              position: 'absolute',
              bottom: '100%',
              left: 0,
              mb: 1,
              p: 3,
              width: 260,
              bg: 'canvas.overlay',
              borderRadius: 2,
              boxShadow: 'shadow.large',
              border: '1px solid',
              borderColor: 'border.default',
              zIndex: 100,
            }}
          >
            {/* Header */}
            <Text
              sx={{
                fontWeight: 'bold',
                fontSize: 1,
                color: 'fg.default',
                display: 'block',
                mb: 2,
              }}
            >
              Context Window
            </Text>
            {/* Tokens summary */}
            <Text
              sx={{ fontSize: 0, color: 'fg.muted', display: 'block', mb: 1 }}
            >
              <Text
                as="span"
                sx={{ fontWeight: 'semibold', color: 'fg.default' }}
              >
                {formatTokenCount(usedTokens)}
              </Text>
              {' / '}
              {formatTokenCount(windowTokens)}
              {' tokens'}
            </Text>
            {/* Percentage */}
            <Text
              sx={{
                fontSize: 0,
                color:
                  pct > 90
                    ? 'danger.fg'
                    : pct > 70
                      ? 'attention.fg'
                      : 'fg.muted',
                fontWeight: 'semibold',
                display: 'block',
                mb: 2,
              }}
            >
              {'• '}
              {pct.toFixed(0)}%
            </Text>
            {/* Category donut in overlay */}
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
              <ReactECharts
                option={overlayPieOption}
                style={{ width: 80, height: 80 }}
                opts={{ renderer: 'svg' }}
              />
            </Box>
            {/* Category breakdown */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {categories.map(cat => {
                const catPct =
                  usedTokens > 0 ? (cat.value / usedTokens) * 100 : 0;
                return (
                  <Box
                    key={cat.name}
                    sx={{ display: 'flex', alignItems: 'center', gap: 2 }}
                  >
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        bg: cat.color,
                        flexShrink: 0,
                      }}
                    />
                    <Text sx={{ fontSize: 0, color: 'fg.muted', flex: 1 }}>
                      {cat.name}
                    </Text>
                    <Text
                      sx={{
                        fontSize: 0,
                        color: 'fg.default',
                        fontWeight: 'semibold',
                      }}
                    >
                      {catPct.toFixed(1)}%
                    </Text>
                  </Box>
                );
              })}
            </Box>
            {/* Warning */}
            {pct > 70 && (
              <Text
                sx={{
                  fontSize: 0,
                  color: 'attention.fg',
                  display: 'block',
                  mt: 2,
                  fontStyle: 'italic',
                }}
              >
                Quality may decline as limit nears.
              </Text>
            )}
          </Box>
        )}
      </Box>
      {/* Context window usage */}
      <Text sx={{ fontSize: 0, color: 'fg.muted', flexShrink: 0 }}>
        <Text
          as="span"
          sx={{ fontWeight: 'semibold', color: 'fg.default', fontSize: 0 }}
        >
          {formatTokenCount(agentUsage.totalTokens)}
        </Text>
        {' / '}
        {formatTokenCount(agentUsage.contextWindow)}
        {' ctx'}
      </Text>
      {/* Session totals */}
      {hasSession && (
        <Text sx={{ fontSize: 0, color: 'fg.muted', flexShrink: 0 }}>
          {'· '}
          {formatTokenCount(agentUsage.sessionUsage!.inputTokens)}
          <Text as="span" sx={{ color: 'success.fg', fontSize: 0 }}>
            {'▲'}
          </Text>{' '}
          {formatTokenCount(agentUsage.sessionUsage!.outputTokens)}
          <Text as="span" sx={{ color: 'attention.fg', fontSize: 0 }}>
            {'▼'}
          </Text>
        </Text>
      )}
      {/* Last turn breakdown */}
      {hasTurn && (
        <Text sx={{ fontSize: 0, color: 'fg.muted', flexShrink: 0 }}>
          {'· turn '}
          {formatTokenCount(agentUsage.turnUsage!.inputTokens)}
          <Text as="span" sx={{ color: 'success.fg', fontSize: 0 }}>
            {'▲'}
          </Text>{' '}
          {formatTokenCount(agentUsage.turnUsage!.outputTokens)}
          <Text as="span" sx={{ color: 'attention.fg', fontSize: 0 }}>
            {'▼'}
          </Text>
        </Text>
      )}
    </Box>
  );
}
