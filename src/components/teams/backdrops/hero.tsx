/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The `hero` backdrop: the look of the home page's hero. Each member is a
 * round face — its emoji, its character drawn small in a ring, or its
 * initial — with its name under it; a system is a smaller ring with its
 * mark; a link is a thin straight line; and for each message a dot flies
 * along the line, out from the one that asks while it asks, back from the
 * one that answers while it answers (the flows of `a2aTeamFlow`), with a
 * fainter dot in its trail. The stage is tinted deep (`--scene-stage-bg`)
 * in the light mode and the dark one, its words in the stage's own colours.
 *
 * The balloon still opens on a face — the figure is `AssistantStage`'s, as
 * on `studio` — so a `hero` scene is asked the same way, and a screen
 * reader hears the same words: the edge keeps its `data-a2a-edge-flow` and
 * `data-mcp-edge-call`, and the words for the flow are the graph's.
 * Under reduced motion the dot stands at the end the message goes to.
 *
 * @module components/teams/backdrops/hero
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
import { Box } from '@datalayer/primer-addons';
import type { AssistantCharacter } from '../../../chat/assistant/characters';
import { prefersReducedMotion } from '../../../chat/assistant/avatar3dModel';
import type {
  CallData,
  ConnectionData,
  LinkData,
  MemberData,
  SceneBackdrop,
  SceneBackdropFace,
  SceneBackdropLayout,
} from './types';
import {
  ConnectionNodeBase,
  MemberNodeBase,
  type ConnectionLook,
  type MemberLook,
} from './nodes';
import { arrowPath, midpoint, straightPath, type Point } from './edges';
import { faceCharacter } from './faces';
import { EdgeHalo } from './halo';
import { sceneBackdropChoice } from './catalogue';

const NODE_WIDTH = 160;
const CONNECTION_WIDTH = 88;

/** The hero's layout: faces closer together than the studio's characters, a smaller ring beside each. */
export const HERO_LAYOUT: SceneBackdropLayout = {
  nodeWidth: NODE_WIDTH,
  gap: 200,
  rowGap: 40,
  // The face, its name and where it runs.
  memberHeight: size => size + 50,
  connectionScale: 0.5,
  connectionWidth: CONNECTION_WIDTH,
  connectionGap: 120,
  connectionsApart: 14,
  connectionHeight: size => size + 50,
  connectionsTop: size => size / 4,
  balloonRoom: 144,
};

/** The faces drawn so far, by member: the same figure for the same member. */
const FACES = new Map<string, AssistantCharacter>();

/** The member's face in a ring: made once per member, so the figure is not drawn anew. */
function heroFace(member: SceneBackdropFace): AssistantCharacter {
  const key = `${member.id}\u0000${member.emoji ?? ''}\u0000${typeof member.character === 'string' ? member.character : member.character.url}`;
  let face = FACES.get(key);
  if (!face) {
    face = faceCharacter(member, {
      id: `hero-face-${member.id}`,
      ring: {
        background: 'var(--scene-stage-node)',
        // The ring in the member's colour (`--scene-member`), else the stage's.
        boxShadow:
          '0 0 0 2px var(--scene-member, var(--scene-stage-ring)), 0 0 28px var(--scene-stage-glow)',
        color: 'var(--scene-stage-fg)',
      },
    });
    FACES.set(key, face);
  }
  return face;
}

const MEMBER_LOOK: MemberLook = {
  width: NODE_WIDTH,
  figure: heroFace,
  name: {
    fontWeight: 600,
    textAlign: 'center',
    color: 'var(--scene-stage-fg)',
    letterSpacing: '0.01em',
  },
  where: {
    fontSize: '11px',
    color: 'var(--scene-stage-muted)',
    textAlign: 'center',
  },
  // Its details' card in the stage's own colours, on the deep tint.
  details: {
    px: 2,
    py: 1,
    borderRadius: 2,
    border: '1px solid var(--scene-stage-ring)',
    background: 'var(--scene-stage-node)',
    boxShadow: '0 0 18px var(--scene-stage-glow)',
    fontSize: '12px',
    lineHeight: 1.5,
    color: 'var(--scene-stage-fg)',
    textAlign: 'left',
    whiteSpace: 'normal',
    minWidth: 160,
    maxWidth: 280,
  },
};

const CONNECTION_LOOK: ConnectionLook = {
  width: CONNECTION_WIDTH,
  mark: busy => ({
    borderRadius: '50%',
    border: '1.5px solid',
    borderColor: busy ? 'var(--scene-stage-dot)' : 'var(--scene-stage-ring)',
    background: 'var(--scene-stage-node)',
    boxShadow: busy ? '0 0 18px var(--scene-stage-glow)' : 'none',
  }),
  markScale: 0.58,
  label: {
    fontWeight: 600,
    fontSize: 1,
    textAlign: 'center',
    color: 'var(--scene-stage-fg)',
  },
  via: {
    fontSize: '10px',
    color: 'var(--scene-stage-muted)',
    textAlign: 'center',
  },
  details: { fontSize: '10px', color: 'var(--scene-stage-muted)' },
};

/** A member: its face in a ring, and its name under it. */
export const HeroMemberNode = memo(function HeroMemberNode(
  props: NodeProps<Node<MemberData>>,
): JSX.Element | null {
  return <MemberNodeBase {...props} look={MEMBER_LOOK} />;
});

/** A system: a smaller ring with its mark. */
export const HeroConnectionNode = memo(function HeroConnectionNode(
  props: NodeProps<Node<ConnectionData>>,
): JSX.Element | null {
  return <ConnectionNodeBase {...props} look={CONNECTION_LOOK} />;
});

/** How long the dot takes from one end to the other, in seconds. */
const DOT_SECONDS = 1.4;

/**
 * The dot that flies along the edge: from the source to the target while
 * asking, back while answering, again and again while the flow lasts; a
 * fainter one a little behind it. Under reduced motion, a still dot at
 * the end the message goes to, with an arrowhead.
 */
function FlyingDot({
  source,
  target,
  forward,
}: {
  source: Point;
  target: Point;
  forward: boolean;
}): JSX.Element {
  const from = forward ? source : target;
  const to = forward ? target : source;
  if (prefersReducedMotion()) {
    return (
      <g data-scene-dot="still">
        <circle cx={to.x} cy={to.y} r={5} fill="var(--scene-stage-dot)" />
        <path
          d={arrowPath(source, target, forward, 10)}
          fill="var(--scene-stage-dot)"
        />
      </g>
    );
  }
  const path = straightPath(from, to);
  return (
    <g data-scene-dot={forward ? 'out' : 'back'}>
      <circle r={3.5} fill="var(--scene-stage-dot)" opacity={0.45}>
        <animateMotion
          dur={`${DOT_SECONDS}s`}
          begin="0.18s"
          repeatCount="indefinite"
          path={path}
        />
      </circle>
      <circle r={5} fill="var(--scene-stage-dot)" className="scene-hero-dot">
        <animateMotion
          dur={`${DOT_SECONDS}s`}
          repeatCount="indefinite"
          path={path}
        />
      </circle>
    </g>
  );
}

/** The words on an edge: `A2A` faint at rest, the flow's words while it carries a message. */
function EdgeWords({
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
        transform={`translate(-50%, 10px) translate(${at.x}px, ${at.y}px)`}
        pointerEvents="none"
        textAlign="center"
        whiteSpace="nowrap"
        fontSize="11px"
        fontFamily="mono"
        letterSpacing="0.04em"
        color={flowing ? 'var(--scene-stage-fg)' : 'var(--scene-stage-muted)'}
        {...rest}
      >
        {children}
      </Box>
    </EdgeLabelRenderer>
  );
}

/** A line at rest: in the colour of the member it reaches, softened, else the stage's. */
const lineTone = (color: string | undefined): string =>
  color
    ? `color-mix(in srgb, ${color} 70%, transparent)`
    : 'var(--scene-stage-line)';

/** The A2A link: a thin line, and the dot that flies along it. */
export const HeroLinkEdge = memo(function HeroLinkEdge({
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
      {data?.selected && (
        <EdgeHalo
          path={straightPath(source, target)}
          color="var(--scene-stage-glow)"
        />
      )}
      <BaseEdge
        id={id}
        path={straightPath(source, target)}
        style={{
          stroke: data?.selected
            ? 'var(--scene-stage-dot)'
            : lineTone(data?.color),
          strokeWidth: data?.selected ? 1.5 : 1,
          strokeDasharray: data?.connected ? undefined : '4 6',
          opacity: data?.connected ? 1 : 0.6,
        }}
      />
      {flow !== 'still' && (
        <g data-a2a-edge-flow={flow}>
          <FlyingDot
            source={source}
            target={target}
            forward={flow === 'asking'}
          />
        </g>
      )}
      <EdgeWords at={midpoint(source, target)} flowing={flow !== 'still'}>
        {data?.label}
      </EdgeWords>
    </>
  );
});

/** A member's link to a system: the same thin line, the dot out with the call and back with its result. */
export const HeroCallEdge = memo(function HeroCallEdge({
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
      {data?.selected && (
        <EdgeHalo
          path={straightPath(source, target)}
          color="var(--scene-stage-glow)"
        />
      )}
      <BaseEdge
        id={id}
        path={straightPath(source, target)}
        style={{
          stroke: data?.selected
            ? 'var(--scene-stage-dot)'
            : lineTone(data?.color),
          strokeWidth: data?.selected ? 1.5 : 1,
        }}
      />
      {flow !== 'still' && (
        <g data-mcp-edge-call={data?.calling} data-mcp-edge-flow={flow}>
          <FlyingDot
            source={source}
            target={target}
            forward={flow === 'asking'}
          />
        </g>
      )}
      <EdgeWords
        at={midpoint(source, target)}
        flowing={flow !== 'still'}
        data-mcp-edge-label=""
      >
        {data?.label}
      </EdgeWords>
    </>
  );
});

const NODE_TYPES = { member: HeroMemberNode, connection: HeroConnectionNode };
const EDGE_TYPES = { a2a: HeroLinkEdge, mcp: HeroCallEdge };

/** The `hero` backdrop. */
export const HERO_BACKDROP: SceneBackdrop = {
  ...sceneBackdropChoice('hero'),
  figure: heroFace,
  nodeTypes: NODE_TYPES,
  edgeTypes: EDGE_TYPES,
  theme: {
    // Deep in both modes: the space the faces float in. The words on it
    // are the stage's own, not the page's, so they read on the tint.
    light: {
      '--scene-stage-bg': '#101a33',
      '--scene-stage-fg': '#f0f4ff',
      '--scene-stage-muted': '#9aa8c7',
      '--scene-stage-line': 'rgba(190, 205, 240, 0.45)',
      '--scene-stage-node': '#1a2747',
      '--scene-stage-ring': 'rgba(190, 205, 240, 0.55)',
      '--scene-stage-dot': '#7cc4ff',
      '--scene-stage-glow': 'rgba(124, 196, 255, 0.35)',
    },
    dark: {
      '--scene-stage-bg': '#070b16',
      '--scene-stage-fg': '#e9eefb',
      '--scene-stage-muted': '#8a97b8',
      '--scene-stage-line': 'rgba(170, 190, 235, 0.4)',
      '--scene-stage-node': '#121a30',
      '--scene-stage-ring': 'rgba(170, 190, 235, 0.5)',
      '--scene-stage-dot': '#8fd0ff',
      '--scene-stage-glow': 'rgba(143, 208, 255, 0.4)',
    },
    sx: {
      background:
        'radial-gradient(ellipse at 50% 0%, rgba(124, 196, 255, 0.10), transparent 60%), var(--scene-stage-bg)',
      borderRadius: 2,
      color: 'var(--scene-stage-fg)',
    },
  },
  layout: HERO_LAYOUT,
};
