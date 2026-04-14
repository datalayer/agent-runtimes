/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { buildOtelWebSocketUrl } from '@datalayer/core/lib/otel';
import { toMetricValue } from '../hooks/useMonitoring';
import { subscribeOtelWs } from './otelWsPool';

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
    label: 'Agent messages',
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

/** Convert nanosecond OTEL timestamp to milliseconds.
 *  Also accepts ISO date strings (from normalised OtelMetric responses). */
function nanoToMs(row: Record<string, unknown>): number {
  const nanoTs = row.timestamp_unix_nano ?? row.observed_timestamp_unix_nano;
  if (typeof nanoTs === 'number' && nanoTs > 0) return nanoTs / 1_000_000;
  if (typeof nanoTs === 'string' && nanoTs.length > 0) {
    const parsed = Number(nanoTs);
    if (Number.isFinite(parsed) && parsed > 0) return parsed / 1_000_000;
  }
  // Fallback: ISO timestamp string from normalised OtelMetric
  const isoTs = row.timestamp;
  if (typeof isoTs === 'string' && isoTs.length > 0) {
    const ms = new Date(isoTs).getTime();
    if (Number.isFinite(ms) && ms > 0) return ms;
  }
  return Date.now();
}

/** Return a stable grouping key from a metric row's timestamp. */
function rowTimestampKey(row: Record<string, unknown>): string {
  const nano = row.timestamp_unix_nano;
  if (typeof nano === 'number' && nano > 0) return String(nano);
  if (typeof nano === 'string' && nano.length > 0) return nano;
  // Normalised OtelMetric: use the ISO timestamp
  const iso = row.timestamp;
  if (typeof iso === 'string' && iso.length > 0) return iso;
  return '';
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
    const ts = rowTimestampKey(row);
    if (!ts) continue;
    let group = byTimestamp.get(ts);
    if (!group) {
      group = [];
      byTimestamp.set(ts, group);
    }
    group.push(row);
  }

  const sortedGroups = [...byTimestamp.entries()].sort((a, b) => {
    const na = Number(a[0]);
    const nb = Number(b[0]);
    // Both numeric (nanosecond timestamps)
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    // ISO strings: lexicographic comparison works for ISO 8601
    return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
  });

  const turns: TurnPoint[] = [];
  let prev = initialState;

  for (const [, groupRows] of sortedGroups) {
    // Sum ALL completions rows in this group — each OTEL attribute combination
    // (e.g. baseline vs vercel-ai) produces a separate counter, and we need
    // the total across all of them to detect new turns.
    const completionsRows = groupRows.filter(
      r => r.metric_name === COMPLETIONS_METRIC,
    );
    if (completionsRows.length === 0) continue;

    const newCompletions = completionsRows.reduce(
      (sum, r) => sum + toMetricValue(r),
      0,
    );
    if (newCompletions <= prev.completions) continue;

    // Sum values per metric across all attribute sets so that baseline (0)
    // and real-protocol rows (non-zero) are combined correctly.
    const current = emptyValues();
    for (const seriesItem of SERIES) {
      const metricRows = groupRows.filter(
        r => r.metric_name === seriesItem.metric,
      );
      current[seriesItem.label] = metricRows.reduce(
        (sum, r) => sum + toMetricValue(r),
        0,
      );
    }

    turns.push({
      turnNumber: newCompletions,
      timestampMs: nanoToMs(completionsRows[0]),
      values: current,
    });

    prev = { completions: newCompletions, values: current };
  }

  return { turns, finalState: prev };
}

export interface TokenUsageChartProps {
  serviceName?: string;
  agentId?: string;
  apiKey?: string;
  runUrl?: string;
  wsRunUrl?: string;
  height?: number;
  days?: number;
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

/** Extract `agent.id` from the `attributes` field of a metric row. */
function extractAgentId(row: Record<string, unknown>): string | undefined {
  const attrs = row.attributes;
  if (typeof attrs === 'string') {
    try {
      const parsed = JSON.parse(attrs);
      if (typeof parsed === 'object' && parsed !== null) {
        const aid = parsed['agent.id'];
        if (typeof aid === 'string') return aid;
      }
    } catch {
      // ignore
    }
  } else if (typeof attrs === 'object' && attrs !== null) {
    const aid = (attrs as Record<string, unknown>)['agent.id'];
    if (typeof aid === 'string') return aid;
  }
  return undefined;
}

export function TokenUsageChart({
  serviceName,
  agentId,
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

  // ── Reset state on source switch ──────────────────────────────
  useEffect(() => {
    if (!serviceName) {
      setTurns([]);
      cumulativeRef.current = { completions: 0, values: emptyValues() };
      return;
    }
    setTurns([]);
    cumulativeRef.current = { completions: 0, values: emptyValues() };
  }, [agentId, serviceName]);

  // ── WebSocket subscription (shared connection pool) ─────────
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

    let wsUrl: string;
    try {
      wsUrl = buildOtelWebSocketUrl({
        baseUrl: baseWithProtocol,
        token: apiKey,
      });
    } catch {
      return;
    }

    const unsubscribe = subscribeOtelWs(wsUrl, msg => {
      if (msg.signal !== 'metrics') return;

      const rows = Array.isArray(msg.data) ? msg.data : [];
      let matchingRows = rows.filter(
        row => extractServiceName(row) === serviceName,
      );
      // Filter by agent.id when specified.
      if (agentId) {
        matchingRows = matchingRows.filter(
          row => extractAgentId(row) === agentId,
        );
      }
      if (matchingRows.length === 0) return;

      const { turns: newTurns, finalState } = extractTurnsFromRows(
        matchingRows,
        cumulativeRef.current,
      );

      if (newTurns.length > 0) {
        cumulativeRef.current = finalState;
        setTurns(prev => [...prev, ...newTurns]);
      }
    });

    return unsubscribe;
  }, [agentId, apiKey, runUrl, serviceName, wsRunUrl]);

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
        min: 'dataMin',
        max: 'dataMax',
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
