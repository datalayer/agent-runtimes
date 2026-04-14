/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { buildOtelWebSocketUrl } from '@datalayer/core/lib/otel';
import { toMetricValue } from '../hooks/useMonitoring';
import { subscribeOtelWs } from './otelWsPool';
import {
  agentRuntimeStore,
  getMonitoringCacheKey,
  useAgentRuntimeStore,
  type LocalCostPoint,
  type MonitoringCacheEntry,
} from '../stores/agentRuntimeStore';

const COST_RUN_METRIC = 'agent_runtimes.capability.cost.run.usd';
const COST_CUMULATIVE_METRIC = 'agent_runtimes.capability.cost.cumulative.usd';

/** A single cost data point representing one agent turn. */
interface CostPoint {
  timestampKey: string;
  timestampMs: number;
  costUsd: number;
  cumulativeUsd: number;
}

function resolveMonitoringEntry(
  monitoringCache: Record<string, MonitoringCacheEntry>,
  serviceName?: string,
  agentId?: string,
): MonitoringCacheEntry | undefined {
  const direct = monitoringCache[getMonitoringCacheKey(serviceName, agentId)];
  if (direct) return direct;

  if (agentId) {
    const byAgent = Object.entries(monitoringCache).find(([key, entry]) => {
      return key.endsWith(`::${agentId}`) && entry.costPoints.length > 0;
    });
    if (byAgent) return byAgent[1];
  }

  if (serviceName) {
    const byService = Object.entries(monitoringCache).find(([key, entry]) => {
      return key.startsWith(`${serviceName}::`) && entry.costPoints.length > 0;
    });
    if (byService) return byService[1];
  }

  return undefined;
}

function localPointToCostPoint(point: LocalCostPoint): CostPoint {
  return {
    timestampKey: String(point.timestampMs),
    timestampMs: point.timestampMs,
    costUsd: 0,
    cumulativeUsd: point.cumulativeUsd,
  };
}

/** Parse attributes that may arrive as a JSON string (WS) or object (HTTP). */
function parseAttributes(attrs: unknown): Record<string, unknown> {
  if (attrs && typeof attrs === 'object' && !Array.isArray(attrs)) {
    return attrs as Record<string, unknown>;
  }
  if (typeof attrs === 'string') {
    try {
      return JSON.parse(attrs) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

/** Convert metric row timestamp to milliseconds. */
function rowTimestampMs(row: Record<string, unknown>): number {
  const nanoTs = row.timestamp_unix_nano ?? row.observed_timestamp_unix_nano;
  if (typeof nanoTs === 'number' && nanoTs > 0) return nanoTs / 1_000_000;
  if (typeof nanoTs === 'string' && nanoTs.length > 0) {
    const parsed = Number(nanoTs);
    if (Number.isFinite(parsed) && parsed > 0) return parsed / 1_000_000;
  }
  const isoTs = row.timestamp;
  if (typeof isoTs === 'string' && isoTs.length > 0) {
    const ms = new Date(isoTs).getTime();
    if (Number.isFinite(ms) && ms > 0) return ms;
  }
  return Date.now();
}

function rowTimestampKey(row: Record<string, unknown>): string {
  const nano = row.timestamp_unix_nano;
  if (typeof nano === 'number' && nano > 0) return String(nano);
  if (typeof nano === 'string' && nano.length > 0) return nano;
  const iso = row.timestamp;
  if (typeof iso === 'string' && iso.length > 0) return iso;
  return '';
}

/** Extract cost points from cost metrics rows. */
function extractCostPoints(
  rows: Array<Record<string, unknown>>,
  agentId?: string,
): CostPoint[] {
  let filtered = rows.filter(row => {
    const metricName = row.metric_name;
    return (
      metricName === COST_CUMULATIVE_METRIC || metricName === COST_RUN_METRIC
    );
  });

  if (agentId) {
    filtered = filtered.filter(row => extractAgentId(row) === agentId);
  }

  const byTimestamp = new Map<string, Array<Record<string, unknown>>>();
  for (const row of filtered) {
    const ts = rowTimestampKey(row);
    if (!ts) continue;
    const group = byTimestamp.get(ts) ?? [];
    group.push(row);
    byTimestamp.set(ts, group);
  }

  const points: CostPoint[] = [];
  const sorted = [...byTimestamp.entries()].sort((a, b) => {
    const na = Number(a[0]);
    const nb = Number(b[0]);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
  });

  for (const [, groupRows] of sorted) {
    const cumulativeRows = groupRows.filter(
      r => r.metric_name === COST_CUMULATIVE_METRIC,
    );
    if (cumulativeRows.length === 0) continue;
    const runRows = groupRows.filter(r => r.metric_name === COST_RUN_METRIC);

    // Cumulative metric values represent the running total. Repeated snapshot
    // rows for the same timestamp should not be summed; keep the highest value.
    const cumulativeUsd = cumulativeRows.reduce(
      (max, row) => Math.max(max, toMetricValue(row)),
      0,
    );
    const costUsd = runRows.reduce((sum, row) => sum + toMetricValue(row), 0);

    if (!Number.isFinite(cumulativeUsd) || !Number.isFinite(costUsd)) continue;

    const timestampKey = rowTimestampKey(cumulativeRows[0]);
    if (!timestampKey) continue;

    points.push({
      timestampKey,
      timestampMs: rowTimestampMs(cumulativeRows[0]),
      costUsd,
      cumulativeUsd,
    });
  }

  points.sort((a, b) => a.timestampMs - b.timestampMs);
  return points;
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

/** Extract `agent.id` from span/trace attributes. */
function extractAgentId(row: Record<string, unknown>): string | undefined {
  const attrs = parseAttributes(row.attributes);
  const aid = attrs['agent.id'];
  if (typeof aid === 'string') return aid;
  return undefined;
}

export interface CostUsageChartProps {
  serviceName?: string;
  agentId?: string;
  apiKey?: string;
  runUrl?: string;
  wsRunUrl?: string;
  liveCumulativeUsd?: number;
  liveTimestampMs?: number | null;
  height?: number;
}

export function CostUsageChart({
  serviceName,
  agentId,
  apiKey,
  runUrl,
  wsRunUrl,
  liveCumulativeUsd,
  liveTimestampMs,
  height = 160,
}: CostUsageChartProps) {
  const monitoringCache = useAgentRuntimeStore(s => s.monitoringCache);
  const mergeCostPoints = useAgentRuntimeStore(s => s.mergeCostPoints);
  const upsertLocalCostPoint = useAgentRuntimeStore(
    s => s.upsertLocalCostPoint,
  );

  const cachedEntry = useMemo(
    () => resolveMonitoringEntry(monitoringCache, serviceName, agentId),
    [agentId, monitoringCache, serviceName],
  );
  const [points, setPoints] = useState<CostPoint[]>([]);
  const initialTimestampMsRef = useRef<number>(Date.now());

  const mergePoints = (
    existing: CostPoint[],
    incoming: CostPoint[],
  ): CostPoint[] => {
    const byTimestamp = new Map<string, CostPoint>();

    for (const point of existing) {
      byTimestamp.set(point.timestampKey, point);
    }

    for (const point of incoming) {
      const prev = byTimestamp.get(point.timestampKey);
      if (!prev) {
        byTimestamp.set(point.timestampKey, point);
        continue;
      }
      byTimestamp.set(point.timestampKey, {
        ...prev,
        timestampMs: Math.max(prev.timestampMs, point.timestampMs),
        costUsd: Math.max(prev.costUsd, point.costUsd),
        cumulativeUsd: Math.max(prev.cumulativeUsd, point.cumulativeUsd),
      });
    }

    const merged = Array.from(byTimestamp.values()).sort(
      (a, b) => a.timestampMs - b.timestampMs,
    );

    // Cumulative cost should never decrease; guard against out-of-order or
    // duplicate snapshots by enforcing a monotonic series.
    let runningMax = 0;
    return merged.map(point => {
      runningMax = Math.max(runningMax, point.cumulativeUsd);
      return {
        ...point,
        cumulativeUsd: runningMax,
      };
    });
  };

  // ── Reset state on source switch ──────────────────────────────
  useEffect(() => {
    if (!serviceName) {
      setPoints([]);
      return;
    }
    setPoints((cachedEntry?.costPoints ?? []).map(localPointToCostPoint));
    initialTimestampMsRef.current = Date.now();
  }, [agentId, cachedEntry, serviceName]);

  // Apply immediate post-turn updates from the monitoring websocket snapshot.
  useEffect(() => {
    if (!serviceName) return;
    if (
      typeof liveCumulativeUsd !== 'number' ||
      !Number.isFinite(liveCumulativeUsd)
    ) {
      return;
    }

    const timestampMs =
      typeof liveTimestampMs === 'number' && Number.isFinite(liveTimestampMs)
        ? liveTimestampMs
        : Date.now();

    const livePoint: CostPoint = {
      timestampKey: `live-${timestampMs}`,
      timestampMs,
      costUsd: 0,
      cumulativeUsd: Math.max(0, liveCumulativeUsd),
    };

    upsertLocalCostPoint({
      serviceName,
      agentId,
      timestampMs,
      cumulativeUsd: livePoint.cumulativeUsd,
    });

    const mergedEntry = resolveMonitoringEntry(
      agentRuntimeStore.getState().monitoringCache,
      serviceName,
      agentId,
    );
    if (mergedEntry) {
      setPoints(mergedEntry.costPoints.map(localPointToCostPoint));
    } else {
      setPoints(prev => mergePoints(prev, [livePoint]));
    }
  }, [
    agentId,
    liveCumulativeUsd,
    liveTimestampMs,
    serviceName,
    upsertLocalCostPoint,
  ]);

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

      const newPoints = extractCostPoints(matchingRows, agentId);
      if (newPoints.length > 0) {
        mergeCostPoints({
          serviceName,
          agentId,
          points: newPoints.map(point => ({
            timestampMs: point.timestampMs,
            cumulativeUsd: point.cumulativeUsd,
          })),
        });

        const mergedEntry = resolveMonitoringEntry(
          agentRuntimeStore.getState().monitoringCache,
          serviceName,
          agentId,
        );
        if (mergedEntry) {
          setPoints(mergedEntry.costPoints.map(localPointToCostPoint));
        } else {
          setPoints(prev => mergePoints(prev, newPoints));
        }
      }
    });

    return unsubscribe;
  }, [agentId, apiKey, mergeCostPoints, runUrl, serviceName, wsRunUrl]);

  // ── Chart options ─────────────────────────────────────────────
  const option = useMemo(() => {
    const chartData =
      points.length > 0
        ? [
            [points[0].timestampMs, 0],
            ...points.map(p => [p.timestampMs, p.cumulativeUsd]),
          ]
        : [[initialTimestampMsRef.current, 0]];

    return {
      animation: false,
      animationDuration: 0,
      animationDurationUpdate: 0,
      tooltip: {
        trigger: 'axis' as const,
        textStyle: { fontSize: 10 },
        confine: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (params: any[]) => {
          if (!Array.isArray(params) || params.length === 0) return '';
          const lines = params.map(
            (p: {
              marker: string;
              seriesName: string;
              value: [number, number];
            }) => `${p.marker} ${p.seriesName}: $${p.value[1].toFixed(6)}`,
          );
          return lines.join('<br/>');
        },
      },
      legend: {
        data: ['Cumulative cost'],
        top: 0,
        textStyle: { fontSize: 9 },
        itemWidth: 10,
        itemHeight: 8,
        itemGap: 6,
      },
      grid: {
        left: 50,
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
        min: 0,
        axisLabel: {
          fontSize: 9,
          formatter: (v: number) => `$${v.toFixed(4)}`,
        },
        splitLine: {
          show: true,
          lineStyle: { color: '#f0f0f0' },
        },
      },
      series: [
        {
          name: 'Cumulative cost',
          type: 'line' as const,
          smooth: false,
          lineStyle: { width: 2 },
          areaStyle: { opacity: 0.15 },
          symbol: 'circle',
          symbolSize: 4,
          itemStyle: { color: '#cf222e' },
          data: chartData,
          animation: false,
        },
      ],
    };
  }, [points]);

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

export default CostUsageChart;
