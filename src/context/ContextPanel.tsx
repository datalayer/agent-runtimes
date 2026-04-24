// Copyright (c) 2025-2026 Datalayer, Inc.
// Distributed under the terms of the Modified BSD License.

/**
 * ContextPanel component - Unified context usage display with:
 * - Cumulative usage with progress bar
 * - Token distribution treemap
 * - Historic usage time-series chart
 */

import {
  CommentDiscussionIcon,
  DatabaseIcon,
  FileIcon,
  ToolsIcon,
  ClockIcon,
  GraphIcon,
  AppsIcon,
  ListUnorderedIcon,
  DownloadIcon,
} from '@primer/octicons-react';
import {
  Heading,
  Text,
  ProgressBar,
  Spinner,
  Button,
  SegmentedControl,
} from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import ReactECharts from 'echarts-for-react';
import { useState, useMemo } from 'react';

/**
 * Distribution child item for treemap
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
 * Request usage snapshot - historic per-request data
 */
interface RequestUsageSnapshot {
  requestNum: number;
  inputTokens: number;
  outputTokens: number;
  toolNames: string[];
  timestamp: string | null;
  turnId: string | null;
  durationMs: number;
}

/**
 * Tool snapshot
 */
interface ToolSnapshot {
  name: string;
  description: string | null;
  parametersTokens: number;
  totalTokens: number;
}

/**
 * Turn usage
 */
interface TurnUsage {
  inputTokens: number;
  outputTokens: number;
  requests: number;
  toolCalls: number;
  toolNames: string[];
  durationSeconds: number;
}

/**
 * Session usage
 */
interface SessionUsage {
  inputTokens: number;
  outputTokens: number;
  requests: number;
  toolCalls: number;
  turns: number;
  durationSeconds: number;
}

/**
 * Context snapshot response from API
 */
export interface ContextSnapshotResponse {
  agentId: string;
  systemPrompts: string[];
  systemPromptTokens: number;
  tools: ToolSnapshot[];
  toolTokens: number;
  historyToolCallTokens: number;
  historyToolReturnTokens: number;
  currentToolCallTokens: number;
  currentToolReturnTokens: number;
  toolCallTokens: number;
  toolReturnTokens: number;
  historyUserTokens: number;
  historyAssistantTokens: number;
  currentUserTokens: number;
  currentAssistantTokens: number;
  historyTokens: number;
  currentMessageTokens: number;
  userMessageTokens: number;
  assistantMessageTokens: number;
  totalTokens: number;
  modelInputTokens: number | null;
  modelOutputTokens: number | null;
  sumResponseInputTokens: number;
  sumResponseOutputTokens: number;
  perRequestUsage: RequestUsageSnapshot[];
  contextWindow: number;
  turnUsage: TurnUsage | null;
  sessionUsage: SessionUsage | null;
  distribution: Distribution;
  error?: string;
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
 * Format duration
 */
function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || Number.isNaN(seconds) || seconds < 0) {
    return '0ms';
  }
  if (seconds < 1) {
    return `${Math.max(0, Math.round(seconds * 1000))}ms`;
  }
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${minutes}m ${secs}s`;
}

function csvCell(value: string | number | null | undefined): string {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadContextUsageAsCSV(data: ContextSnapshotResponse): void {
  const rows: Array<Array<string | number>> = [];
  rows.push(['Context Usage Snapshot for Agent', data.agentId]);
  rows.push(['Generated At', new Date().toISOString()]);
  rows.push([]);

  rows.push(['Summary']);
  rows.push(['Total Tokens', data.totalTokens]);
  rows.push(['Context Window', data.contextWindow]);
  rows.push(['System Prompt Tokens', data.systemPromptTokens]);
  rows.push(['Tool Tokens', data.toolTokens]);
  rows.push(['History Tokens', data.historyTokens]);
  rows.push(['Current Message Tokens', data.currentMessageTokens]);
  rows.push(['User Message Tokens', data.userMessageTokens]);
  rows.push(['Assistant Message Tokens', data.assistantMessageTokens]);
  rows.push([]);

  if (data.sessionUsage) {
    rows.push(['Session Usage']);
    rows.push(['Input Tokens', data.sessionUsage.inputTokens]);
    rows.push(['Output Tokens', data.sessionUsage.outputTokens]);
    rows.push(['Requests', data.sessionUsage.requests]);
    rows.push(['Tool Calls', data.sessionUsage.toolCalls]);
    rows.push(['Turns', data.sessionUsage.turns]);
    rows.push(['Duration Seconds', data.sessionUsage.durationSeconds]);
    rows.push([]);
  }

  if (data.turnUsage) {
    rows.push(['Last Turn Usage']);
    rows.push(['Input Tokens', data.turnUsage.inputTokens]);
    rows.push(['Output Tokens', data.turnUsage.outputTokens]);
    rows.push(['Requests', data.turnUsage.requests]);
    rows.push(['Tool Calls', data.turnUsage.toolCalls]);
    rows.push(['Duration Seconds', data.turnUsage.durationSeconds]);
    rows.push([]);
  }

  rows.push(['Distribution']);
  rows.push(['Category', 'Tokens']);
  for (const category of data.distribution?.children ?? []) {
    rows.push([category.name, category.value]);
  }
  rows.push([]);

  if (data.perRequestUsage.length > 0) {
    rows.push(['Per Request Usage']);
    rows.push([
      'Request #',
      'Input Tokens',
      'Output Tokens',
      'Duration Ms',
      'Tool Names',
      'Timestamp',
      'Turn ID',
    ]);
    for (const request of data.perRequestUsage) {
      rows.push([
        request.requestNum,
        request.inputTokens,
        request.outputTokens,
        request.durationMs,
        request.toolNames.join('; '),
        request.timestamp ?? '',
        request.turnId ?? '',
      ]);
    }
  }

  const csv = rows.map(row => row.map(csvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  link.download = `context-usage-${data.agentId}-${ts}.csv`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Get icon for context category
 */
function getCategoryIcon(name: string) {
  switch (name.toLowerCase()) {
    case 'messages':
    case 'history':
      return CommentDiscussionIcon;
    case 'tools':
    case 'tool definitions':
      return ToolsIcon;
    case 'system':
    case 'system prompts':
      return FileIcon;
    case 'cache':
      return DatabaseIcon;
    default:
      return ClockIcon;
  }
}

type ViewMode = 'overview' | 'distribution' | 'history';

export interface ContextPanelProps {
  /** Agent ID for fetching context details (required) */
  agentId: string;
  /** API base URL for fetching context data */
  apiBase?: string;
  /** Live context snapshot pushed by websocket; skips internal polling when provided */
  liveData?: ContextSnapshotResponse | null;
  /** Number of messages in conversation (from chat store) */
  messageCount?: number;
  /** Default view mode */
  defaultView?: ViewMode;
  /** Height for charts */
  chartHeight?: string;
}

/**
 * ContextPanel component - unified context usage display.
 */
export function ContextPanel({
  agentId,
  apiBase,
  liveData,
  messageCount = 0,
  defaultView = 'overview',
  chartHeight = '200px',
}: ContextPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(defaultView);
  const [showDetails, setShowDetails] = useState(false);

  const hasLiveData = liveData !== undefined;

  // REST polling removed — data comes exclusively via WS `agent.snapshot`.
  const snapshotData = liveData;
  const showLoading = !hasLiveData;
  const hasError = false;

  // Build historic usage chart data from perRequestUsage
  const historyChartOption = useMemo(() => {
    if (
      !snapshotData?.perRequestUsage ||
      snapshotData.perRequestUsage.length === 0
    ) {
      return null;
    }

    const requests = snapshotData.perRequestUsage;

    // Calculate cumulative tokens over time
    let cumulativeInput = 0;
    let cumulativeOutput = 0;

    const xAxisData: string[] = [];
    const inputData: number[] = [];
    const outputData: number[] = [];
    const totalData: number[] = [];

    requests.forEach(req => {
      cumulativeInput += req.inputTokens;
      cumulativeOutput += req.outputTokens;

      xAxisData.push(`#${req.requestNum}`);
      inputData.push(cumulativeInput);
      outputData.push(cumulativeOutput);
      totalData.push(cumulativeInput + cumulativeOutput);
    });

    return {
      tooltip: {
        trigger: 'axis',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (params: any[]) => {
          const reqNum = params[0]?.axisValue || '';
          let result = `<strong>${reqNum}</strong><br/>`;
          params.forEach(p => {
            result += `${p.marker} ${p.seriesName}: ${formatTokens(p.value)}<br/>`;
          });
          return result;
        },
      },
      legend: {
        data: ['Input', 'Output', 'Total'],
        bottom: 0,
        textStyle: { fontSize: 10 },
      },
      grid: {
        left: 45,
        right: 15,
        top: 10,
        bottom: 35,
      },
      xAxis: {
        type: 'category',
        data: xAxisData,
        axisLabel: { fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          fontSize: 10,
          formatter: (value: number) => formatTokens(value),
        },
      },
      series: [
        {
          name: 'Input',
          type: 'line',
          data: inputData,
          smooth: true,
          lineStyle: { width: 2 },
          areaStyle: { opacity: 0.2 },
          itemStyle: { color: '#3B82F6' },
        },
        {
          name: 'Output',
          type: 'line',
          data: outputData,
          smooth: true,
          lineStyle: { width: 2 },
          areaStyle: { opacity: 0.2 },
          itemStyle: { color: '#10B981' },
        },
        {
          name: 'Total',
          type: 'line',
          data: totalData,
          smooth: true,
          lineStyle: { width: 2, type: 'dashed' },
          itemStyle: { color: '#8B5CF6' },
        },
      ],
    };
  }, [snapshotData?.perRequestUsage]);

  // Build treemap chart option
  const treemapOption = useMemo(() => {
    if (!snapshotData?.distribution) return null;

    const { distribution } = snapshotData;
    const hasData = distribution.children && distribution.children.length > 0;

    return {
      tooltip: {
        formatter: (info: { name: string; value: number }) => {
          return `${info.name}: ${formatTokens(info.value)} tokens`;
        },
      },
      series: [
        {
          type: 'treemap',
          data: hasData
            ? distribution.children
            : [{ name: 'No data', value: 1 }],
          roam: false,
          breadcrumb: { show: false },
          label: {
            show: true,
            formatter: '{b}',
            fontSize: 11,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotData?.distribution]);

  if (showLoading) {
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
          Context Usage
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

  if (hasError || !snapshotData) {
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
          Context Usage
        </Heading>
        <Box
          sx={{
            p: 3,
            bg: 'attention.subtle',
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'attention.muted',
          }}
        >
          <Text sx={{ fontSize: 1, color: 'attention.fg' }}>
            Waiting for context data from WebSocket stream...
          </Text>
        </Box>
      </Box>
    );
  }

  const { totalTokens, contextWindow, sessionUsage, turnUsage, distribution } =
    snapshotData;

  const sentMessageCount =
    messageCount > 0
      ? messageCount
      : Math.max(
          sessionUsage?.turns ?? 0,
          snapshotData.perRequestUsage?.length > 0 ? 1 : 0,
        );
  const hasDistributionData =
    distribution?.children && distribution.children.length > 0;

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
        }}
      >
        <Heading
          as="h4"
          sx={{
            fontSize: 1,
            fontWeight: 'semibold',
            color: 'fg.muted',
          }}
        >
          Context Usage
        </Heading>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {sentMessageCount > 0 && (
            <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
              {sentMessageCount}{' '}
              {sentMessageCount === 1 ? 'message sent' : 'messages sent'}
            </Text>
          )}
          <Button
            size="small"
            variant="invisible"
            leadingVisual={DownloadIcon}
            onClick={() => downloadContextUsageAsCSV(snapshotData)}
          >
            Download
          </Button>
        </Box>
      </Box>

      <Box
        sx={{
          p: 3,
          bg: 'canvas.subtle',
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'border.default',
        }}
      >
        {/* Context usage */}
        <Box sx={{ mb: 3 }}>
          <Text sx={{ fontSize: 1, fontWeight: 'semibold' }}>
            Total usage: {formatTokens(totalTokens)}
          </Text>
        </Box>

        {/* Session & Turn stats row */}
        {(sessionUsage || turnUsage) && (
          <Box
            sx={{
              display: 'flex',
              gap: 3,
              mb: 3,
              flexWrap: 'wrap',
            }}
          >
            {sessionUsage && (
              <Box
                sx={{
                  flex: 1,
                  minWidth: 120,
                  p: 2,
                  bg: 'canvas.default',
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'border.muted',
                }}
              >
                <Text sx={{ fontSize: 0, color: 'fg.muted', display: 'block' }}>
                  Session ({sessionUsage.turns} turns)
                </Text>
                <Text sx={{ fontSize: 1, fontWeight: 'semibold' }}>
                  {formatTokens(
                    sessionUsage.inputTokens + sessionUsage.outputTokens,
                  )}
                </Text>
                <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                  {' '}
                  in {formatDuration(sessionUsage.durationSeconds)}
                </Text>
              </Box>
            )}
            {turnUsage && (
              <Box
                sx={{
                  flex: 1,
                  minWidth: 120,
                  p: 2,
                  bg: 'canvas.default',
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'border.muted',
                }}
              >
                <Text sx={{ fontSize: 0, color: 'fg.muted', display: 'block' }}>
                  Last Turn ({turnUsage.requests} reqs)
                </Text>
                <Text sx={{ fontSize: 1, fontWeight: 'semibold' }}>
                  {formatTokens(turnUsage.inputTokens + turnUsage.outputTokens)}
                </Text>
                <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                  {' '}
                  in {formatDuration(turnUsage.durationSeconds)}
                </Text>
              </Box>
            )}
          </Box>
        )}

        {/* View mode selector */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: 2,
          }}
        >
          <SegmentedControl
            aria-label="View mode"
            size="small"
            onChange={index => {
              const modes: ViewMode[] = ['overview', 'distribution', 'history'];
              setViewMode(modes[index]);
            }}
          >
            <SegmentedControl.IconButton
              aria-label="Overview"
              selected={viewMode === 'overview'}
              icon={ListUnorderedIcon}
            />
            <SegmentedControl.IconButton
              aria-label="Distribution"
              selected={viewMode === 'distribution'}
              icon={AppsIcon}
              disabled={!hasDistributionData}
            />
            <SegmentedControl.IconButton
              aria-label="History"
              selected={viewMode === 'history'}
              icon={GraphIcon}
            />
          </SegmentedControl>

          {viewMode === 'overview' && (
            <Button
              size="small"
              variant="invisible"
              onClick={() => setShowDetails(!showDetails)}
            >
              {showDetails ? 'Less' : 'More'}
            </Button>
          )}
        </Box>

        {/* View content */}
        {viewMode === 'overview' && (
          <Box>
            {/* Category breakdown */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {hasDistributionData &&
                distribution.children.map(category => {
                  const CategoryIcon = getCategoryIcon(category.name);
                  const categoryPercent =
                    (category.value / contextWindow) * 100;

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
                      <Text
                        sx={{ fontSize: 0, color: 'fg.muted', minWidth: 60 }}
                      >
                        {formatTokens(category.value)}
                      </Text>
                      <Box sx={{ width: 80 }}>
                        <ProgressBar
                          progress={categoryPercent}
                          sx={{ height: 4 }}
                        />
                      </Box>
                    </Box>
                  );
                })}

              {!hasDistributionData && (
                <Text
                  sx={{
                    color: 'fg.muted',
                    fontSize: 1,
                    textAlign: 'center',
                    py: 2,
                  }}
                >
                  No context data yet. Start a conversation to see usage.
                </Text>
              )}
            </Box>

            {/* Detailed breakdown */}
            {showDetails && hasDistributionData && (
              <Box
                sx={{
                  mt: 3,
                  p: 2,
                  bg: 'canvas.default',
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'border.muted',
                  fontSize: 0,
                }}
              >
                {/* System prompts */}
                {snapshotData.systemPromptTokens > 0 && (
                  <Box sx={{ mb: 2 }}>
                    <Text sx={{ fontWeight: 'semibold' }}>
                      System Prompts:{' '}
                      {formatTokens(snapshotData.systemPromptTokens)} tokens
                    </Text>
                    {snapshotData.systemPrompts
                      .slice(0, 2)
                      .map((prompt, idx) => (
                        <Text
                          key={idx}
                          sx={{
                            display: 'block',
                            ml: 2,
                            mt: 1,
                            color: 'fg.muted',
                          }}
                        >
                          •{' '}
                          {prompt.length > 80
                            ? prompt.slice(0, 80) + '...'
                            : prompt}
                        </Text>
                      ))}
                  </Box>
                )}

                {/* Tool definitions */}
                {snapshotData.toolTokens > 0 && (
                  <Box sx={{ mb: 2 }}>
                    <Text sx={{ fontWeight: 'semibold' }}>
                      Tools: {formatTokens(snapshotData.toolTokens)} tokens (
                      {snapshotData.tools.length} tools)
                    </Text>
                    <Box sx={{ ml: 2, mt: 1 }}>
                      {snapshotData.tools.slice(0, 4).map((tool, idx) => (
                        <Text
                          key={idx}
                          sx={{ display: 'block', color: 'fg.muted' }}
                        >
                          • {tool.name}: {formatTokens(tool.totalTokens)}
                        </Text>
                      ))}
                      {snapshotData.tools.length > 4 && (
                        <Text sx={{ color: 'fg.muted', fontStyle: 'italic' }}>
                          ...and {snapshotData.tools.length - 4} more
                        </Text>
                      )}
                    </Box>
                  </Box>
                )}

                {/* Message breakdown */}
                {(snapshotData.userMessageTokens > 0 ||
                  snapshotData.assistantMessageTokens > 0) && (
                  <Box sx={{ mb: 2 }}>
                    <Text sx={{ fontWeight: 'semibold' }}>
                      Messages:{' '}
                      {formatTokens(
                        snapshotData.userMessageTokens +
                          snapshotData.assistantMessageTokens,
                      )}{' '}
                      tokens
                    </Text>
                    <Box sx={{ ml: 2, mt: 1 }}>
                      <Text sx={{ display: 'block', color: 'fg.muted' }}>
                        • User: {formatTokens(snapshotData.userMessageTokens)}
                      </Text>
                      <Text sx={{ display: 'block', color: 'fg.muted' }}>
                        • Assistant:{' '}
                        {formatTokens(snapshotData.assistantMessageTokens)}
                      </Text>
                      {snapshotData.toolCallTokens > 0 && (
                        <Text sx={{ display: 'block', color: 'fg.muted' }}>
                          • Tool calls:{' '}
                          {formatTokens(snapshotData.toolCallTokens)}
                        </Text>
                      )}
                    </Box>
                  </Box>
                )}
              </Box>
            )}
          </Box>
        )}

        {viewMode === 'distribution' && treemapOption && (
          <ReactECharts
            option={treemapOption}
            style={{ height: chartHeight }}
            opts={{ renderer: 'svg' }}
          />
        )}

        {viewMode === 'history' && historyChartOption && (
          <Box>
            <ReactECharts
              option={historyChartOption}
              style={{ height: chartHeight }}
              opts={{ renderer: 'svg' }}
            />
            {/* Per-request details */}
            {showDetails && snapshotData.perRequestUsage.length > 0 && (
              <Box
                sx={{
                  mt: 2,
                  maxHeight: '150px',
                  overflowY: 'auto',
                  fontSize: 0,
                }}
              >
                {snapshotData.perRequestUsage
                  .slice(-10)
                  .reverse()
                  .map((req, idx) => (
                    <Box
                      key={req.requestNum}
                      sx={{
                        display: 'flex',
                        gap: 2,
                        py: 1,
                        borderBottom: idx < 9 ? '1px solid' : 'none',
                        borderColor: 'border.muted',
                      }}
                    >
                      <Text sx={{ fontWeight: 'semibold', minWidth: 30 }}>
                        #{req.requestNum}
                      </Text>
                      <Text sx={{ color: '#3B82F6' }}>
                        ↓{formatTokens(req.inputTokens)}
                      </Text>
                      <Text sx={{ color: '#10B981' }}>
                        ↑{formatTokens(req.outputTokens)}
                      </Text>
                      {req.toolNames.length > 0 && (
                        <Text sx={{ color: 'fg.muted' }}>
                          🔧 {req.toolNames.join(', ')}
                        </Text>
                      )}
                    </Box>
                  ))}
              </Box>
            )}
          </Box>
        )}

        {viewMode === 'history' && !historyChartOption && (
          <Box sx={{ py: 3 }}>
            <Text sx={{ color: 'fg.muted', fontSize: 1 }}>No history</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}

export default ContextPanel;
