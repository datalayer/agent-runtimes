/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The `plain` backdrop: boxes and straight arrows, for a printout or a
 * slide. Each member is a box with its face — its emoji, its character
 * drawn small, or its initial — and its name and where it runs under it; a
 * system is a smaller box with its mark; a link is a straight line with an
 * arrowhead at the end the message goes to (the target's at rest). Nothing
 * moves: the state is said in words on the edge — `A2A · Sales asks
 * Accounting`, `MCP · Odoo answers` — as the graph words it. The page's
 * own colours, so it prints as the page does, on one page
 * (`break-inside: avoid`).
 *
 * @module components/teams/backdrops/plain
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
import type { AssistantCharacter } from '../../../chat/assistant/characters';
import type {
  A2ATeamGraphMember,
  CallData,
  ConnectionData,
  LinkData,
  MemberData,
  SceneBackdrop,
  SceneBackdropLayout,
  StageSx,
} from './types';
import {
  ConnectionNodeBase,
  MemberNodeBase,
  type ConnectionLook,
  type MemberLook,
} from './nodes';
import { arrowPath, midpoint, straightPath, type Point } from './edges';
import { faceCharacter } from './faces';

const NODE_WIDTH = 180;
const CONNECTION_WIDTH = 90;

/** The plain layout: as the studio's, a little tighter. */
export const PLAIN_LAYOUT: SceneBackdropLayout = {
  nodeWidth: NODE_WIDTH,
  gap: 200,
  rowGap: 40,
  memberHeight: size => size + 56,
  connectionScale: 0.5,
  connectionWidth: CONNECTION_WIDTH,
  connectionGap: 130,
  connectionsApart: 16,
  connectionHeight: size => size + 58,
  connectionsTop: size => size / 4,
  balloonRoom: 144,
};

/** The faces drawn so far, by member: the same figure for the same member. */
const FACES = new Map<string, AssistantCharacter>();

/** The member's face in a box: made once per member. */
function plainFace(member: A2ATeamGraphMember): AssistantCharacter {
  const key = `${member.id}\u0000${member.emoji ?? ''}\u0000${typeof member.character === 'string' ? member.character : member.character.url}`;
  let face = FACES.get(key);
  if (!face) {
    face = faceCharacter(member, {
      id: `plain-face-${member.id}`,
      ring: {
        borderRadius: 6,
        border: '1px solid var(--borderColor-default)',
        background: 'var(--bgColor-default)',
        color: 'var(--fgColor-default)',
      },
    });
    FACES.set(key, face);
  }
  return face;
}

const MEMBER_LOOK: MemberLook = {
  width: NODE_WIDTH,
  figure: plainFace,
  name: { fontWeight: 600, textAlign: 'center' },
  where: { fontSize: 0, color: 'fg.muted', textAlign: 'center' },
};

const CONNECTION_LOOK: ConnectionLook = {
  width: CONNECTION_WIDTH,
  mark: busy => ({
    borderRadius: 1,
    border: '1px solid',
    borderColor: busy ? 'fg.default' : 'border.default',
    bg: 'canvas.default',
  }),
  markScale: 0.6,
  label: { fontWeight: 600, fontSize: 1, textAlign: 'center' },
  via: { fontSize: '10px', color: 'fg.muted', textAlign: 'center' },
  details: { fontSize: '10px', color: 'fg.muted' },
};

/** A member: a box with its face, its name and where it runs. */
export const PlainMemberNode = memo(function PlainMemberNode(
  props: NodeProps<Node<MemberData>>,
): JSX.Element | null {
  return <MemberNodeBase {...props} look={MEMBER_LOOK} />;
});

/** A system: a smaller box with its mark. */
export const PlainConnectionNode = memo(function PlainConnectionNode(
  props: NodeProps<Node<ConnectionData>>,
): JSX.Element | null {
  return <ConnectionNodeBase {...props} look={CONNECTION_LOOK} />;
});

/** A straight line with an arrowhead at the end the message goes to. */
function Arrow({
  id,
  source,
  target,
  forward,
  flowing,
}: {
  id: string;
  source: Point;
  target: Point;
  forward: boolean;
  flowing: boolean;
}): JSX.Element {
  const stroke = flowing
    ? 'var(--fgColor-default)'
    : 'var(--borderColor-emphasis, var(--borderColor-default))';
  return (
    <>
      <BaseEdge
        id={id}
        path={straightPath(source, target)}
        style={{ stroke, strokeWidth: 1.5 }}
      />
      <path
        d={arrowPath(source, target, forward)}
        fill={stroke}
        data-scene-arrow={forward ? 'target' : 'source'}
      />
    </>
  );
}

/** The words on the edge: the state, in words, in a chip. */
function Words({
  at,
  flowing,
  children,
  ...rest
}: {
  at: Point;
  flowing: boolean;
  children: string | undefined;
  [data: `data-${string}`]: string;
}): JSX.Element {
  return (
    <EdgeLabelRenderer>
      <Box
        className="nodrag nopan"
        position="absolute"
        transform={`translate(-50%, 12px) translate(${at.x}px, ${at.y}px)`}
        pointerEvents="none"
        textAlign="center"
        whiteSpace="nowrap"
        {...rest}
      >
        <Label variant={flowing ? 'primary' : 'secondary'}>{children}</Label>
      </Box>
    </EdgeLabelRenderer>
  );
}

/** The A2A link: an arrow toward the peer, toward the entry while the peer answers, its state in words. */
export const PlainLinkEdge = memo(function PlainLinkEdge({
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
  return (
    <>
      <g data-a2a-edge-flow={flow}>
        <Arrow
          id={id}
          source={source}
          target={target}
          forward={flow !== 'answering'}
          flowing={flow !== 'still'}
        />
      </g>
      <Words at={midpoint(source, target)} flowing={flow !== 'still'}>
        {data?.label}
      </Words>
    </>
  );
});

/** A member's link to a system: the same arrow, the call's words on it. */
export const PlainCallEdge = memo(function PlainCallEdge({
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
  return (
    <>
      <g
        data-mcp-edge-flow={flow}
        {...(flow !== 'still' ? { 'data-mcp-edge-call': data?.calling } : {})}
      >
        <Arrow
          id={id}
          source={source}
          target={target}
          forward={flow !== 'answering'}
          flowing={flow !== 'still'}
        />
      </g>
      <Words
        at={midpoint(source, target)}
        flowing={flow !== 'still'}
        data-mcp-edge-label=""
      >
        {data?.label}
      </Words>
    </>
  );
});

const NODE_TYPES = { member: PlainMemberNode, connection: PlainConnectionNode };
const EDGE_TYPES = { a2a: PlainLinkEdge, mcp: PlainCallEdge };

/** The `plain` backdrop. */
export const PLAIN_BACKDROP: SceneBackdrop = {
  id: 'plain',
  name: 'Plain',
  description: 'Boxes and arrows, nothing moves: for a printout or a slide.',
  nodeTypes: NODE_TYPES,
  edgeTypes: EDGE_TYPES,
  theme: {
    light: {},
    dark: {},
    // On one page, when printed (`break-inside` is newer than the sx types).
    sx: {
      '@media print': { breakInside: 'avoid', pageBreakInside: 'avoid' },
    } as StageSx,
  },
  layout: PLAIN_LAYOUT,
};
