/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/** The conversation's editable React Flow diagram and its frontend tools. */

import type { Edge, Node, XYPosition } from '@xyflow/react';
import type { FrontendToolDefinition } from '../../../types/tools';
import { ConversationBound } from '../../pageTools/conversation';
import { PAGE_TOOL_RESULTS } from '../../toolCards/toolResults';

export const REACT_FLOW_TOOL_NAMES = [
  'list_shapes',
  'insert_shape',
  'link_shapes',
  'move_shape',
] as const;

export const REACT_FLOW_WRITE_TOOL_NAMES = [
  'insert_shape',
  'link_shapes',
  'move_shape',
] as const;

export type ReactFlowShapeData = {
  label: string;
};

export type PageReactFlow = {
  nodes: Node<ReactFlowShapeData>[];
  edges: Edge[];
  nextShape: number;
  nextLink: number;
};

const fresh = (): PageReactFlow => ({
  nodes: [],
  edges: [],
  nextShape: 1,
  nextLink: 1,
});

const text = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const number = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const shapeAt = (flow: PageReactFlow, id: string) =>
  flow.nodes.find(node => node.id === id);

const shownShape = (node: Node<ReactFlowShapeData>) => ({
  id: node.id,
  label: node.data.label,
  type: node.type ?? 'default',
  position: { x: node.position.x, y: node.position.y },
});

const shownLink = (edge: Edge) => ({
  id: edge.id,
  source_id: edge.source,
  target_id: edge.target,
  ...(typeof edge.label === 'string' && edge.label
    ? { label: edge.label }
    : {}),
});

/** Run one tool against a flow. Exported so restoration and tests use the same rules. */
export async function runReactFlowTool(
  flow: PageReactFlow,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (name === 'list_shapes') {
    return {
      ok: true,
      shapes: flow.nodes.map(shownShape),
      links: flow.edges.map(shownLink),
    };
  }

  if (name === 'insert_shape') {
    const label = text(args.label);
    if (!label) {
      return { ok: false, error: 'label is required.' };
    }
    const type = text(args.type) || 'default';
    if (!['default', 'input', 'output'].includes(type)) {
      return {
        ok: false,
        error: "type must be 'default', 'input', or 'output'.",
      };
    }
    const id = `shape-${flow.nextShape++}`;
    const fallback = flow.nodes.length;
    const node: Node<ReactFlowShapeData> = {
      id,
      type,
      position: {
        x: number(args.x) ?? (fallback % 3) * 220,
        y: number(args.y) ?? Math.floor(fallback / 3) * 140,
      },
      data: { label },
    };
    flow.nodes.push(node);
    return { ok: true, id, shape: shownShape(node) };
  }

  if (name === 'link_shapes') {
    const source = text(args.source_id);
    const target = text(args.target_id);
    if (!shapeAt(flow, source)) {
      return { ok: false, error: `There is no shape '${source}'.` };
    }
    if (!shapeAt(flow, target)) {
      return { ok: false, error: `There is no shape '${target}'.` };
    }
    const id = `link-${flow.nextLink++}`;
    const label = text(args.label);
    const edge: Edge = {
      id,
      source,
      target,
      ...(label ? { label } : {}),
    };
    flow.edges.push(edge);
    return { ok: true, id, link: shownLink(edge) };
  }

  if (name === 'move_shape') {
    const id = text(args.shape_id);
    const node = shapeAt(flow, id);
    if (!node) {
      return { ok: false, error: `There is no shape '${id}'.` };
    }
    const x = number(args.x);
    const y = number(args.y);
    if (x === undefined || y === undefined) {
      return { ok: false, error: 'x and y must be finite numbers.' };
    }
    node.position = { x, y };
    return { ok: true, id, shape: shownShape(node) };
  }

  return { ok: false, error: `There is no React Flow tool '${name}'.` };
}

export const PAGE_REACT_FLOW = new ConversationBound<PageReactFlow>({
  fresh,
  writes: REACT_FLOW_WRITE_TOOL_NAMES,
  replay: async calls => {
    const flow = fresh();
    for (const call of calls) {
      await runReactFlowTool(flow, call.name, call.args);
    }
    return flow;
  },
});

const objectSchema = (
  properties: Record<string, unknown>,
  required: string[] = [],
) => ({ type: 'object', properties, required, additionalProperties: false });

const definitions: Array<
  Omit<FrontendToolDefinition, 'handler'> & { name: string }
> = [
  {
    name: 'list_shapes',
    description:
      'List every shape and link currently on the React Flow canvas, including stable IDs and positions. Call this before changing a diagram the user may have edited.',
    parameters: objectSchema({}),
  },
  {
    name: 'insert_shape',
    description:
      'Insert one shape on the React Flow canvas. Returns its new stable ID so later calls can move or link it.',
    parameters: objectSchema(
      {
        label: { type: 'string', description: 'Text shown in the shape.' },
        type: {
          type: 'string',
          enum: ['default', 'input', 'output'],
          description: 'React Flow node type. Defaults to default.',
        },
        x: { type: 'number', description: 'Optional canvas x position.' },
        y: { type: 'number', description: 'Optional canvas y position.' },
      },
      ['label'],
    ),
  },
  {
    name: 'link_shapes',
    description:
      'Link two existing shapes by their stable IDs. Use IDs returned by insert_shape or list_shapes.',
    parameters: objectSchema(
      {
        source_id: { type: 'string', description: 'Source shape ID.' },
        target_id: { type: 'string', description: 'Target shape ID.' },
        label: { type: 'string', description: 'Optional link label.' },
      },
      ['source_id', 'target_id'],
    ),
  },
  {
    name: 'move_shape',
    description: 'Move an existing shape to an absolute canvas position.',
    parameters: objectSchema(
      {
        shape_id: { type: 'string', description: 'Stable shape ID.' },
        x: { type: 'number', description: 'New canvas x position.' },
        y: { type: 'number', description: 'New canvas y position.' },
      },
      ['shape_id', 'x', 'y'],
    ),
  },
];

/** The four tools, bound to this conversation's live canvas. */
export function pageReactFlowTools(): FrontendToolDefinition[] {
  return definitions.map(definition => ({
    ...definition,
    handler: async (args: Record<string, unknown>) => {
      await PAGE_REACT_FLOW.sync(
        PAGE_TOOL_RESULTS.callsOf(REACT_FLOW_TOOL_NAMES),
      );
      const answer = await runReactFlowTool(
        PAGE_REACT_FLOW.read(),
        definition.name,
        args ?? {},
      );
      if (
        answer.ok === true &&
        REACT_FLOW_WRITE_TOOL_NAMES.includes(
          definition.name as (typeof REACT_FLOW_WRITE_TOOL_NAMES)[number],
        )
      ) {
        PAGE_REACT_FLOW.touch();
      }
      return answer;
    },
  }));
}

/** Add a shape drawn by the person, using the same stable ID sequence. */
export function addUserShape(position: XYPosition): string {
  const flow = PAGE_REACT_FLOW.read();
  const id = `shape-${flow.nextShape++}`;
  flow.nodes.push({
    id,
    position,
    data: { label: `Shape ${flow.nextShape - 1}` },
  });
  PAGE_REACT_FLOW.touch();
  return id;
}

/** Replace the live elements after the person drags, deletes, or links them. */
export function setUserFlow(
  nodes: Node<ReactFlowShapeData>[],
  edges: Edge[],
): void {
  const flow = PAGE_REACT_FLOW.read();
  flow.nodes = nodes;
  flow.edges = edges;
  PAGE_REACT_FLOW.touch();
}

/** Link shapes through React Flow's handles, with an ID the tools can read. */
export function addUserLink(source: string, target: string): string {
  const flow = PAGE_REACT_FLOW.read();
  const id = `link-${flow.nextLink++}`;
  flow.edges.push({ id, source, target });
  PAGE_REACT_FLOW.touch();
  return id;
}
