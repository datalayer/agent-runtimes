/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Agent surface as a graph: the agent in the
 * centre, one node per kind of part around it — its model, its MCP, its
 * skills, rules, tests and events — each listing its parts, and an edge from
 * the agent to each. And the drop rule: a part dragged from the toolbox is
 * dropped on the node of its kind, and nowhere else.
 *
 * Laid out once, not by hand: two columns either side of the agent where the
 * surface is wide, one column under it where it is not. The sizes here are
 * the ones the nodes are drawn at, so the viewport is computed from the box's
 * width (as the decks' cover is) rather than fitted after drawing.
 *
 * Pure: no React, no network.
 *
 * @module apps/composer/agentGraph
 */

import type { Edge, Node } from '@xyflow/react';
import type { CanvasPartKind } from '../core/canvasParts';
import type { AppPart, AppPartKind } from './appDesign';

/** The kinds of part drawn as a node around the agent, in the order they are read. */
/**
 * A kind of part drawn as a node of its own: every kind but an avatar, which
 * is the agent's face, and an agent of the toolbox — a harness —
 * which is the agent itself.
 */
export type GroupKind = Exclude<CanvasPartKind, 'avatar' | 'agent'>;

export const GROUP_KINDS: readonly GroupKind[] = [
  'model',
  'connection',
  'protocol',
  'skill',
  'rule',
  'ui',
  'test',
  'event',
  'guard',
  'gate',
  'track',
];

/** What each kind of part is called on the surface: its node's title, one of it, and an empty node's line. */
export const PART_WORDS: Record<AppPartKind, { title: string; one: string }> = {
  agent: { title: 'Agent', one: 'agent' },
  model: { title: 'Model', one: 'model' },
  connection: { title: 'MCP', one: 'MCP server' },
  skill: { title: 'Skills', one: 'skill' },
  rule: { title: 'Rules', one: 'rule' },
  test: { title: 'Tests', one: 'test' },
  event: { title: 'Triggers', one: 'trigger' },
  protocol: { title: 'Protocols', one: 'protocol' },
  ui: { title: 'UI', one: 'UI' },
  guard: { title: 'Guards', one: 'guard' },
  gate: { title: 'Gates', one: 'gate' },
  track: { title: 'Track', one: 'track' },
};

// --- The drop rule ----------------------------------------------------------------

/** Where a dragged part may be let go: a node of a kind, the agent's node, or the surface around them. */
export type DropTarget = AppPartKind | 'background';

/**
 * Whether a part of a kind, dragged from the toolbox, may be dropped there: on
 * the node of its own kind only — an avatar on the agent, whose face it is
 *.
 */
export const dropAllowed = (
  dragged: CanvasPartKind | null | undefined,
  target: DropTarget,
): boolean =>
  dragged === 'avatar' || dragged === 'agent'
    ? target === 'agent'
    : Boolean(dragged) &&
      target !== 'background' &&
      target !== 'agent' &&
      target === dragged;

/** The nodes a dragged part may be dropped on: one, its kind's, or none while nothing is dragged. */
export const dropTargetsOf = (
  dragged: CanvasPartKind | null | undefined,
): GroupKind[] => GROUP_KINDS.filter(kind => dropAllowed(dragged, kind));

// --- The graph --------------------------------------------------------------------

/** The agent's node: the agent part, drawn as the avatar its assistant shows (empty: the paper clip; `model3d`: a 3D model, at `modelUrl` when it names one). */
export type AgentNodeData = {
  part: AppPart;
  avatar: string;
  modelUrl?: string;
};
/** A kind's node: its parts, in the spec's order. */
export type GroupNodeData = {
  kind: GroupKind;
  title: string;
  parts: AppPart[];
};

// A kind's node is `kind`, not React Flow's `group`: that type wears React Flow's own border and
// background, a second frame round ours that did not meet it at the bottom (13 October 2026).
export type AgentGraphNode =
  Node<AgentNodeData, 'agent'> | Node<GroupNodeData, 'kind'>;

/** How the nodes are placed: either side of the agent, or under it. */
export type AgentGraphLayout = 'radial' | 'column';

export type AgentGraph = {
  layout: AgentGraphLayout;
  nodes: AgentGraphNode[];
  edges: Edge<{ kind: GroupKind }>[];
  /** The graph's extent, in its own units: the viewport scales it into the box. */
  bounds: { width: number; height: number };
};

/** The sizes a node is drawn at. A part's row is one line, cut short: its height never varies. */
export const GRAPH_SIZES = {
  groupWidth: 224,
  agentWidth: 240,
  // The avatar drawn large over the agent's name (13 October 2026).
  agentHeight: 192,
  header: 34,
  // As tall as a part's two lines and its gap, and an empty kind's two lines of
  // italic: shorter, the last line spilled out under the box's border (13 October 2026).
  row: 60,
  empty: 58,
  foot: 12,
  columnGap: 64,
  rowGap: 16,
  /** Under the agent, how far in its kinds' nodes stand: their edges come down the left. */
  indent: 32,
  /** The space kept round the graph in the box. */
  pad: 16,
  /** Below this width, the column layout. */
  radialFrom: 640,
} as const;

/** How tall a kind's node is with so many parts. */
export const groupHeight = (count: number): number =>
  GRAPH_SIZES.header +
  (count ? count * GRAPH_SIZES.row : GRAPH_SIZES.empty) +
  GRAPH_SIZES.foot;

/** The layout for a box so wide. */
export const layoutFor = (width: number): AgentGraphLayout =>
  width >= GRAPH_SIZES.radialFrom ? 'radial' : 'column';

/**
 * The surface's nodes and edges, from the application's parts (`appParts`):
 * the agent in the centre, a node per kind with its parts — the kinds the
 * application has none of included, as somewhere to drop the first — and an
 * edge from the agent to each.
 */
export function agentGraph(
  parts: readonly AppPart[],
  width: number,
  avatar = '',
  modelUrl?: string,
): AgentGraph {
  const S = GRAPH_SIZES;
  const agent = parts.find(part => part.kind === 'agent');
  const groups = GROUP_KINDS.map(kind => ({
    kind,
    title: PART_WORDS[kind].title,
    parts: parts.filter(part => part.kind === kind),
  }));
  const layout = layoutFor(width);
  const nodes: AgentGraphNode[] = [];
  const edges: AgentGraph['edges'] = [];
  const edge = (
    kind: GroupKind,
    from: string,
    to: string,
    type: string,
  ): void => {
    edges.push({
      id: `agent-${kind}`,
      type,
      source: 'agent',
      sourceHandle: `${from}-out`,
      target: `group-${kind}`,
      targetHandle: `${to}-in`,
      data: { kind },
    });
  };
  const groupNode = (
    group: GroupNodeData,
    x: number,
    y: number,
    nodeWidth: number,
  ): AgentGraphNode => ({
    id: `group-${group.kind}`,
    type: 'kind',
    position: { x, y },
    width: nodeWidth,
    height: groupHeight(group.parts.length),
    data: group,
    ariaLabel: `${group.title}: ${group.parts.length ? group.parts.map(part => part.label).join(', ') : 'none yet'}`,
  });
  const agentNode = (
    x: number,
    y: number,
    nodeWidth: number,
  ): AgentGraphNode | null =>
    agent
      ? {
          id: 'agent',
          type: 'agent',
          position: { x, y },
          width: nodeWidth,
          height: S.agentHeight,
          data: { part: agent, avatar, ...(modelUrl ? { modelUrl } : {}) },
          ariaLabel: `Agent: ${agent.label}`,
        }
      : null;

  if (layout === 'radial') {
    const half = Math.ceil(groups.length / 2);
    const columns = [groups.slice(0, half), groups.slice(half)];
    const heightOf = (column: GroupNodeData[]) =>
      column.reduce((sum, group) => sum + groupHeight(group.parts.length), 0) +
      Math.max(0, column.length - 1) * S.rowGap;
    const height = Math.max(S.agentHeight, ...columns.map(heightOf));
    const centreX = S.groupWidth + S.columnGap;
    const rightX = centreX + S.agentWidth + S.columnGap;
    const centre = agentNode(
      centreX,
      (height - S.agentHeight) / 2,
      S.agentWidth,
    );
    if (centre) {
      nodes.push(centre);
    }
    columns.forEach((column, side) => {
      let y = (height - heightOf(column)) / 2;
      for (const group of column) {
        nodes.push(groupNode(group, side === 0 ? 0 : rightX, y, S.groupWidth));
        edge(
          group.kind,
          side === 0 ? 'left' : 'right',
          side === 0 ? 'right' : 'left',
          'default',
        );
        y += groupHeight(group.parts.length) + S.rowGap;
      }
    });
    return {
      layout,
      nodes,
      edges,
      bounds: { width: rightX + S.groupWidth, height },
    };
  }

  // Under the agent, one column as wide as the box allows: a phone reads it at its own size.
  const columnWidth = Math.max(
    220,
    Math.min(420, width - 2 * S.pad - S.indent),
  );
  const top = agentNode(0, 0, columnWidth);
  if (top) {
    nodes.push(top);
  }
  let y = S.agentHeight + S.rowGap * 2;
  for (const group of groups) {
    nodes.push(groupNode(group, S.indent, y, columnWidth));
    edge(group.kind, 'bottom', 'left', 'smoothstep');
    y += groupHeight(group.parts.length) + S.rowGap;
  }
  return {
    layout,
    nodes,
    edges,
    bounds: { width: S.indent + columnWidth, height: y - S.rowGap },
  };
}

/** The viewport that shows a graph whole in a box so wide, never larger than life; and how tall the box is then. */
export function viewportOf(
  graph: AgentGraph,
  width: number,
): { x: number; y: number; zoom: number; height: number } {
  const pad = GRAPH_SIZES.pad;
  const zoom = Math.max(
    0.3,
    Math.min(1, (width - 2 * pad) / graph.bounds.width),
  );
  const height = Math.ceil(graph.bounds.height * zoom + 2 * pad);
  return { x: (width - graph.bounds.width * zoom) / 2, y: pad, zoom, height };
}
