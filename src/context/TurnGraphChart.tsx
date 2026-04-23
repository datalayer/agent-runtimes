/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * TurnGraphChart — ECharts force-directed graph built from OTEL traces.
 *
 * Each graph run emitted by ``run_graph_with_telemetry`` /
 * ``run_beta_graph_with_telemetry`` produces one OTEL trace whose spans map
 * directly to pydantic-graph nodes.  This component:
 *
 *  1. Fetches recent traces from the Datalayer OTEL service using
 *     ``createOtelClient`` from ``@datalayer/core/lib/otel``  (TypeScript-side
 *     fetch, Python-side emission).
 *  2. Filters and groups spans by ``agent.id`` attribute and ``trace_id``.
 *  3. Renders the latest run as an ECharts ``graph`` type (force-directed),
 *     with:
 *     - Node size ∝ span duration
 *     - Node colour by type (start / step / end / error)
 *     - Edges following the parent→child span hierarchy
 *     - Rich hover tooltips (duration, type, error)
 *  4. Shows a small "run history" selector so the user can browse past runs.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import ReactECharts from 'echarts-for-react';
import { createOtelClient, useOtelWebSocket } from '@datalayer/core/lib/otel';
import type { OtelSpan } from '@datalayer/core/lib/otel';
import { Box } from '@datalayer/primer-addons';
import { Text } from '@primer/react';

// ── Types ─────────────────────────────────────────────────────────────────────

/** One complete graph run reconstructed from a single OTEL trace. */
interface TraceRun {
  traceId: string;
  rootSpan: OtelSpan;
  spans: OtelSpan[];
  /** Timestamp of the root span start, used for sorting newest-first. */
  startTime: Date;
  /** Total wall-clock duration of the root span in ms. */
  durationMs: number;
}

// ── Colour palette ─────────────────────────────────────────────────────────
//
// Colours and symbols mirror the pydantic-graph beta node vocabulary
// (https://pydantic.dev/docs/ai/graph/beta):
//
//   - step       → executes an async function
//   - decision   → conditional branching
//   - spread     → parallel processing of iterables
//   - broadcast  → send the same data to multiple parallel paths
//   - join       → aggregate results from parallel execution (reducer)
//   - reducer    → alias for the reducer half of a join
//   - start/end  → graph entry / exit markers

const NODE_COLORS: Record<string, string> = {
  root: '#58a6ff',
  start: '#58a6ff',
  step: '#3fb950',
  end: '#f85149',
  end_or_continue: '#d29922',
  join: '#bc8cff',
  reducer: '#a371f7',
  decision: '#f0883e',
  broadcast: '#2dd4bf',
  spread: '#79c0ff',
  error: '#da3633',
  parallel: '#79c0ff',
  default: '#8b949e',
};

/** Mapping of node type → ECharts symbol shape, for at-a-glance recognition. */
const NODE_SYMBOLS: Record<string, string> = {
  root: 'circle',
  start: 'circle',
  step: 'roundRect',
  decision: 'diamond',
  broadcast: 'triangle',
  spread: 'arrow',
  join: 'pin',
  reducer: 'pin',
  end: 'circle',
  end_or_continue: 'diamond',
  parallel: 'arrow',
  error: 'circle',
  default: 'roundRect',
};

/** Human-readable legend entries used by the UI. */
const LEGEND_ENTRIES: Array<{
  type: string;
  label: string;
  description: string;
}> = [
  { type: 'start', label: 'Start', description: 'Graph entry point' },
  { type: 'step', label: 'Step', description: 'Async function execution' },
  { type: 'decision', label: 'Decision', description: 'Conditional branching' },
  {
    type: 'broadcast',
    label: 'Broadcast',
    description: 'Send data to multiple parallel paths',
  },
  {
    type: 'spread',
    label: 'Spread',
    description: 'Parallel processing of iterables',
  },
  {
    type: 'join',
    label: 'Join',
    description: 'Aggregate parallel results (reducer)',
  },
  { type: 'end', label: 'End', description: 'Graph exit point' },
];

function spanColor(span: OtelSpan): string {
  if (span.status_code === 'ERROR') return NODE_COLORS.error;
  const rawType =
    (span.attributes?.['graph.node.type'] as string | undefined) ?? '';
  const nodeType = rawType.toLowerCase();
  if (nodeType in NODE_COLORS) {
    return (
      NODE_COLORS[nodeType as keyof typeof NODE_COLORS] ?? NODE_COLORS.step
    );
  }
  if (span.span_name === 'agent.graph.run') return NODE_COLORS.root;
  return NODE_COLORS.step;
}

function formatDur(ms: number): string {
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function nanoToIso(val: unknown): string {
  const n = Number(val);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n > 1e15) return new Date(n / 1e6).toISOString();
  if (n > 1e12) return new Date(n / 1e3).toISOString();
  return new Date(n).toISOString();
}

function parseAttrs(raw: unknown): Record<string, unknown> | undefined {
  if (typeof raw === 'object' && raw !== null) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === 'string' && raw.trim().length > 0) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function normalizeSpan(raw: OtelSpan | Record<string, unknown>): OtelSpan {
  const source = raw as Record<string, unknown>;
  const durationMs =
    source.duration_ms != null
      ? Number(source.duration_ms)
      : source.duration_ns != null
        ? Number(source.duration_ns) / 1e6
        : 0;

  return {
    trace_id: String(source.trace_id ?? ''),
    span_id: String(source.span_id ?? ''),
    parent_span_id:
      source.parent_span_id != null && String(source.parent_span_id).length > 0
        ? String(source.parent_span_id)
        : undefined,
    span_name: String(
      source.span_name ?? source.operation_name ?? source.name ?? '',
    ),
    service_name: String(source.service_name ?? ''),
    kind: String(source.kind ?? source.span_kind ?? 'INTERNAL'),
    start_time:
      typeof source.start_time === 'string' && source.start_time.length > 0
        ? source.start_time
        : nanoToIso(source.start_time_unix_nano),
    end_time:
      typeof source.end_time === 'string' && source.end_time.length > 0
        ? source.end_time
        : nanoToIso(source.end_time_unix_nano),
    duration_ms: Number.isFinite(durationMs) ? durationMs : 0,
    status_code:
      source.status_code != null ? String(source.status_code) : undefined,
    status_message:
      source.status_message != null ? String(source.status_message) : undefined,
    attributes: parseAttrs(source.attributes),
  };
}

function isGraphSpan(span: OtelSpan): boolean {
  return (
    span.span_name === 'agent.graph.run' ||
    span.span_name.startsWith('graph.node.')
  );
}

// ── ECharts option builder ─────────────────────────────────────────────────

/**
 * Compute a left-to-right layered DAG layout for the spans.
 *
 * Execution traces are strictly hierarchical (parent → child spans), so a
 * fixed layered layout produces a far cleaner visual than force-directed
 * relaxation — matching the "Layout: none + manual positions" pattern used
 * by several ECharts graph examples for DAGs.
 *
 * Each span is placed at:
 *   x = depth * columnWidth
 *   y = indexWithinLayer * rowHeight - verticalCentre
 *
 * Root spans (no parent or parent missing from trace) anchor depth 0.
 */
function computeLayout(
  spans: OtelSpan[],
): Map<string, { x: number; y: number }> {
  const spanById = new Map(spans.map(s => [s.span_id, s]));
  const childrenByParent = new Map<string, string[]>();
  const roots: string[] = [];

  for (const s of spans) {
    if (s.parent_span_id && spanById.has(s.parent_span_id)) {
      const list = childrenByParent.get(s.parent_span_id) ?? [];
      list.push(s.span_id);
      childrenByParent.set(s.parent_span_id, list);
    } else {
      roots.push(s.span_id);
    }
  }

  // Preserve execution order within a layer by sorting children by start time.
  for (const [parent, kids] of childrenByParent) {
    kids.sort((a, b) => {
      const sa = spanById.get(a)?.start_time ?? '';
      const sb = spanById.get(b)?.start_time ?? '';
      return sa.localeCompare(sb);
    });
    childrenByParent.set(parent, kids);
  }

  // BFS depth assignment from every root.
  const depthById = new Map<string, number>();
  const queue: Array<[string, number]> = roots.map(r => [r, 0]);
  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) break;
    const [spanId, depth] = next;
    if (depthById.has(spanId)) continue;
    depthById.set(spanId, depth);
    for (const child of childrenByParent.get(spanId) ?? []) {
      queue.push([child, depth + 1]);
    }
  }
  // Defensive: any span we never reached (orphan) → depth 0.
  for (const s of spans) {
    if (!depthById.has(s.span_id)) depthById.set(s.span_id, 0);
  }

  // Bucket spans by depth.
  const byDepth = new Map<number, string[]>();
  for (const [spanId, depth] of depthById) {
    const list = byDepth.get(depth) ?? [];
    list.push(spanId);
    byDepth.set(depth, list);
  }
  // Preserve start-time order within each depth layer.
  for (const [depth, ids] of byDepth) {
    ids.sort((a, b) => {
      const sa = spanById.get(a)?.start_time ?? '';
      const sb = spanById.get(b)?.start_time ?? '';
      return sa.localeCompare(sb);
    });
    byDepth.set(depth, ids);
  }

  const columnWidth = 180;
  const rowHeight = 90;
  const positions = new Map<string, { x: number; y: number }>();
  for (const [depth, ids] of byDepth) {
    const count = ids.length;
    const totalHeight = (count - 1) * rowHeight;
    const yStart = -totalHeight / 2;
    ids.forEach((spanId, idx) => {
      positions.set(spanId, {
        x: depth * columnWidth,
        y: yStart + idx * rowHeight,
      });
    });
  }
  return positions;
}

function buildOption(run: TraceRun) {
  const { spans } = run;
  const spanById = new Map(spans.map(s => [s.span_id, s]));
  const maxDur = Math.max(...spans.map(s => s.duration_ms ?? 1), 1);
  const positions = computeLayout(spans);

  const nodes = spans.map(s => {
    const isRoot = s.span_name === 'agent.graph.run';
    const dur = s.duration_ms ?? 1;
    const nodeId =
      (s.attributes?.['graph.node.id'] as string | undefined) ??
      s.span_id.slice(0, 8);
    const nodeType =
      (s.attributes?.['graph.node.type'] as string | undefined) ??
      (isRoot ? 'root' : 'step');
    const status =
      (s.attributes?.['graph.node.status'] as string | undefined) ??
      'completed';
    const label = isRoot ? '▶ Run' : nodeId.replace('__', '');
    const hasError =
      s.status_code === 'ERROR' ||
      status === 'error' ||
      !!s.attributes?.['error.message'];
    const symbol =
      NODE_SYMBOLS[nodeType.toLowerCase()] ??
      (isRoot ? 'circle' : NODE_SYMBOLS.default);
    const pos = positions.get(s.span_id) ?? { x: 0, y: 0 };

    return {
      id: s.span_id,
      name: label,
      x: pos.x,
      y: pos.y,
      symbol,
      symbolSize: isRoot ? 44 : 22 + Math.round((dur / maxDur) * 26),
      itemStyle: {
        color: hasError ? NODE_COLORS.error : spanColor(s),
        borderWidth: isRoot ? 3 : dur > maxDur * 0.5 ? 2 : 1,
        borderColor: hasError ? NODE_COLORS.error : 'rgba(240,246,252,0.25)',
        shadowBlur: isRoot ? 12 : 4,
        shadowColor: 'rgba(0,0,0,0.35)',
      },
      label: {
        show: true,
        position: 'bottom' as const,
        distance: 8,
        fontSize: isRoot ? 12 : 11,
        color: '#c9d1d9',
        formatter: label,
        backgroundColor: 'rgba(13,17,23,0.7)',
        padding: [2, 6],
        borderRadius: 3,
      },
      value: dur,
      // Custom tooltip via series-level formatter below.
      _meta: {
        nodeId,
        nodeType,
        status,
        dur,
        isRoot,
        error: s.attributes?.['error.message'],
      },
    };
  });

  const links: Array<{
    source: string;
    target: string;
    lineStyle: Record<string, unknown>;
  }> = [];
  for (const s of spans) {
    if (s.parent_span_id && spanById.has(s.parent_span_id)) {
      const isError = s.status_code === 'ERROR';
      links.push({
        source: s.parent_span_id,
        target: s.span_id,
        lineStyle: {
          color: isError ? NODE_COLORS.error : '#6e7681',
          width: isError ? 2 : 1.4,
          curveness: 0.15,
          opacity: 0.9,
        },
      });
    }
  }

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item' as const,
      backgroundColor: '#161b22',
      borderColor: '#30363d',
      textStyle: { color: '#c9d1d9', fontSize: 12 },
      formatter: (params: { data?: { _meta?: Record<string, unknown> } }) => {
        const meta = params?.data?._meta;
        if (!meta) return '';
        const lines = [
          `<b>${meta.nodeId}</b>`,
          `Type: ${meta.nodeType}`,
          `Status: ${meta.status}`,
          `Duration: ${formatDur(Number(meta.dur))}`,
        ];
        if (meta.error) {
          lines.push(
            `<span style="color:${NODE_COLORS.error}">Error: ${meta.error}</span>`,
          );
        }
        return lines.join('<br/>');
      },
    },
    series: [
      {
        type: 'graph',
        // Layered DAG: positions are precomputed per-node, so 'none' gives
        // us a stable, non-jittery layout (mirrors the static DAG samples
        // in https://echarts.apache.org/examples/en/index.html#chart-type-graph).
        layout: 'none',
        roam: true,
        draggable: true,
        data: nodes,
        links,
        edgeSymbol: ['none', 'arrow'] as const,
        edgeSymbolSize: [0, 9],
        lineStyle: { opacity: 0.9, curveness: 0.15 },
        emphasis: {
          focus: 'adjacency' as const,
          lineStyle: { width: 3, opacity: 1 },
          label: { show: true },
        },
        labelLayout: { hideOverlap: true },
        autoCurveness: true,
        zoom: 1,
        animation: true,
        animationDuration: 400,
        animationEasingUpdate: 'cubicOut' as const,
      },
    ],
  };
}

// ── Component ──────────────────────────────────────────────────────────────

export interface TurnGraphChartProps {
  /** OTEL service name — typically ``"agent-runtimes"``. */
  serviceName: string;
  /** Filter spans to this agent ID (matches ``agent.id`` span attribute). */
  agentId?: string;
  /** Base URL for the Datalayer OTEL service. */
  runUrl?: string;
  /** JWT / API key for OTEL auth. */
  apiKey?: string;
  /**
   * Auto-refresh interval in ms (default 10 000).
   * Set to 0 to disable polling.
   */
  autoRefreshMs?: number;
  height?: number | string;
  style?: CSSProperties;
}

export const TurnGraphChart: React.FC<TurnGraphChartProps> = ({
  serviceName,
  agentId,
  runUrl,
  apiKey,
  autoRefreshMs = 10_000,
  height = 320,
  style,
}) => {
  const [runs, setRuns] = useState<TraceRun[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const upsertRunsFromSpans = useCallback(
    (
      incoming: Array<OtelSpan | Record<string, unknown>>,
      mode: 'replace' | 'merge' = 'merge',
    ) => {
      const normalized = incoming.map(normalizeSpan);
      const spansByTrace = new Map<string, OtelSpan[]>();

      for (const span of normalized) {
        if (!isGraphSpan(span)) continue;
        if (
          agentId &&
          span.attributes?.['agent.id'] &&
          span.attributes['agent.id'] !== agentId
        ) {
          continue;
        }
        const list = spansByTrace.get(span.trace_id) ?? [];
        list.push(span);
        spansByTrace.set(span.trace_id, list);
      }

      const incomingRuns: TraceRun[] = [];
      for (const [traceId, spans] of spansByTrace.entries()) {
        const root =
          spans.find(s => s.span_name === 'agent.graph.run') ?? spans[0];
        if (!root) continue;
        incomingRuns.push({
          traceId,
          rootSpan: root,
          spans,
          startTime: new Date(root.start_time),
          durationMs: root.duration_ms ?? 0,
        });
      }

      setRuns(prev => {
        const merged = new Map<string, TraceRun>();
        if (mode === 'merge') {
          for (const run of prev) merged.set(run.traceId, run);
        }
        for (const run of incomingRuns) merged.set(run.traceId, run);
        const sorted = Array.from(merged.values()).sort(
          (a, b) => b.startTime.getTime() - a.startTime.getTime(),
        );
        return sorted.slice(0, 20);
      });
      setSelectedIdx(prev => Math.max(0, prev));
    },
    [agentId],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchData = useCallback(async () => {
    if (!runUrl || !apiKey) return;
    setLoading(true);
    setError(null);
    try {
      const client = createOtelClient({ baseUrl: runUrl, token: apiKey });
      const result = await client.fetchTraces({ serviceName, limit: 200 });
      if (mountedRef.current) upsertRunsFromSpans(result.data, 'replace');
    } catch (err: unknown) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [runUrl, apiKey, serviceName, upsertRunsFromSpans]);

  const { connected: wsConnected, error: wsError } = useOtelWebSocket({
    baseUrl: runUrl,
    token: apiKey,
    callbacks: {
      onTraces: spans => {
        upsertRunsFromSpans(spans, 'merge');
      },
    },
  });

  useEffect(() => {
    void fetchData();
    // WebSocket is the primary live feed; keep HTTP polling only as fallback.
    if (autoRefreshMs > 0 && !wsConnected) {
      const id = setInterval(() => void fetchData(), autoRefreshMs);
      return () => clearInterval(id);
    }
  }, [fetchData, autoRefreshMs, wsConnected]);

  const selectedRun = runs[selectedIdx];
  const option = useMemo(
    () => (selectedRun ? buildOption(selectedRun) : null),
    [selectedRun],
  );

  // Not configured — caller didn't pass auth.
  if (!runUrl || !apiKey) return null;

  if (loading && runs.length === 0) {
    return (
      <Box sx={{ color: 'fg.muted', fontSize: 1, py: 2 }}>
        Loading OTEL traces…
      </Box>
    );
  }

  if (error && runs.length === 0) {
    return (
      <Box sx={{ color: 'danger.fg', fontSize: 0, py: 1 }}>
        OTEL trace fetch failed: {error}
      </Box>
    );
  }

  if (!option) {
    return (
      <Box sx={{ color: 'fg.muted', fontSize: 1, py: 2 }}>
        No graph trace data yet — run a pydantic-graph agent to see execution
        turns here.
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {/* Run selector */}
      {runs.length > 1 && (
        <Box
          sx={{
            display: 'flex',
            gap: 1,
            flexWrap: 'wrap',
            mb: 1,
          }}
        >
          {runs.slice(0, 8).map((run, idx) => (
            <Box
              key={run.traceId}
              onClick={() => setSelectedIdx(idx)}
              sx={{
                px: 2,
                py: '2px',
                borderRadius: 2,
                fontSize: 0,
                cursor: 'pointer',
                border: '1px solid',
                borderColor:
                  idx === selectedIdx ? 'accent.emphasis' : 'border.default',
                bg: idx === selectedIdx ? 'accent.subtle' : 'canvas.subtle',
                color: idx === selectedIdx ? 'accent.fg' : 'fg.muted',
                userSelect: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              #{runs.length - idx} &nbsp;
              {run.startTime.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
              {run.durationMs ? ` (${formatDur(run.durationMs)})` : ''}
            </Box>
          ))}
        </Box>
      )}

      {/* Legend — mirrors the pydantic-graph beta node vocabulary. */}
      <Box
        sx={{
          display: 'flex',
          gap: 2,
          flexWrap: 'wrap',
          alignItems: 'center',
          fontSize: 0,
          color: 'fg.muted',
          px: 1,
          py: '2px',
        }}
        aria-label="Graph node legend"
      >
        {LEGEND_ENTRIES.map(entry => (
          <Box
            key={entry.type}
            sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
            title={entry.description}
          >
            <Box
              aria-hidden
              sx={{
                width: 10,
                height: 10,
                borderRadius:
                  entry.type === 'decision'
                    ? 0
                    : entry.type === 'broadcast' || entry.type === 'spread'
                      ? '2px'
                      : '50%',
                transform: entry.type === 'decision' ? 'rotate(45deg)' : 'none',
                bg: NODE_COLORS[entry.type] ?? NODE_COLORS.default,
              }}
            />
            <Text sx={{ fontSize: 0 }}>{entry.label}</Text>
          </Box>
        ))}
      </Box>

      {/* Graph */}
      <ReactECharts
        option={option}
        style={{ height, width: '100%', ...style }}
        opts={{ renderer: 'svg' }}
        notMerge={false}
      />

      {/* Footer stats */}
      <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
        {selectedRun.spans.length - 1} node(s)
        {selectedRun.durationMs
          ? ` · ${formatDur(selectedRun.durationMs)} total`
          : ''}
        {wsConnected ? ' · ws live' : ' · ws disconnected'}
        {wsError ? ` · ws error: ${wsError}` : ''}
        {loading ? ' · refreshing…' : ''}
        {error ? ` · fetch error: ${error}` : ''}
      </Text>
    </Box>
  );
};

export default TurnGraphChart;
