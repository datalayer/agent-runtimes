/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
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

/** Per-turn data point with cumulative token values. */
type TurnPoint = {
  turnNumber: number;
  timestampMs: number;
  values: Record<SeriesLabel, number>;
};

/** Snapshot of cumulative OTEL counter values after a given turn. */
type CumulativeSnapshot = {
  completions: number;
  values: Record<SeriesLabel, number>;
};

function emptyValues(): Record<SeriesLabel, number> {
  return SERIES.reduce(
    (acc, s) => {
      acc[s.label] = 0;
      return acc;
    },
    {} as Record<SeriesLabel, number>,
  );
}

const COMPLETIONS_METRIC = 'agent_runtimes.prompt.turn.completions';

/** Convert nanosecond OTEL timestamp to milliseconds. */
function nanoToMs(row: Record<string, unknown>): number {
  const nanoTs = row.timestamp_unix_nano ?? row.observed_timestamp_unix_nano;
  if (typeof nanoTs === 'number' && nanoTs > 0) return nanoTs / 1_000_000;
  if (typeof nanoTs === 'string' && nanoTs.length > 0) {
    const parsed = Number(nanoTs);
    if (Number.isFinite(parsed) && parsed > 0) return parsed / 1_000_000;
  }
  return Date.now();
}

/**
 * Group metric rows by timestamp, sort chronologically,
 * and extract cumulative values by watching the completions counter.
 */
function extractTurnsFromRows(
  rows: Array<Record<string, unknown>>,
  initialState: CumulativeSnapshot,
): { turns: TurnPoint[]; finalState: CumulativeSnapshot } {
  const byTimestamp = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const ts = String(row.timestamp_unix_nano ?? '');
    if (!ts) continue;
    let group = byTimestamp.get(ts);
    if (!group) {
      group = [];
      byTimestamp.set(ts, group);
    }
    group.push(row);
  }

  const sortedGroups = [...byTimestamp.entries()].sort(
    (a, b) => Number(a[0]) - Number(b[0]),
  );

  const turns: TurnPoint[] = [];
  let prev = initialState;

  for (const [, groupRows] of sortedGroups) {
    const completionsRow = groupRows.find(
      r => r.metric_name === COMPLETIONS_METRIC,
    );
    if (!completionsRow) continue;

    const newCompletions = toMetricValue(completionsRow);
    if (newCompletions <= prev.completions) continue;

    const current = emptyValues();
    for (const row of groupRows) {
      const metricName = row.metric_name as string;
      const seriesItem = SERIES.find(s => s.metric === metricName);
      if (seriesItem) {
        current[seriesItem.label] = toMetricValue(row);
      }
    }

    turns.push({
      turnNumber: newCompletions,
      timestampMs: nanoToMs(completionsRow),
      values: current,
    });

    prev = { completions: newCompletions, values: current };
  }

  return { turns, finalState: prev };
}

export interface TokenUsageChartProps {
  serviceName?: string;
  apiKey?: string;
  runUrl?: string;
  wsRunUrl?: string;
  height?: number;
  days?: number;
}

function buildOtelWsUrl(base: string, token: string): string | null {
  try {
    const normalized =
      base.startsWith('ws://') || base.startsWith('wss://')
        ? base.replace(/^ws/, 'http')
        : base;
    const url = new URL(normalized);
    const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const pathname = url.pathname.replace(/\/$/, '');
    const hasApiPrefix =
      pathname.endsWith('/api/otel/v1') || pathname.includes('/api/otel/v1/');

    url.protocol = wsProtocol;
    url.pathname = hasApiPrefix ? `${pathname}/ws` : '/api/otel/v1/ws';
    url.search = '';
    url.searchParams.set('token', token);
    return url.toString();
  } catch {
    return null;
  }
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
}: TokenUsageChartProps) {
  const [turns, setTurns] = useState<TurnPoint[]>([]);
  const cumulativeRef = useRef<CumulativeSnapshot>({
    completions: 0,
    values: emptyValues(),
  });

  // ── Initial HTTP fetch ────────────────────────────────────────
  useEffect(() => {
    if (!serviceName) {
      setTurns([]);
      cumulativeRef.current = { completions: 0, values: emptyValues() };
      return;
    }

    let cancelled = false;

    const load = async () => {
      const allRows: Array<Record<string, unknown>> = [];
      const metricsToFetch = [COMPLETIONS_METRIC, ...SERIES.map(s => s.metric)];

      await Promise.all(
        metricsToFetch.map(async metric => {
          try {
            const rows = await fetchOtelMetricRows({
              metric,
              serviceName,
              runUrl,
              apiKey,
              limit: 500,
            });
            for (const row of rows) {
              allRows.push(row as Record<string, unknown>);
            }
          } catch {
            return;
          }
        }),
      );

      if (cancelled) return;

      const { turns: extracted, finalState } = extractTurnsFromRows(allRows, {
        completions: 0,
        values: emptyValues(),
      });
      cumulativeRef.current = finalState;
      setTurns(extracted);
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [apiKey, runUrl, serviceName]);

  // ── WebSocket subscription ────────────────────────────────────
  useEffect(() => {
    if (!serviceName || !apiKey) return;

    const rawBaseUrl =
      wsRunUrl ||
      runUrl ||
      (typeof window !== 'undefined' ? window.location.origin : '');
    if (!rawBaseUrl) return;

    const baseWithProtocol =
      rawBaseUrl.startsWith('http://') ||
      rawBaseUrl.startsWith('https://') ||
      rawBaseUrl.startsWith('ws://') ||
      rawBaseUrl.startsWith('wss://')
        ? rawBaseUrl
        : `${
            typeof window !== 'undefined' &&
            window.location.protocol === 'https:'
              ? 'https:'
              : 'http:'
          }//${typeof window !== 'undefined' ? window.location.host : ''}${rawBaseUrl}`;

    const wsUrl = buildOtelWsUrl(baseWithProtocol, apiKey);
    if (!wsUrl) return;

    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let ws: WebSocket | null = null;

    const connect = () => {
      if (disposed) return;

      ws = new WebSocket(wsUrl);

      ws.onopen = () => {};

      ws.onmessage = event => {
        try {
          const msg = JSON.parse(event.data) as {
            signal?: string;
            data?: Array<Record<string, unknown>>;
          };
          if (msg.signal !== 'metrics') return;

          const rows = Array.isArray(msg.data) ? msg.data : [];
          const matchingRows = rows.filter(
            row => extractServiceName(row) === serviceName,
          );
          if (matchingRows.length === 0) return;

          const { turns: newTurns, finalState } = extractTurnsFromRows(
            matchingRows,
            cumulativeRef.current,
          );

          if (newTurns.length > 0) {
            cumulativeRef.current = finalState;
            setTurns(prev => [...prev, ...newTurns]);
          }
        } catch {
          return;
        }
      };

      ws.onerror = () => {};

      ws.onclose = () => {
        if (disposed) return;
        reconnectTimer = setTimeout(connect, 2000);
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      ws?.close();
    };
  }, [apiKey, runUrl, serviceName, wsRunUrl]);

  // ── Chart options ─────────────────────────────────────────────
  const option = useMemo(() => {
    return {
      tooltip: {
        trigger: 'axis' as const,
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
        left: 45,
        right: 15,
        top: 24,
        bottom: 20,
      },
      xAxis: {
        type: 'time' as const,
        axisLabel: { fontSize: 9 },
        axisLine: { lineStyle: { color: '#d0d7de' } },
      },
      yAxis: {
        type: 'value' as const,
        axisLabel: {
          fontSize: 9,
          formatter: (v: number) => {
            if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
            return String(v);
          },
        },
        splitLine: {
          show: true,
          lineStyle: { color: '#f0f0f0' },
        },
      },
      series: SERIES.map(item => ({
        name: item.label,
        type: 'line' as const,
        smooth: true,
        lineStyle: { width: 2 },
        areaStyle: { opacity: 0.15 },
        symbol: 'circle',
        symbolSize: 4,
        data: turns.map(t => [t.timestampMs, t.values[item.label]]),
      })),
      color: ['#2da44e', '#0969da', '#8250df', '#bf8700', '#cf222e'],
    };
  }, [turns]);

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
