/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useEffect, useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { fetchOtelMetricRows, toMetricValue } from '../hooks/useMonitoring';

const SERIES = [
  {
    label: 'System prompt',
    metric: 'agent_runtimes.prompt.turn.system_prompt_tokens',
  },
  {
    label: 'Tools description',
    metric: 'agent_runtimes.prompt.turn.tools_description_tokens',
  },
  {
    label: 'User messages',
    metric: 'agent_runtimes.prompt.turn.user_message_tokens',
  },
  {
    label: 'AI messages',
    metric: 'agent_runtimes.prompt.turn.ai_message_tokens',
  },
  {
    label: 'Tools usage',
    metric: 'agent_runtimes.prompt.turn.tools_usage_tokens',
  },
] as const;

type SeriesLabel = (typeof SERIES)[number]['label'];

/** dayKey → metric label → accumulated total */
type DayData = Record<string, Record<SeriesLabel, number>>;

function emptyDay(): Record<SeriesLabel, number> {
  return SERIES.reduce(
    (acc, s) => {
      acc[s.label] = 0;
      return acc;
    },
    {} as Record<SeriesLabel, number>,
  );
}

const DEFAULT_DAYS = 7;

/** Build a fallback list of day keys for the last N days. */
function buildFallbackDays(days: number): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    result.push(d.toISOString().slice(0, 10));
  }
  return result;
}

/** Build a contiguous list of day keys between min and max (inclusive),
 *  always padding at least one day on each side so single-day data is visible. */
function fillDayRange(sortedKeys: string[]): string[] {
  if (sortedKeys.length === 0) return [];
  const start = new Date(sortedKeys[0] + 'T00:00:00');
  const end = new Date(sortedKeys[sortedKeys.length - 1] + 'T00:00:00');
  // Pad one day before and after so a single-point line/area is visible
  start.setDate(start.getDate() - 1);
  end.setDate(end.getDate() + 1);
  const filled: string[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    filled.push(d.toISOString().slice(0, 10));
  }
  return filled;
}

export interface TokenUsageChartProps {
  serviceName?: string;
  apiKey?: string;
  runUrl?: string;
  wsRunUrl?: string;
  height?: number;
  days?: number;
}

function toDayKey(row: Record<string, unknown>): string | undefined {
  // Prefer nanosecond integer timestamps (OTEL schema)
  const nanoTs = row.timestamp_unix_nano ?? row.observed_timestamp_unix_nano;
  if (typeof nanoTs === 'number' && nanoTs > 0) {
    return new Date(nanoTs / 1_000_000).toISOString().slice(0, 10);
  }
  if (typeof nanoTs === 'string' && nanoTs.length > 0) {
    const parsed = Number(nanoTs);
    if (Number.isFinite(parsed) && parsed > 0) {
      return new Date(parsed / 1_000_000).toISOString().slice(0, 10);
    }
  }
  // Fallback to ISO string timestamps
  const candidates = [
    row.timestamp,
    row.observed_timestamp,
    row.time,
    row.created_at,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length >= 10) {
      return candidate.slice(0, 10);
    }
  }
  return undefined;
}

function extractServiceName(row: Record<string, unknown>): string | undefined {
  const directCandidates = [row.service_name, row.service, row.serviceName];
  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
  }

  const resourceAttributes = row.resource_attributes;
  if (resourceAttributes && typeof resourceAttributes === 'object') {
    const nested = (resourceAttributes as Record<string, unknown>)[
      'service.name'
    ];
    if (typeof nested === 'string' && nested.length > 0) {
      return nested;
    }
  }

  return undefined;
}

export function TokenUsageChart({
  serviceName,
  apiKey,
  runUrl,
  wsRunUrl,
  height = 160,
  days = DEFAULT_DAYS,
}: TokenUsageChartProps) {
  const [dayData, setDayData] = useState<DayData>({});

  // Derive contiguous day keys and display labels from the data,
  // falling back to the last N days when there is no data yet.
  const { filledKeys, dayLabels } = useMemo(() => {
    const rawKeys = Object.keys(dayData).sort();
    const filled =
      rawKeys.length > 0 ? fillDayRange(rawKeys) : buildFallbackDays(days);
    const labels = filled.map(k =>
      new Date(k + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
    );
    return { filledKeys: filled, dayLabels: labels };
  }, [dayData, days]);

  useEffect(() => {
    if (!serviceName) {
      setDayData({});
      return;
    }

    let cancelled = false;

    const load = async () => {
      const result: DayData = {};

      await Promise.all(
        SERIES.map(async item => {
          try {
            const rows = await fetchOtelMetricRows({
              metric: item.metric,
              serviceName,
              runUrl,
              apiKey,
              limit: 500,
            });

            for (const row of rows) {
              const typedRow = row as Record<string, unknown>;
              const dayKey = toDayKey(typedRow);
              if (!dayKey) {
                continue;
              }
              if (!result[dayKey]) {
                result[dayKey] = emptyDay();
              }
              const value = toMetricValue(typedRow);
              result[dayKey][item.label] += value;
            }
          } catch {
            return;
          }
        }),
      );

      if (!cancelled) {
        setDayData(result);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [apiKey, runUrl, serviceName]);

  useEffect(() => {
    if (!serviceName || !apiKey) {
      return;
    }

    const rawBaseUrl =
      wsRunUrl ||
      runUrl ||
      (typeof window !== 'undefined' ? window.location.origin : '');

    if (!rawBaseUrl) {
      return;
    }

    let wsUrl: string;
    if (rawBaseUrl.startsWith('http://')) {
      wsUrl = `ws://${rawBaseUrl.slice(7)}`;
    } else if (rawBaseUrl.startsWith('https://')) {
      wsUrl = `wss://${rawBaseUrl.slice(8)}`;
    } else if (
      rawBaseUrl.startsWith('ws://') ||
      rawBaseUrl.startsWith('wss://')
    ) {
      wsUrl = rawBaseUrl;
    } else {
      const proto =
        typeof window !== 'undefined' && window.location.protocol === 'https:'
          ? 'wss:'
          : 'ws:';
      wsUrl = `${proto}//${typeof window !== 'undefined' ? window.location.host : ''}${rawBaseUrl}`;
    }

    wsUrl = `${wsUrl.replace(/\/$/, '')}/api/otel/v1/ws?token=${encodeURIComponent(apiKey)}`;

    const ws = new WebSocket(wsUrl);
    ws.onmessage = event => {
      try {
        const msg = JSON.parse(event.data) as {
          signal?: string;
          data?: Array<Record<string, unknown>>;
        };
        if (msg.signal !== 'metrics') {
          return;
        }
        const rows = Array.isArray(msg.data) ? msg.data : [];
        const matchingRows = rows.filter(
          row => extractServiceName(row) === serviceName,
        );
        if (matchingRows.length === 0) {
          return;
        }
        // Update chart directly from WS data (bypasses HTTP fetch which
        // may fail due to CORS when the UI runs on a different origin).
        setDayData(prev => {
          const updated = { ...prev };
          for (const row of matchingRows) {
            const metricName = row.metric_name as string;
            const seriesItem = SERIES.find(s => s.metric === metricName);
            if (!seriesItem) {
              continue;
            }
            const dayKey = toDayKey(row);
            if (!dayKey) {
              continue;
            }
            if (!updated[dayKey]) {
              updated[dayKey] = emptyDay();
            } else {
              // Clone to avoid mutating prev
              updated[dayKey] = { ...updated[dayKey] };
            }
            const value = toMetricValue(row);
            updated[dayKey][seriesItem.label] += value;
          }
          return updated;
        });
      } catch {
        return;
      }
    };

    return () => {
      ws.close();
    };
  }, [apiKey, runUrl, serviceName, wsRunUrl]);

  const option = useMemo(
    () => ({
      tooltip: {
        trigger: 'axis',
        textStyle: { fontSize: 10 },
        confine: true,
      },
      legend: {
        data: SERIES.map(item => item.label),
        top: 0,
        textStyle: { fontSize: 9 },
        itemWidth: 10,
        itemHeight: 8,
        itemGap: 6,
      },
      grid: {
        left: 30,
        right: 8,
        top: 24,
        bottom: 18,
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: dayLabels,
        axisLabel: { fontSize: 9 },
        axisLine: { lineStyle: { color: '#d0d7de' } },
      },
      yAxis: SERIES.map((_, index) => ({
        type: 'value',
        scale: true,
        show: false,
        splitLine: {
          show: index === 0,
          lineStyle: { color: '#f0f0f0' },
        },
      })),
      series: SERIES.map((item, index) => ({
        name: item.label,
        type: 'line',
        yAxisIndex: index,
        data: filledKeys.map(k => dayData[k]?.[item.label] ?? 0),
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: { width: 1.5 },
      })),
      color: ['#2da44e', '#0969da', '#8250df', '#bf8700', '#cf222e'],
    }),
    [dayLabels, filledKeys, dayData],
  );

  return (
    <ReactECharts
      option={option}
      style={{ height, width: '100%' }}
      opts={{ renderer: 'canvas' }}
      notMerge
      lazyUpdate
    />
  );
}

export default TokenUsageChart;
