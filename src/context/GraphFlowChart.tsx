/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * GraphFlowChart — ECharts graph visualisation of pydantic-graph execution.
 *
 * Renders a force-directed graph showing:
 * - Static topology (nodes + edges from the graph definition)
 * - Dynamic execution trace (which nodes were visited, with timing)
 */

import { useMemo, type CSSProperties } from 'react';
import ReactECharts from 'echarts-for-react';
import type {
  GraphTelemetryData,
  GraphTelemetryNode,
  GraphTelemetryEdge,
  GraphNodeEvent,
} from '../types/stream';

/** Category definitions for ECharts graph. */
const CATEGORIES = [
  { name: 'start', itemStyle: { color: '#58a6ff' } },
  { name: 'step', itemStyle: { color: '#3fb950' } },
  { name: 'end', itemStyle: { color: '#f85149' } },
  { name: 'end_or_continue', itemStyle: { color: '#d29922' } },
  { name: 'join', itemStyle: { color: '#bc8cff' } },
  { name: 'decision', itemStyle: { color: '#f0883e' } },
  { name: 'error', itemStyle: { color: '#da3633' } },
  { name: 'parallel', itemStyle: { color: '#79c0ff' } },
];

const CATEGORY_INDEX: Record<string, number> = {};
CATEGORIES.forEach((c, i) => {
  CATEGORY_INDEX[c.name] = i;
});

function getCategoryIndex(category: string): number {
  return CATEGORY_INDEX[category] ?? (CATEGORY_INDEX['step'] as number);
}

/** Map node events to a lookup for fast access. */
function buildEventLookup(
  events: GraphNodeEvent[],
): Map<string, GraphNodeEvent[]> {
  const map = new Map<string, GraphNodeEvent[]>();
  for (const evt of events) {
    const existing = map.get(evt.nodeId);
    if (existing) {
      existing.push(evt);
    } else {
      map.set(evt.nodeId, [evt]);
    }
  }
  return map;
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return '—';
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export interface GraphFlowChartProps {
  data: GraphTelemetryData;
  height?: number | string;
  style?: CSSProperties;
}

export const GraphFlowChart: React.FC<GraphFlowChartProps> = ({
  data,
  height = 320,
  style,
}) => {
  const option = useMemo(() => {
    const eventLookup = buildEventLookup(data.events);

    // Build ECharts nodes
    const echartsNodes = data.nodes.map((node: GraphTelemetryNode) => {
      const nodeEvents = eventLookup.get(node.id) || [];
      const lastEvent = nodeEvents[nodeEvents.length - 1];
      const hitCount = nodeEvents.filter(e => e.status === 'completed').length;
      const hasError = nodeEvents.some(e => e.status === 'error');
      const totalDuration = nodeEvents.reduce(
        (sum, e) => sum + (e.durationMs ?? 0),
        0,
      );

      // Size based on hit count (bigger = more visits)
      const baseSize = 30;
      const symbolSize = baseSize + Math.min(hitCount * 8, 40);

      // Determine visual category
      let visualCategory = node.category;
      if (hasError) visualCategory = 'error';

      return {
        id: node.id,
        name:
          node.name === '__start__'
            ? 'Start'
            : node.name === '__end__'
              ? 'End'
              : node.name,
        symbolSize,
        category: getCategoryIndex(visualCategory),
        value: hitCount,
        itemStyle:
          hitCount > 0 ? { borderWidth: 3, borderColor: '#e3b341' } : undefined,
        label: {
          show: true,
          fontSize: 11,
          color: '#c9d1d9',
        },
        tooltip: {
          formatter: () => {
            const lines = [
              `<b>${node.name}</b>`,
              `Category: ${node.category}`,
              `Executions: ${hitCount}`,
            ];
            if (totalDuration > 0) {
              lines.push(`Total duration: ${formatDuration(totalDuration)}`);
            }
            if (lastEvent?.status === 'error' && lastEvent.error) {
              lines.push(
                `<span style="color:#f85149">Error: ${lastEvent.error}</span>`,
              );
            }
            return lines.join('<br/>');
          },
        },
      };
    });

    // Build ECharts edges (links)
    const echartsLinks = data.edges.map((edge: GraphTelemetryEdge) => {
      // Check if this edge was traversed in the execution trace
      const wasTraversed = data.events.some(
        e => e.nodeId === edge.target && e.parentNodeId === edge.source,
      );

      return {
        source: edge.source,
        target: edge.target,
        label: edge.label
          ? {
              show: true,
              formatter: edge.label,
              fontSize: 9,
              color: '#8b949e',
            }
          : undefined,
        lineStyle: {
          color: wasTraversed ? '#e3b341' : '#484f58',
          width: wasTraversed ? 3 : 1.5,
          curveness: 0.2,
          type:
            edge.edgeType === 'parallel'
              ? ('dashed' as const)
              : ('solid' as const),
        },
      };
    });

    return {
      tooltip: {
        trigger: 'item' as const,
        backgroundColor: '#161b22',
        borderColor: '#30363d',
        textStyle: { color: '#c9d1d9', fontSize: 12 },
      },
      legend: {
        data: CATEGORIES.map(c => c.name),
        top: 4,
        textStyle: { color: '#8b949e', fontSize: 10 },
        itemWidth: 12,
        itemHeight: 12,
      },
      series: [
        {
          type: 'graph',
          layout: 'force',
          roam: true,
          draggable: true,
          categories: CATEGORIES,
          data: echartsNodes,
          links: echartsLinks,
          force: {
            repulsion: 200,
            edgeLength: [80, 160],
            gravity: 0.1,
          },
          edgeSymbol: ['none', 'arrow'],
          edgeSymbolSize: [0, 8],
          emphasis: {
            focus: 'adjacency' as const,
            lineStyle: { width: 4 },
          },
          label: {
            show: true,
            position: 'bottom' as const,
            fontSize: 10,
          },
          lineStyle: {
            opacity: 0.7,
          },
          animation: true,
          animationDuration: 500,
        },
      ],
    };
  }, [data]);

  return (
    <ReactECharts
      option={option}
      style={{ height, width: '100%', ...style }}
      opts={{ renderer: 'canvas' }}
      notMerge
    />
  );
};

export default GraphFlowChart;
