/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useEffect, useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';

const DEFAULT_DAYS = 7;

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

export interface OtelTokenUsageChartProps {
  serviceName?: string;
  apiKey?: string;
  runUrl?: string;
  wsRunUrl?: string;
  height?: number;
  days?: number;
}

function buildDays(days: number): { keys: string[]; labels: string[] } {
  const keys: string[] = [];
  const labels: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    keys.push(date.toISOString().slice(0, 10));
    labels.push(date.toLocaleDateString('en-US', { weekday: 'short' }));
  }
  return { keys, labels };
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toTimestamp(row: Record<string, unknown>): string | undefined {
  const candidates = [
    row.timestamp,
    row.observed_timestamp,
    row.time,
    row.created_at,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
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

export function OtelTokenUsageChart({
  serviceName,
  apiKey,
  runUrl,
  wsRunUrl,
  height = 160,
  days = DEFAULT_DAYS,
}: OtelTokenUsageChartProps) {
  const { keys, labels } = useMemo(() => buildDays(days), [days]);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const [seriesData, setSeriesData] = useState<Record<SeriesLabel, number[]>>(
    () =>
      SERIES.reduce(
        (acc, item) => {
          acc[item.label] = Array.from({ length: days }, () => 0);
          return acc;
        },
        {} as Record<SeriesLabel, number[]>,
      ),
  );

  useEffect(() => {
    if (!serviceName) {
      setSeriesData(
        SERIES.reduce(
          (acc, item) => {
            acc[item.label] = Array.from({ length: days }, () => 0);
            return acc;
          },
          {} as Record<SeriesLabel, number[]>,
        ),
      );
      return;
    }

    let cancelled = false;

    const baseUrl = (
      runUrl ||
      (typeof window !== 'undefined' ? window.location.origin : '') ||
      ''
    ).replace(/\/$/, '');

    const headers: HeadersInit = {};
    if (apiKey && apiKey.trim().length > 0) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const load = async () => {
      const result = SERIES.reduce(
        (acc, item) => {
          acc[item.label] = Array.from({ length: days }, () => 0);
          return acc;
        },
        {} as Record<SeriesLabel, number[]>,
      );

      await Promise.all(
        SERIES.map(async item => {
          try {
            const query = new URLSearchParams({
              name: item.metric,
              service_name: serviceName,
              limit: '500',
            });
            const response = await fetch(
              `${baseUrl}/api/otel/v1/metrics/query/?${query.toString()}`,
              {
                headers,
              },
            );
            if (!response.ok) {
              return;
            }
            const payload = await response.json();
            const rows = Array.isArray(payload?.data)
              ? payload.data
              : Array.isArray(payload)
                ? payload
                : [];

            for (const row of rows) {
              const typedRow = row as Record<string, unknown>;
              const ts = toTimestamp(typedRow);
              if (!ts) {
                continue;
              }
              const dayKey = ts.slice(0, 10);
              const idx = keys.indexOf(dayKey);
              if (idx < 0) {
                continue;
              }
              const value = toNumber(typedRow.value);
              result[item.label][idx] += value;
            }
          } catch {
            return;
          }
        }),
      );

      if (!cancelled) {
        setSeriesData(result);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [apiKey, days, keys, refreshVersion, runUrl, serviceName]);

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
        const hasMatchingService = rows.some(row => {
          const service = extractServiceName(row);
          return service === serviceName;
        });
        if (hasMatchingService) {
          setRefreshVersion(v => v + 1);
        }
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
        data: labels,
        axisLabel: { fontSize: 9 },
        axisLine: { lineStyle: { color: '#d0d7de' } },
      },
      yAxis: {
        type: 'value',
        axisLabel: { fontSize: 9 },
        splitLine: { lineStyle: { color: '#f0f0f0' } },
      },
      series: SERIES.map(item => ({
        name: item.label,
        type: 'line',
        stack: 'tokens',
        data: seriesData[item.label],
        areaStyle: {},
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 1.5 },
      })),
      color: ['#2da44e', '#0969da', '#8250df', '#bf8700', '#cf222e'],
    }),
    [labels, seriesData],
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

export default OtelTokenUsageChart;
