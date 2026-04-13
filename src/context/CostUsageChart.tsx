/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useEffect, useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { createOtelClient } from '@datalayer/core/lib/otel';

const COST_OPERATION = 'agent_runtimes.capability.cost.run';

/** A single cost data point representing one agent turn. */
interface CostPoint {
  timestampMs: number;
  costUsd: number;
  cumulativeUsd: number;
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

/** Convert nanosecond timestamp to milliseconds. */
function nanoToMs(nano: unknown): number {
  if (typeof nano === 'number' && nano > 0) return nano / 1_000_000;
  if (typeof nano === 'string' && nano.length > 0) {
    const parsed = Number(nano);
    if (Number.isFinite(parsed) && parsed > 0) return parsed / 1_000_000;
  }
  return Date.now();
}

/** Extract cost points from an array of trace/span objects. */
function extractCostPoints(spans: Array<Record<string, unknown>>): CostPoint[] {
  const points: CostPoint[] = [];

  for (const span of spans) {
    const opName =
      span.operation_name ?? span.span_name ?? span.operationName ?? '';
    if (opName !== COST_OPERATION) continue;

    const attrs = parseAttributes(span.attributes);
    const costUsd = Number(attrs['gen_ai.usage.cost_usd'] ?? 0);
    const cumulativeUsd = Number(attrs['agent.cost.cumulative_usd'] ?? 0);

    if (costUsd <= 0 && cumulativeUsd <= 0) continue;

    const ts =
      span.start_time_unix_nano ??
      span.timestamp_unix_nano ??
      span.startTimeUnixNano;
    const timestampMs = nanoToMs(ts);

    points.push({ timestampMs, costUsd, cumulativeUsd });
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

export interface CostUsageChartProps {
  serviceName?: string;
  apiKey?: string;
  runUrl?: string;
  wsRunUrl?: string;
  height?: number;
}

export function CostUsageChart({
  serviceName,
  apiKey,
  runUrl,
  wsRunUrl,
  height = 160,
}: CostUsageChartProps) {
  const [points, setPoints] = useState<CostPoint[]>([]);

  // ── Initial HTTP fetch ────────────────────────────────────────
  useEffect(() => {
    if (!serviceName) {
      setPoints([]);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const client = createOtelClient({
          token: apiKey,
          ...(runUrl ? { baseUrl: runUrl } : {}),
        });
        const { data: spans } = await client.fetchTraces({
          serviceName,
          limit: 500,
        });

        if (cancelled) return;

        const extracted = extractCostPoints(
          spans as unknown as Array<Record<string, unknown>>,
        );
        setPoints(extracted);
      } catch {
        return;
      }
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

      ws.onmessage = event => {
        try {
          const msg = JSON.parse(event.data) as {
            signal?: string;
            data?: Array<Record<string, unknown>>;
          };
          if (msg.signal !== 'traces') return;

          const rows = Array.isArray(msg.data) ? msg.data : [];
          const matchingRows = rows.filter(
            row => extractServiceName(row) === serviceName,
          );
          if (matchingRows.length === 0) return;

          const newPoints = extractCostPoints(matchingRows);
          if (newPoints.length > 0) {
            setPoints(prev => {
              const merged = [...prev, ...newPoints];
              merged.sort((a, b) => a.timestampMs - b.timestampMs);
              // Deduplicate by timestamp to avoid duplicate points on reconnect
              const seen = new Set<number>();
              return merged.filter(p => {
                if (seen.has(p.timestampMs)) return false;
                seen.add(p.timestampMs);
                return true;
              });
            });
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
        axisLabel: { fontSize: 9 },
        axisLine: { lineStyle: { color: '#d0d7de' } },
      },
      yAxis: {
        type: 'value' as const,
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
          smooth: true,
          lineStyle: { width: 2 },
          areaStyle: { opacity: 0.15 },
          symbol: 'circle',
          symbolSize: 4,
          itemStyle: { color: '#cf222e' },
          data: points.map(p => [p.timestampMs, p.cumulativeUsd]),
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
