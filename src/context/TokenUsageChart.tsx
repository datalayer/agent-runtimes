/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { buildOtelWebSocketUrl } from '@datalayer/core/lib/otel';
import { toMetricValue } from '../hooks/useMonitoring';
import { fetchOtelMetricRows } from '../hooks/useMonitoring';
import { subscribeOtelWs } from './otelWsPool';
import {
  agentRuntimeStore,
  getMonitoringCacheKey,
  useAgentRuntimeStore,
  type LocalTokenTurn,
  type MonitoringCacheEntry,
} from '../stores/agentRuntimeStore';

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

function resolveMonitoringEntry(
  monitoringCache: Record<string, MonitoringCacheEntry>,
  serviceName?: string,
  agentId?: string,
): MonitoringCacheEntry | undefined {
  const direct = monitoringCache[getMonitoringCacheKey(serviceName, agentId)];
  if (direct) return direct;

  if (agentId) {
    const byAgent = Object.entries(monitoringCache).find(([key, entry]) => {
      return key.endsWith(`::${agentId}`) && entry.tokenTurns.length > 0;
    });
    if (byAgent) return byAgent[1];
  }

  if (serviceName) {
    const byService = Object.entries(monitoringCache).find(([key, entry]) => {
      return key.startsWith(`${serviceName}::`) && entry.tokenTurns.length > 0;
    });
    if (byService) return byService[1];
  }

  return undefined;
}

function localTokenTurnToPoint(turn: LocalTokenTurn): TurnPoint {
  return {
    turnNumber: turn.turnNumber,
    timestampMs: turn.timestampMs,
    values: {
      'System prompt': turn.systemPromptTokens,
      'Tools description': turn.toolsDescriptionTokens,
      'User messages': turn.userMessageTokens,
      'Agent messages': turn.aiMessageTokens,
      'Tools usage': turn.toolsUsageTokens,
    },
  };
}

function pointToLocalTokenTurn(point: TurnPoint): LocalTokenTurn {
  return {
    turnNumber: point.turnNumber,
    timestampMs: point.timestampMs,
    systemPromptTokens: point.values['System prompt'],
    toolsDescriptionTokens: point.values['Tools description'],
    userMessageTokens: point.values['User messages'],
    aiMessageTokens: point.values['Agent messages'],
    toolsUsageTokens: point.values['Tools usage'],
    totalTokens:
      point.values['System prompt'] +
      point.values['Tools description'] +
      point.values['User messages'] +
      point.values['Agent messages'] +
      point.values['Tools usage'],
  };
}

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
  runtimeId?: string;
  apiKey?: string;
  otelUrl?: string;
  wsUrl?: string;
  liveSystemPromptTokens?: number;
  liveToolsDescriptionTokens?: number;
  liveUserMessageTokens?: number;
  liveAgentMessageTokens?: number;
  liveToolsUsageTokens?: number;
  liveTimestampMs?: number | null;
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

  const resourceAttributes = parseResourceAttributes(row.resource_attributes);
  if (resourceAttributes && typeof resourceAttributes === 'object') {
    const nested = resourceAttributes['service.name'];
    if (typeof nested === 'string' && nested.length > 0) {
      return nested;
    }
  }

  return undefined;
}

function parseAttributes(attrs: unknown): Record<string, unknown> {
  if (attrs && typeof attrs === 'object' && !Array.isArray(attrs)) {
    return attrs as Record<string, unknown>;
  }
  if (typeof attrs === 'string') {
    try {
      const parsed = JSON.parse(attrs);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Ignore malformed attributes payloads.
    }
  }
  return {};
}

function parseResourceAttributes(attrs: unknown): Record<string, unknown> {
  if (attrs && typeof attrs === 'object' && !Array.isArray(attrs)) {
    return attrs as Record<string, unknown>;
  }
  if (typeof attrs === 'string') {
    try {
      const parsed = JSON.parse(attrs);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Ignore malformed resource attributes payloads.
    }
  }
  return {};
}

function extractRuntimeId(row: Record<string, unknown>): string | undefined {
  const directCandidates = [
    row.runtime_id,
    row.runtime,
    row.runtime_name,
    row.k8s_runtime_name,
  ];
  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  const attrs = parseAttributes(row.attributes);
  const attrCandidates = [
    attrs['runtime.id'],
    attrs['runtime.runtime_name'],
    attrs['k8s.pod.name'],
  ];
  for (const candidate of attrCandidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  const resourceAttributes = parseResourceAttributes(row.resource_attributes);
  const resourceCandidates = [
    resourceAttributes['runtime.id'],
    resourceAttributes['runtime.runtime_name'],
    resourceAttributes['k8s.pod.name'],
  ];
  for (const candidate of resourceCandidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return undefined;
}

function rowMatchesSource(
  row: Record<string, unknown>,
  serviceName?: string,
  runtimeId?: string,
): boolean {
  const resolvedServiceName = String(serviceName || '').trim();
  const resolvedRuntimeId = String(runtimeId || '').trim();
  if (!resolvedServiceName && !resolvedRuntimeId) {
    return true;
  }

  const serviceMatches =
    resolvedServiceName.length > 0 &&
    extractServiceName(row) === resolvedServiceName;
  const runtimeMatches =
    resolvedRuntimeId.length > 0 && extractRuntimeId(row) === resolvedRuntimeId;
  return serviceMatches || runtimeMatches;
}

/** Extract `agent.id` from the `attributes` field of a metric row. */
function extractAgentId(row: Record<string, unknown>): string | undefined {
  const parsed = parseAttributes(row.attributes);
  const aid = parsed['agent.id'];
  if (typeof aid === 'string') return aid;
  return undefined;
}

export function TokenUsageChart({
  serviceName,
  agentId,
  runtimeId,
  apiKey,
  otelUrl,
  wsUrl,
  liveSystemPromptTokens,
  liveToolsDescriptionTokens,
  liveUserMessageTokens,
  liveAgentMessageTokens,
  liveToolsUsageTokens,
  liveTimestampMs,
  height = 160,
}: TokenUsageChartProps) {
  const cacheServiceKey =
    String(serviceName || runtimeId || '').trim() || undefined;
  const monitoringCache = useAgentRuntimeStore(s => s.monitoringCache);
  const mergeTokenTurns = useAgentRuntimeStore(s => s.mergeTokenTurns);
  const appendLocalTokenTurnFull = useAgentRuntimeStore(
    s => s.appendLocalTokenTurnFull,
  );

  const cachedEntry = useMemo(
    () => resolveMonitoringEntry(monitoringCache, cacheServiceKey, agentId),
    [agentId, cacheServiceKey, monitoringCache],
  );
  const [turns, setTurns] = useState<TurnPoint[]>([]);
  const initialTimestampMsRef = useRef<number>(Date.now());
  const cumulativeRef = useRef<CumulativeSnapshot>({
    completions: 0,
    values: emptyValues(),
  });

  // ── Reset state on source switch ──────────────────────────────
  useEffect(() => {
    if (!cacheServiceKey) {
      setTurns([]);
      initialTimestampMsRef.current = Date.now();
      cumulativeRef.current = { completions: 0, values: emptyValues() };
      return;
    }

    const hydratedTurns = (cachedEntry?.tokenTurns ?? []).map(
      localTokenTurnToPoint,
    );
    setTurns(hydratedTurns);
    initialTimestampMsRef.current = Date.now();

    const latestTurn = hydratedTurns[hydratedTurns.length - 1];
    cumulativeRef.current = latestTurn
      ? { completions: latestTurn.turnNumber, values: latestTurn.values }
      : { completions: 0, values: emptyValues() };
  }, [agentId, cacheServiceKey, cachedEntry]);

  // Bootstrap chart with historical OTEL metrics so charts are populated even
  // before the first websocket update arrives.
  useEffect(() => {
    if (!cacheServiceKey || !apiKey || !otelUrl) {
      return;
    }

    let cancelled = false;

    const loadInitialMetrics = async () => {
      try {
        const metricNames = [COMPLETIONS_METRIC, ...SERIES.map(s => s.metric)];
        const results = await Promise.all(
          metricNames.map(metric =>
            fetchOtelMetricRows({
              metric,
              serviceName,
              otelUrl,
              apiKey,
              limit: 1000,
            }),
          ),
        );

        if (cancelled) {
          return;
        }

        let rows = results.flat().filter(row => {
          const castedRow = row as Record<string, unknown>;
          if (!rowMatchesSource(castedRow, serviceName, runtimeId)) {
            return false;
          }
          return !agentId || extractAgentId(castedRow) === agentId;
        }) as Array<Record<string, unknown>>;

        if (rows.length === 0 && runtimeId && !serviceName) {
          rows = results.flat().filter(row => {
            const castedRow = row as Record<string, unknown>;
            return (
              rowMatchesSource(castedRow, undefined, runtimeId) &&
              (!agentId || extractAgentId(castedRow) === agentId)
            );
          }) as Array<Record<string, unknown>>;
        }

        const { turns: initialTurns, finalState } = extractTurnsFromRows(rows, {
          completions: 0,
          values: emptyValues(),
        });

        if (cancelled || initialTurns.length === 0) {
          return;
        }

        cumulativeRef.current = finalState;
        mergeTokenTurns({
          serviceName: cacheServiceKey,
          agentId,
          turns: initialTurns.map(pointToLocalTokenTurn),
        });

        const mergedEntry = resolveMonitoringEntry(
          agentRuntimeStore.getState().monitoringCache,
          cacheServiceKey,
          agentId,
        );
        if (mergedEntry) {
          setTurns(mergedEntry.tokenTurns.map(localTokenTurnToPoint));
        } else {
          setTurns(initialTurns);
        }
      } catch {
        // Fail open: websocket updates can still populate the chart.
      }
    };

    void loadInitialMetrics();

    return () => {
      cancelled = true;
    };
  }, [
    agentId,
    apiKey,
    cacheServiceKey,
    otelUrl,
    mergeTokenTurns,
    runtimeId,
    serviceName,
  ]);

  // Apply immediate post-turn token totals from monitoring snapshots.
  useEffect(() => {
    if (!cacheServiceKey) return;

    const rawValues = [
      liveSystemPromptTokens,
      liveToolsDescriptionTokens,
      liveUserMessageTokens,
      liveAgentMessageTokens,
      liveToolsUsageTokens,
    ];

    if (!rawValues.some(v => typeof v === 'number' && Number.isFinite(v))) {
      return;
    }

    const systemPromptTokens = Math.max(0, liveSystemPromptTokens ?? 0);
    const toolsDescriptionTokens = Math.max(0, liveToolsDescriptionTokens ?? 0);
    const userMessageTokens = Math.max(0, liveUserMessageTokens ?? 0);
    const aiMessageTokens = Math.max(0, liveAgentMessageTokens ?? 0);
    const toolsUsageTokens = Math.max(0, liveToolsUsageTokens ?? 0);
    const totalTokens =
      systemPromptTokens +
      toolsDescriptionTokens +
      userMessageTokens +
      aiMessageTokens +
      toolsUsageTokens;

    const timestampMs =
      typeof liveTimestampMs === 'number' && Number.isFinite(liveTimestampMs)
        ? liveTimestampMs
        : Date.now();

    appendLocalTokenTurnFull({
      serviceName: cacheServiceKey,
      agentId,
      timestampMs,
      systemPromptTokens,
      toolsDescriptionTokens,
      userMessageTokens,
      aiMessageTokens,
      toolsUsageTokens,
      totalTokens,
    });

    const mergedEntry = resolveMonitoringEntry(
      agentRuntimeStore.getState().monitoringCache,
      cacheServiceKey,
      agentId,
    );
    if (mergedEntry) {
      setTurns(mergedEntry.tokenTurns.map(localTokenTurnToPoint));
    }
  }, [
    agentId,
    cacheServiceKey,
    appendLocalTokenTurnFull,
    liveAgentMessageTokens,
    liveSystemPromptTokens,
    liveTimestampMs,
    liveToolsDescriptionTokens,
    liveToolsUsageTokens,
    liveUserMessageTokens,
    serviceName,
  ]);

  // ── WebSocket subscription (shared connection pool) ─────────
  useEffect(() => {
    if (!cacheServiceKey || !apiKey) return;

    const rawBaseUrl =
      wsUrl ||
      otelUrl ||
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

    let resolvedWsUrl: string;
    try {
      resolvedWsUrl = buildOtelWebSocketUrl({
        baseUrl: baseWithProtocol,
        token: apiKey,
      });
    } catch {
      return;
    }

    const unsubscribe = subscribeOtelWs(resolvedWsUrl, msg => {
      if (msg.signal !== 'metrics') return;

      const rows = Array.isArray(msg.data) ? msg.data : [];
      let matchingRows = rows.filter(row =>
        rowMatchesSource(row, serviceName, runtimeId),
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
        mergeTokenTurns({
          serviceName: cacheServiceKey,
          agentId,
          turns: newTurns.map(pointToLocalTokenTurn),
        });

        const mergedEntry = resolveMonitoringEntry(
          agentRuntimeStore.getState().monitoringCache,
          cacheServiceKey,
          agentId,
        );
        if (mergedEntry) {
          setTurns(mergedEntry.tokenTurns.map(localTokenTurnToPoint));
        } else {
          setTurns(prev => [...prev, ...newTurns]);
        }
      }
    });

    return unsubscribe;
  }, [
    agentId,
    apiKey,
    cacheServiceKey,
    mergeTokenTurns,
    otelUrl,
    runtimeId,
    serviceName,
    wsUrl,
  ]);

  // ── Chart options ─────────────────────────────────────────────
  const option = useMemo(() => {
    const legendLabels = Array.from(new Set(SERIES.map(item => item.label)));
    const baselineTimestampMs =
      turns.length > 0
        ? Math.max(
            0,
            Math.min(initialTimestampMsRef.current, turns[0].timestampMs - 1),
          )
        : initialTimestampMsRef.current;

    return {
      animation: false,
      animationDuration: 0,
      animationDurationUpdate: 0,
      tooltip: {
        trigger: 'axis' as const,
        textStyle: { fontSize: 10 },
        confine: true,
      },
      legend: {
        data: legendLabels,
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
        animation: false,
        smooth: false,
        lineStyle: { width: 2 },
        areaStyle: { opacity: 0.15 },
        symbol: 'circle',
        symbolSize: 4,
        data:
          turns.length > 0
            ? [
                [baselineTimestampMs, 0],
                ...turns.map(t => [t.timestampMs, t.values[item.label]]),
              ]
            : [[initialTimestampMsRef.current, 0]],
      })),
      color: ['#2da44e', '#16A085', '#0ea5a5', '#bf8700', '#cf222e'],
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
