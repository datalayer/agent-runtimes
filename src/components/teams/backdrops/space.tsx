/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The `space` backdrop: the look of the site's hero drawings (the design
 * repo's `Svg*Hero`). Behind the flow, a ground of fine dots, a faint grid,
 * a triangle mesh and rings, soft glows in its corners and dashed rings
 * about its middle; each member a glowing round mark with a halo and an
 * orbit, its name beside it in capitals — and nothing else: where it
 * runs, what it does, the systems it reaches show in a card on hover or
 * focus, kept open by a click on the name; each system a smaller mark
 * with its label, its card on its mark; each
 * link a thin luminous line, and for each message a light that flows along
 * it — out from the one that asks while it asks, back from the one that
 * answers while it answers (the flows of `a2aTeamFlow`).
 *
 * The colours are Primer's tokens — the accent for the agents and their
 * links, the *success* colour for the systems — on the page's own ground,
 * light or dark, so the stage reads in both modes as the hero drawings do.
 *
 * The balloon still opens on a mark — the figure is `AssistantStage`'s —
 * so a `space` scene is asked the same way, and a screen reader hears the
 * same words: the edge keeps its `data-a2a-edge-flow` and
 * `data-mcp-edge-call`. Under reduced motion the light stands at the end
 * the message goes to, with an arrowhead, and the orbits do not turn.
 *
 * @module components/teams/backdrops/space
 */

import type { JSX } from 'react';
import { memo, useId } from 'react';
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

// As wide as a figure at its usual size: a link leaves and reaches the
// node's sides, so it meets the mark's orbit, as the hero drawings' lines
// meet their nodes. The name is beside, outside the node.
const NODE_WIDTH = 96;
const CONNECTION_WIDTH = 96;
/** The mark's share of the figure: the rest is its halo and its orbit. */
const MARK_SCALE = 0.46;

/** `color-mix` of a colour with transparency: `mix('--scene-space-glow', 40)`. */
const mix = (variable: string, percent: number): string =>
  `color-mix(in srgb, var(${variable}) ${percent}%, transparent)`;

/** The space's layout: marks with room round them, the names beside. */
export const SPACE_LAYOUT: SceneBackdropLayout = {
  nodeWidth: NODE_WIDTH,
  gap: 220,
  rowGap: 48,
  // The figure alone: the name is beside it.
  memberHeight: size => size + 8,
  connectionScale: 0.42,
  connectionWidth: CONNECTION_WIDTH,
  connectionGap: 130,
  connectionsApart: 16,
  // The mark and its label: how it is reached is in its details.
  connectionHeight: size => size + 24,
  connectionsTop: size => size / 4,
  balloonRoom: 144,
};

/** The marks drawn so far, by member: the same figure for the same member. */
const MARKS = new Map<string, AssistantCharacter>();

/** The member's glowing mark in its orbit: made once per member. */
function spaceMark(member: SceneBackdropFace): AssistantCharacter {
  const key = `${member.id}\u0000${member.emoji ?? ''}\u0000${typeof member.character === 'string' ? member.character : member.character.url}`;
  let mark = MARKS.get(key);
  if (!mark) {
    mark = faceCharacter(member, {
      id: `space-mark-${member.id}`,
      scale: MARK_SCALE,
      ring: {
        background: `radial-gradient(circle at 50% 42%, ${mix('--scene-space-glow', 55)}, ${mix('--scene-space-glow', 16)} 72%)`,
        boxShadow: [
          `0 0 0 1.5px ${mix('--scene-space-glow', 80)}`,
          `0 0 0 9px ${mix('--scene-space-glow', 12)}`,
          `0 0 30px 8px ${mix('--scene-space-glow', 34)}`,
        ].join(', '),
        color: 'var(--scene-stage-fg)',
      },
      orbit: {
        border: `1px dashed ${mix('--scene-space-glow', 45)}`,
      },
    });
    MARKS.set(key, mark);
  }
  return mark;
}

/**
 * The card a compact node's details open in: on the stage's own ground,
 * a hairline in the node's colour and its glow, the hero drawings' mono.
 */
const card = (color: string) => ({
  px: 2,
  py: 1,
  borderRadius: 2,
  border: '1px solid',
  borderColor: mix(color, 55),
  background: `color-mix(in srgb, var(--scene-stage-bg) 88%, var(${color}))`,
  boxShadow: `0 0 18px ${mix(color, 28)}`,
  fontFamily: 'mono',
  fontSize: '11px',
  lineHeight: 1.5,
  color: 'var(--scene-stage-fg)',
  textAlign: 'left',
  whiteSpace: 'normal',
  minWidth: 160,
  maxWidth: 240,
  '&[data-member-details="kept"], &[data-connection-details="kept"]': {
    borderColor: `var(${color})`,
  },
});

const MEMBER_LOOK: MemberLook = {
  width: NODE_WIDTH,
  figure: spaceMark,
  // Just outside the orbit, which is the figure's whole size.
  beside: 0.56,
  name: {
    fontFamily: 'mono',
    fontWeight: 700,
    fontSize: '13px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--scene-space-glow)',
  },
  // Where it runs is in its details: the node is its mark and its name.
  where: false,
  details: card('--scene-space-glow'),
};

const CONNECTION_LOOK: ConnectionLook = {
  width: CONNECTION_WIDTH,
  mark: busy => ({
    borderRadius: '50%',
    border: '1px solid',
    borderColor: mix('--scene-space-pop', busy ? 90 : 60),
    background: `radial-gradient(circle, ${mix('--scene-space-pop', 30)}, ${mix('--scene-space-pop', 8)} 72%)`,
    boxShadow: busy
      ? `0 0 0 7px ${mix('--scene-space-pop', 14)}, 0 0 24px 4px ${mix('--scene-space-pop', 40)}`
      : `0 0 0 6px ${mix('--scene-space-pop', 8)}, 0 0 14px ${mix('--scene-space-pop', 22)}`,
  }),
  markScale: 0.56,
  label: {
    fontFamily: 'mono',
    fontWeight: 700,
    fontSize: '11px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    textAlign: 'center',
    color: 'var(--scene-space-pop)',
  },
  via: {
    fontFamily: 'mono',
    fontSize: '10px',
    color: 'var(--scene-stage-muted)',
    textAlign: 'center',
  },
  details: card('--scene-space-pop'),
  compact: true,
};

/** A member: its glowing mark in an orbit, and its name beside it. */
export const SpaceMemberNode = memo(function SpaceMemberNode(
  props: NodeProps<Node<MemberData>>,
): JSX.Element | null {
  return <MemberNodeBase {...props} look={MEMBER_LOOK} />;
});

/** A system: a smaller mark, in the systems' colour. */
export const SpaceConnectionNode = memo(function SpaceConnectionNode(
  props: NodeProps<Node<ConnectionData>>,
): JSX.Element | null {
  return <ConnectionNodeBase {...props} look={CONNECTION_LOOK} />;
});

/** How long the light takes from one end to the other, in seconds. */
const LIGHT_SECONDS = 1.6;

/**
 * The light that flows along the edge: a bright stretch of the line that
 * runs from the source to the target while asking, back while answering,
 * a glowing head before it. Under reduced motion, a still light at the end
 * the message goes to, with an arrowhead.
 */
function FlowingLight({
  source,
  target,
  forward,
  color,
}: {
  source: Point;
  target: Point;
  forward: boolean;
  /** The light's colour, a CSS variable's name: `--scene-space-glow`. */
  color: string;
}): JSX.Element {
  const from = forward ? source : target;
  const to = forward ? target : source;
  const fill = `var(${color})`;
  if (prefersReducedMotion()) {
    return (
      <g data-scene-light="still">
        <circle cx={to.x} cy={to.y} r={10} fill={mix(color, 22)} />
        <circle cx={to.x} cy={to.y} r={4} fill={fill} />
        <path d={arrowPath(source, target, forward, 10)} fill={fill} />
      </g>
    );
  }
  const path = straightPath(from, to);
  return (
    <g
      data-scene-light={forward ? 'out' : 'back'}
      style={{ filter: `drop-shadow(0 0 4px ${fill})` }}
    >
      <path
        d={path}
        pathLength={100}
        fill="none"
        stroke={fill}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray="16 84"
        opacity={0.85}
      >
        <animate
          attributeName="stroke-dashoffset"
          from="16"
          to="-84"
          dur={`${LIGHT_SECONDS}s`}
          repeatCount="indefinite"
        />
      </path>
      <circle r={9} fill={mix(color, 22)}>
        <animateMotion
          dur={`${LIGHT_SECONDS}s`}
          repeatCount="indefinite"
          path={path}
        />
      </circle>
      <circle r={3.5} fill={fill}>
        <animateMotion
          dur={`${LIGHT_SECONDS}s`}
          repeatCount="indefinite"
          path={path}
        />
      </circle>
    </g>
  );
}

/**
 * The words on an edge, in the hero drawings' monospace: faint at rest,
 * bright while it carries a message; above the line, as a member's name
 * beside its mark sits under the line to its systems.
 */
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
        transform={`translate(-50%, calc(-100% - 8px)) translate(${at.x}px, ${at.y}px)`}
        pointerEvents="none"
        textAlign="center"
        whiteSpace="nowrap"
        fontSize="10px"
        fontFamily="mono"
        letterSpacing="0.08em"
        color={flowing ? 'var(--scene-stage-fg)' : 'var(--scene-stage-muted)'}
        {...rest}
      >
        {children}
      </Box>
    </EdgeLabelRenderer>
  );
}

/** A thin luminous line: a soft glow under a fine stroke. */
function LuminousLine({
  id,
  path,
  color,
  selected,
  dashed,
  faint,
}: {
  id: string;
  path: string;
  color: string;
  selected: boolean;
  dashed?: string;
  faint?: boolean;
}): JSX.Element {
  return (
    <>
      {selected && <EdgeHalo path={path} color={`var(${color})`} />}
      <path
        d={path}
        fill="none"
        stroke={mix(color, 22)}
        strokeWidth={5}
        strokeLinecap="round"
        opacity={faint ? 0.4 : 1}
      />
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: selected ? `var(${color})` : mix(color, 75),
          strokeWidth: selected ? 1.6 : 1.1,
          strokeDasharray: dashed,
          opacity: faint ? 0.55 : 1,
          filter: `drop-shadow(0 0 2px ${mix(color, 60)})`,
        }}
      />
    </>
  );
}

/** The A2A link: a luminous line, and the light that flows along it. */
export const SpaceLinkEdge = memo(function SpaceLinkEdge({
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
      <LuminousLine
        id={id}
        path={straightPath(source, target)}
        color="--scene-space-glow"
        selected={Boolean(data?.selected)}
        dashed={data?.connected ? undefined : '2 7'}
        faint={!data?.connected}
      />
      {flow !== 'still' && (
        <g data-a2a-edge-flow={flow}>
          <FlowingLight
            source={source}
            target={target}
            forward={flow === 'asking'}
            color="--scene-space-glow"
          />
        </g>
      )}
      <EdgeWords at={midpoint(source, target)} flowing={flow !== 'still'}>
        {data?.label}
      </EdgeWords>
    </>
  );
});

/** A member's link to a system: a dashed luminous line, the light out with the call and back with its result. */
export const SpaceCallEdge = memo(function SpaceCallEdge({
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
      <LuminousLine
        id={id}
        path={straightPath(source, target)}
        color="--scene-space-pop"
        selected={Boolean(data?.selected)}
        dashed="4 4"
      />
      {flow !== 'still' && (
        <g data-mcp-edge-call={data?.calling} data-mcp-edge-flow={flow}>
          <FlowingLight
            source={source}
            target={target}
            forward={flow === 'asking'}
            color="--scene-space-pop"
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

/**
 * The ground behind the flow, as the hero drawings lay theirs: fine dots,
 * a grid, a triangle mesh and rings, glows in the corners and at the
 * middle, a diagonal shimmer, and dashed rings about the middle. Its
 * strength is the theme's (`--scene-space-*-alpha`): stronger on a light
 * page, where the hero drawings boost their alpha.
 */
export function SpaceGround(): JSX.Element {
  const uid = useId().replace(/:/g, '');
  const id = (name: string) => `space-${name}-${uid}`;
  const url = (name: string) => `url(#${id(name)})`;
  const glow = 'var(--scene-space-glow)';
  const pop = 'var(--scene-space-pop)';
  const surge = 'var(--scene-space-surge)';
  const alpha = (name: string) => `var(--scene-space-${name}-alpha)`;
  const radial = (
    name: string,
    color: string,
    cx: string,
    cy: string,
    r: string,
  ) => (
    <radialGradient id={id(name)} cx={cx} cy={cy} r={r}>
      <stop
        offset="0%"
        style={{ stopColor: color, stopOpacity: alpha('glow') }}
      />
      <stop
        offset="50%"
        style={{
          stopColor: color,
          stopOpacity: `calc(${alpha('glow')} * 0.3)`,
        }}
      />
      <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
    </radialGradient>
  );
  return (
    <Box
      aria-hidden="true"
      data-scene-ground="space"
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      overflow="hidden"
      borderRadius={2}
      pointerEvents="none"
    >
      <svg
        width="100%"
        height="100%"
        style={{ display: 'block' }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id={id('dots')}
            width="28"
            height="28"
            patternUnits="userSpaceOnUse"
          >
            <circle
              cx="1"
              cy="1"
              r="0.9"
              style={{ fill: glow, opacity: alpha('dots') }}
            />
          </pattern>
          <pattern
            id={id('grid')}
            width="42"
            height="42"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M42 0H0V42"
              fill="none"
              strokeWidth="0.7"
              style={{ stroke: glow, strokeOpacity: alpha('grid') }}
            />
          </pattern>
          <pattern
            id={id('mesh')}
            width="48"
            height="42"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(5)"
          >
            <polygon
              points="24,0 48,42 0,42"
              fill="none"
              strokeWidth="0.5"
              style={{ stroke: glow, strokeOpacity: alpha('mesh') }}
            />
            <polygon
              points="24,42 48,0 0,0"
              fill="none"
              strokeWidth="0.4"
              style={{
                stroke: surge,
                strokeOpacity: `calc(${alpha('mesh')} * 0.7)`,
              }}
            />
          </pattern>
          <pattern
            id={id('rings')}
            width="60"
            height="60"
            patternUnits="userSpaceOnUse"
          >
            <circle
              cx="30"
              cy="30"
              r="19"
              fill="none"
              strokeWidth="0.4"
              style={{ stroke: surge, strokeOpacity: alpha('rings') }}
            />
            <circle
              cx="30"
              cy="30"
              r="10"
              fill="none"
              strokeWidth="0.35"
              style={{
                stroke: glow,
                strokeOpacity: `calc(${alpha('rings')} * 0.8)`,
              }}
            />
          </pattern>
          {radial('core', glow, '50%', '50%', '45%')}
          {radial('left', pop, '14%', '26%', '40%')}
          {radial('right', surge, '86%', '26%', '40%')}
          {radial('bottom-left', surge, '20%', '82%', '38%')}
          {radial('bottom-right', pop, '82%', '82%', '38%')}
          <linearGradient
            id={id('shimmer')}
            x1="0.05"
            y1="0.92"
            x2="0.95"
            y2="0.08"
          >
            <stop offset="0%" style={{ stopColor: surge, stopOpacity: 0 }} />
            <stop
              offset="30%"
              style={{
                stopColor: surge,
                stopOpacity: `calc(${alpha('glow')} * 0.25)`,
              }}
            />
            <stop
              offset="50%"
              style={{
                stopColor: glow,
                stopOpacity: `calc(${alpha('glow')} * 0.35)`,
              }}
            />
            <stop
              offset="74%"
              style={{
                stopColor: pop,
                stopOpacity: `calc(${alpha('glow')} * 0.25)`,
              }}
            />
            <stop offset="100%" style={{ stopColor: pop, stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill={url('dots')} />
        <rect width="100%" height="100%" fill={url('grid')} />
        <rect width="100%" height="100%" fill={url('mesh')} />
        <rect width="100%" height="100%" fill={url('rings')} />
        <rect width="100%" height="100%" fill={url('core')} />
        <rect width="100%" height="100%" fill={url('left')} />
        <rect width="100%" height="100%" fill={url('right')} />
        <rect width="100%" height="100%" fill={url('bottom-left')} />
        <rect width="100%" height="100%" fill={url('bottom-right')} />
        <rect width="100%" height="100%" fill={url('shimmer')} />
        {/* Wide diagonal bands of light, as across the hero drawings. */}
        {[
          ['12%', '46%', glow, 34],
          ['40%', '74%', pop, 28],
          ['66%', '100%', glow, 30],
        ].map(([from, to, stroke, width]) => (
          <line
            key={String(from)}
            x1={from}
            y1="0"
            x2={to}
            y2="100%"
            strokeWidth={width}
            style={{ stroke: String(stroke), strokeOpacity: alpha('band') }}
          />
        ))}
        {/* Dashed rings about the middle, as round the hero's core. */}
        <g style={{ stroke: glow }} fill="none">
          <circle
            cx="50%"
            cy="50%"
            r="190"
            strokeWidth="1.2"
            strokeDasharray="8 6"
            style={{ strokeOpacity: `calc(${alpha('rings')} * 2.4)` }}
          />
          <circle
            cx="50%"
            cy="50%"
            r="140"
            strokeWidth="1"
            strokeDasharray="5 4"
            style={{ strokeOpacity: `calc(${alpha('rings')} * 3)` }}
          />
          <circle
            cx="50%"
            cy="50%"
            r="96"
            strokeWidth="1"
            style={{ strokeOpacity: `calc(${alpha('rings')} * 3.6)` }}
          />
        </g>
        {/* A few stray stars, as the hero drawings scatter them. */}
        {[
          ['4%', '12%', glow],
          ['18%', '90%', pop],
          ['36%', '9%', surge],
          ['66%', '11%', glow],
          ['83%', '86%', pop],
          ['96%', '78%', surge],
          ['52%', '94%', glow],
        ].map(([cx, cy, fill]) => (
          <circle
            key={`${cx}${cy}`}
            cx={cx}
            cy={cy}
            r="1.6"
            style={{ fill, opacity: alpha('stars') }}
          />
        ))}
      </svg>
    </Box>
  );
}

const NODE_TYPES = { member: SpaceMemberNode, connection: SpaceConnectionNode };
const EDGE_TYPES = { a2a: SpaceLinkEdge, mcp: SpaceCallEdge };

/** The colours, from Primer's tokens: the page's ground, the accent for the agents, *done* for the systems. */
const SPACE_COLOURS = {
  '--scene-stage-fg': 'var(--fgColor-default, #1f2328)',
  '--scene-stage-muted': 'var(--fgColor-muted, #656d76)',
  '--scene-space-glow': 'var(--fgColor-accent, #0969da)',
  '--scene-space-pop': 'var(--fgColor-success, #1a7f37)',
  // The hero drawings' blue, beside the theme's accent: Primer's display blue.
  '--scene-space-surge': 'var(--display-blue-fgColor, var(--fgColor-accent))',
} as const;

/** The `space` backdrop. */
export const SPACE_BACKDROP: SceneBackdrop = {
  ...sceneBackdropChoice('space'),
  figure: spaceMark,
  nodeTypes: NODE_TYPES,
  edgeTypes: EDGE_TYPES,
  ground: SpaceGround,
  theme: {
    // The page's own ground, light or dark; the hero drawings boost their
    // alpha on a light page, so the ground's strokes are stronger there.
    light: {
      ...SPACE_COLOURS,
      '--scene-stage-bg': 'var(--bgColor-muted, #f6f8fa)',
      '--scene-space-dots-alpha': '0.45',
      '--scene-space-grid-alpha': '0.2',
      '--scene-space-mesh-alpha': '0.18',
      '--scene-space-rings-alpha': '0.12',
      '--scene-space-glow-alpha': '0.62',
      '--scene-space-band-alpha': '0.1',
      '--scene-space-stars-alpha': '0.7',
    },
    dark: {
      ...SPACE_COLOURS,
      '--scene-stage-bg': 'var(--bgColor-inset, #010409)',
      '--scene-space-dots-alpha': '0.32',
      '--scene-space-grid-alpha': '0.1',
      '--scene-space-mesh-alpha': '0.1',
      '--scene-space-rings-alpha': '0.08',
      '--scene-space-glow-alpha': '0.42',
      '--scene-space-band-alpha': '0.08',
      '--scene-space-stars-alpha': '0.6',
    },
    sx: {
      background: 'var(--scene-stage-bg)',
      borderRadius: 2,
      color: 'var(--scene-stage-fg)',
      '@keyframes sceneSpaceOrbit': {
        from: { transform: 'rotate(0deg)' },
        to: { transform: 'rotate(360deg)' },
      },
      // A member at work turns its orbit; at rest it stands still.
      '& [data-member-state="thinking"] [data-scene-orbit], & [data-member-state="working"] [data-scene-orbit], & [data-member-state="speaking"] [data-scene-orbit]':
        { animation: 'sceneSpaceOrbit 12s linear infinite' },
      '@media (prefers-reduced-motion: reduce)': {
        '& [data-scene-orbit]': { animation: 'none' },
      },
      // A node whose card is open stands over the others; the one hovered
      // or focused over every one, so its card is read whole.
      '& .react-flow__node:has([data-member-details]:not([hidden])), & .react-flow__node:has([data-connection-details]:not([hidden]))':
        { zIndex: '10 !important' },
      '& .react-flow__node:hover, & .react-flow__node:focus-within': {
        zIndex: '11 !important',
      },
    },
  },
  layout: SPACE_LAYOUT,
};
