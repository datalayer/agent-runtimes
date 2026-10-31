/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The `studio` backdrop: the drawing every scene had first. Each member is
 * its character (`AssistantStage`), with its name and where it runs under
 * it; a connection is the server's mark in a bordered square, half a
 * member's size, with the system's name and `via MCP` under it; an edge is
 * a line that flows — moving dashes and an arrowhead at the end the message
 * goes to — with a chip saying `A2A` or `MCP` and, while it carries
 * something, the words for it. A reader who asks for no motion sees the
 * same thing without the movement: the arrow and the words.
 *
 * @module components/teams/backdrops/studio
 */

import type { JSX } from 'react';
import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { Label } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import type {
  CallData,
  ConnectionData,
  LinkData,
  MemberData,
  SceneBackdrop,
  SceneBackdropLayout,
} from './types';
import {
  ConnectionNodeBase,
  MemberNodeBase,
  type ConnectionLook,
  type MemberLook,
} from './nodes';
import { arrowPath, straightPath } from './edges';
import { EdgeHalo } from './halo';
import { sceneBackdropChoice } from './catalogue';

/** The graph's own coordinates: the members, and room above them for their balloons. */
const NODE_WIDTH = 200;
const GAP = 220;
const CONNECTION_WIDTH = NODE_WIDTH / 2;

/** The studio's layout: the entry and a peer 220 apart, a connection half a member's size to its right. */
export const STUDIO_LAYOUT: SceneBackdropLayout = {
  nodeWidth: NODE_WIDTH,
  gap: GAP,
  rowGap: 48,
  // The character, its name and where it runs.
  memberHeight: size => size + 56,
  connectionScale: 0.5,
  connectionWidth: CONNECTION_WIDTH,
  // Room for the MCP edge's words, as the A2A edge has room for its own.
  connectionGap: 140,
  connectionsApart: 16,
  // Its mark, its label and how it is reached (about 45px under the mark),
  // and room under it before the graph's edge.
  connectionHeight: size => size + 58,
  // The first one's mark level with the character's middle: a mark half
  // the character's size, so a quarter down.
  connectionsTop: size => size / 4,
  balloonRoom: 144,
};

const MEMBER_LOOK: MemberLook = {
  width: NODE_WIDTH,
  figure: member => member.character,
  name: { fontWeight: 600, textAlign: 'center' },
  where: { fontSize: 0, color: 'fg.muted', textAlign: 'center' },
};

const CONNECTION_LOOK: ConnectionLook = {
  width: CONNECTION_WIDTH,
  mark: busy => ({
    borderRadius: 2,
    border: '1px solid',
    borderColor: busy ? 'accent.emphasis' : 'border.default',
    bg: 'canvas.default',
  }),
  markScale: 0.66,
  label: { fontWeight: 600, fontSize: 1, textAlign: 'center' },
  via: { fontSize: '10px', color: 'fg.muted', textAlign: 'center' },
  details: { fontSize: '10px', color: 'fg.muted' },
};

/** A member: its character, its name and where it runs. */
export const MemberNode = memo(function MemberNode(
  props: NodeProps<Node<MemberData>>,
): JSX.Element | null {
  return <MemberNodeBase {...props} look={MEMBER_LOOK} />;
});

/** A connection of a member's: the server's mark, what it reaches, and how. */
export const ConnectionNode = memo(function ConnectionNode(
  props: NodeProps<Node<ConnectionData>>,
): JSX.Element | null {
  return <ConnectionNodeBase {...props} look={CONNECTION_LOOK} />;
});

/** The A2A link between two members: still, or flowing the way the message goes. */
export const LinkEdge = memo(function LinkEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}: EdgeProps<Edge<LinkData>>): JSX.Element {
  const flow = data?.flow ?? 'still';
  const source = { x: sourceX, y: sourceY };
  const target = { x: targetX, y: targetY };
  const path = straightPath(source, target);
  // The arrow at the end the message goes to, along the edge.
  const towardPeer = flow === 'asking';
  const arrow = arrowPath(source, target, towardPeer);
  return (
    <>
      {data?.selected && (
        <EdgeHalo path={path} color="var(--bgColor-accent-emphasis)" />
      )}
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: data?.connected
            ? 'var(--borderColor-accent-emphasis)'
            : 'var(--borderColor-muted)',
          strokeWidth: 2,
          strokeDasharray: data?.connected ? undefined : '6 6',
          opacity: flow === 'still' ? 0.6 : 0.25,
        }}
      />
      {flow !== 'still' && (
        <g data-a2a-edge-flow={flow}>
          <path
            d={path}
            fill="none"
            className={`a2a-team-flow a2a-team-flow-${flow}`}
            stroke="var(--fgColor-accent)"
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray="10 14"
          />
          <path d={arrow} fill="var(--fgColor-accent)" />
        </g>
      )}
      <EdgeLabelRenderer>
        <Box
          className="nodrag nopan"
          position="absolute"
          transform={`translate(-50%, 12px) translate(${(sourceX + targetX) / 2}px, ${(sourceY + targetY) / 2}px)`}
          pointerEvents="none"
          textAlign="center"
        >
          <Label variant={data?.connected ? 'accent' : 'secondary'}>
            {data?.label}
          </Label>
        </Box>
      </EdgeLabelRenderer>
    </>
  );
});

/**
 * A member's link to a connection, drawn as the A2A link is: still, flowing
 * toward the connection while a call runs, and back with its result.
 */
export const CallEdge = memo(function CallEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}: EdgeProps<Edge<CallData>>): JSX.Element {
  const flow = data?.flow ?? 'still';
  const source = { x: sourceX, y: sourceY };
  const target = { x: targetX, y: targetY };
  const path = straightPath(source, target);
  // The arrow at the end the call or its result goes to, along the edge.
  const arrow = arrowPath(source, target, flow === 'asking');
  return (
    <>
      {data?.selected && (
        <EdgeHalo path={path} color="var(--bgColor-accent-emphasis)" />
      )}
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: 'var(--borderColor-accent-emphasis)',
          strokeWidth: 2,
          opacity: flow === 'still' ? 0.6 : 0.25,
        }}
      />
      {flow !== 'still' && (
        <g data-mcp-edge-call={data?.calling} data-mcp-edge-flow={flow}>
          <path
            d={path}
            fill="none"
            className={`a2a-team-flow a2a-team-flow-${flow}`}
            stroke="var(--fgColor-accent)"
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray="10 14"
          />
          <path d={arrow} fill="var(--fgColor-accent)" />
        </g>
      )}
      <EdgeLabelRenderer>
        <Box
          className="nodrag nopan"
          position="absolute"
          transform={`translate(-50%, 12px) translate(${(sourceX + targetX) / 2}px, ${(sourceY + targetY) / 2}px)`}
          pointerEvents="none"
          textAlign="center"
          whiteSpace="nowrap"
          data-mcp-edge-label=""
        >
          <Label variant="accent">{data?.label}</Label>
        </Box>
      </EdgeLabelRenderer>
    </>
  );
});

const NODE_TYPES = { member: MemberNode, connection: ConnectionNode };
const EDGE_TYPES = { a2a: LinkEdge, mcp: CallEdge };

/** The `studio` backdrop. */
export const STUDIO_BACKDROP: SceneBackdrop = {
  ...sceneBackdropChoice('studio'),
  figure: MEMBER_LOOK.figure,
  nodeTypes: NODE_TYPES,
  edgeTypes: EDGE_TYPES,
  theme: {
    // The page's own colours: nothing of its own.
    light: {},
    dark: {},
    sx: {
      '@keyframes a2aTeamFlow': {
        from: { strokeDashoffset: 24 },
        to: { strokeDashoffset: 0 },
      },
      '& .a2a-team-flow-asking': {
        animation: 'a2aTeamFlow 0.6s linear infinite',
      },
      '& .a2a-team-flow-answering': {
        animation: 'a2aTeamFlow 0.6s linear infinite reverse',
      },
    },
  },
  layout: STUDIO_LAYOUT,
};
