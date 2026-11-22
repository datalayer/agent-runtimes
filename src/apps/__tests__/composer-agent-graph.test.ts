/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Agent surface as a graph: the agent in the
 * centre, a node per kind of part with an edge from the agent to each, laid
 * out to fit the box; and the drop rule — a part dragged from the toolbox is
 * dropped on the node of its kind, and nowhere else.
 */

import { describe, expect, it } from 'vitest';
import { dumpAppspec, emptyAppspec } from '../apps/appspec';
import { canvasPartsOf, canvasPartsReactor } from '../plugins/canvas-parts';
import type { CanvasPartKind } from '../core/canvasParts';
import { TOOLBOX_GROUPS, appParts, withPartAdded } from '../composer/appDesign';
import {
  GRAPH_SIZES,
  GROUP_KINDS,
  PART_WORDS,
  agentGraph,
  dropAllowed,
  dropTargetsOf,
  groupHeight,
  layoutFor,
  viewportOf,
} from '../composer/agentGraph';

const OFFERED = canvasPartsOf(canvasPartsReactor());
const fresh = () =>
  dumpAppspec({
    ...emptyAppspec('chat'),
    name: 'Desk',
    agent: 'desk-agent',
    instructions: 'Answer from the docs.',
  });

/** An application with two connections, one rule and nothing else. */
const desk = () => {
  const connections = OFFERED.filter(part => part.kind === 'connection').slice(
    0,
    2,
  );
  const rule = OFFERED.find(part => part.kind === 'rule')!;
  let data: unknown = fresh();
  for (const tool of [...connections, rule]) {
    data = withPartAdded(data, tool).data;
  }
  return appParts(data);
};

describe('the drop rule: a part goes on the node of its kind, nowhere else', () => {
  it.each(GROUP_KINDS.map(kind => [kind] as const))('a %s part', kind => {
    expect(dropTargetsOf(kind)).toEqual([kind]);
    for (const other of GROUP_KINDS.filter(each => each !== kind)) {
      expect(dropAllowed(kind, other)).toBe(false);
    }
    // Not the agent, not the surface around the nodes.
    expect(dropAllowed(kind, 'agent')).toBe(false);
    expect(dropAllowed(kind, 'background')).toBe(false);
  });

  it('allows nothing while nothing is dragged', () => {
    expect(dropTargetsOf(null)).toEqual([]);
    expect(GROUP_KINDS.some(kind => dropAllowed(undefined, kind))).toBe(false);
  });

  it('has a node for every kind the toolbox offers: no part is left without a place', () => {
    // An avatar's place is the agent itself, whose face it is.
    // A coding agent's place too: dropped on the agent, it is the application's agent.
    expect(
      [
        ...TOOLBOX_GROUPS.map(group => group.kind).filter(
          kind => kind !== 'avatar' && kind !== 'agent',
        ),
      ].sort(),
    ).toEqual([...GROUP_KINDS].sort());
    for (const tool of OFFERED) {
      if (tool.kind === 'avatar' || tool.kind === 'agent') {
        expect([
          tool.id,
          dropTargetsOf(tool.kind),
          dropAllowed(tool.kind, 'agent'),
        ]).toEqual([tool.id, [], true]);
        continue;
      }
      expect([tool.id, dropTargetsOf(tool.kind as CanvasPartKind)]).toEqual([
        tool.id,
        [tool.kind],
      ]);
    }
    expect(dropAllowed('avatar', 'background')).toBe(false);
    expect(GROUP_KINDS.some(kind => dropAllowed('avatar', kind))).toBe(false);
  });
});

describe('the graph: the agent in the centre, an edge to each kind', () => {
  it('draws the agent, then a node per kind with its parts, empty ones included', () => {
    const graph = agentGraph(desk(), 900);
    expect(graph.layout).toBe('radial');
    expect(graph.nodes.map(node => node.id)).toEqual([
      'agent',
      ...GROUP_KINDS.map(kind => `group-${kind}`),
    ]);
    const of = (kind: string) =>
      graph.nodes.find(node => node.id === `group-${kind}`)!.data as {
        parts: { id: string }[];
        title: string;
      };
    expect(of('connection').parts.map(part => part.id)).toEqual([
      'connection-0',
      'connection-1',
    ]);
    expect(of('connection').title).toBe('MCP');
    expect(of('rule').parts).toHaveLength(1);
    expect(of('model').parts.map(part => part.id)).toEqual(['model']);
    expect(of('test').parts).toEqual([]);
    expect(graph.nodes.find(node => node.id === 'agent')!.data).toMatchObject({
      part: { id: 'agent', label: 'desk-agent' },
    });
  });

  it('starts every edge at the agent, one per kind, joined at the facing sides', () => {
    const radial = agentGraph(desk(), 900);
    expect(radial.edges.map(edge => [edge.source, edge.target])).toEqual(
      GROUP_KINDS.map(kind => ['agent', `group-${kind}`]),
    );
    const left = new Set(
      radial.nodes
        .filter(node => node.type === 'kind' && node.position.x === 0)
        .map(node => node.id),
    );
    for (const edge of radial.edges) {
      expect([edge.id, edge.sourceHandle, edge.targetHandle]).toEqual(
        left.has(edge.target)
          ? [edge.id, 'left-out', 'right-in']
          : [edge.id, 'right-out', 'left-in'],
      );
    }
    // The left column takes the odd one: ceil, as the graph halves its groups.
    expect(left.size).toBe(Math.ceil(GROUP_KINDS.length / 2));
    const column = agentGraph(desk(), 360);
    expect(
      column.edges.every(
        edge =>
          edge.sourceHandle === 'bottom-out' &&
          edge.targetHandle === 'left-in' &&
          edge.type === 'smoothstep',
      ),
    ).toBe(true);
  });

  it('lays nodes out without overlap, the agent centred between its two columns', () => {
    for (const width of [360, 900]) {
      const graph = agentGraph(desk(), width);
      const boxes = graph.nodes.map(node => ({
        id: node.id,
        x: node.position.x,
        y: node.position.y,
        w: node.width!,
        h: node.height!,
      }));
      for (const a of boxes) {
        expect(a.x + a.w).toBeLessThanOrEqual(graph.bounds.width);
        expect(a.y + a.h).toBeLessThanOrEqual(graph.bounds.height);
        for (const b of boxes) {
          const apart =
            a === b ||
            a.x + a.w <= b.x ||
            b.x + b.w <= a.x ||
            a.y + a.h <= b.y ||
            b.y + b.h <= a.y;
          expect([width, a.id, b.id, apart]).toEqual([width, a.id, b.id, true]);
        }
      }
    }
    const radial = agentGraph(desk(), 900);
    const agent = radial.nodes[0];
    expect(agent.position.x).toBe(
      GRAPH_SIZES.groupWidth + GRAPH_SIZES.columnGap,
    );
    expect(agent.position.y + GRAPH_SIZES.agentHeight / 2).toBeCloseTo(
      radial.bounds.height / 2,
    );
  });

  it('sizes a kind’s node by its parts, so the viewport is known before drawing', () => {
    expect(groupHeight(0)).toBe(
      GRAPH_SIZES.header + GRAPH_SIZES.empty + GRAPH_SIZES.foot,
    );
    expect(groupHeight(3) - groupHeight(2)).toBe(GRAPH_SIZES.row);
    const graph = agentGraph(desk(), 900);
    expect(
      graph.nodes.find(node => node.id === 'group-connection')!.height,
    ).toBe(groupHeight(2));
  });

  it('fits the box: two columns where it is wide, one under the agent where it is not, never larger than life', () => {
    expect(layoutFor(GRAPH_SIZES.radialFrom)).toBe('radial');
    expect(layoutFor(GRAPH_SIZES.radialFrom - 1)).toBe('column');
    for (const width of [360, 640, 900, 1400]) {
      const graph = agentGraph(desk(), width);
      const view = viewportOf(graph, width);
      expect(view.zoom).toBeLessThanOrEqual(1);
      // Whole, inside the box, centred across it.
      expect(graph.bounds.width * view.zoom).toBeLessThanOrEqual(
        width - 2 * GRAPH_SIZES.pad + 0.001,
      );
      expect(view.x * 2 + graph.bounds.width * view.zoom).toBeCloseTo(width);
      expect(view.height).toBeGreaterThanOrEqual(
        graph.bounds.height * view.zoom + 2 * GRAPH_SIZES.pad,
      );
    }
    // A phone reads it at its own size.
    expect(viewportOf(agentGraph(desk(), 360), 360).zoom).toBe(1);
  });
});

describe('the words', () => {
  it('calls a connection’s node and group MCP, the other kinds in a Maker’s words', () => {
    expect(PART_WORDS.connection).toEqual({ title: 'MCP', one: 'MCP server' });
    expect(
      TOOLBOX_GROUPS.find(group => group.kind === 'connection')!.label,
    ).toBe('MCP');
  });
});
