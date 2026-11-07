/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The `minimal` backdrop: the scene reduced to light. Each member is a
 * glowing circle in its own colour (`member.color`, by palette name, as
 * `usePaletteColor` gives it) and nothing else — no name, no face, no
 * words under it; a system a smaller, dimmer circle; the links thin lines,
 * and for each message a light that flows along the line, as on `space`
 * (`luminousEdges`, without their words). The ground is dark in the light
 * mode and the dark one alike: a stage, deliberately, with almost nothing
 * on it.
 *
 * What the circles do not say, their details do: hovered or focused, a
 * circle's card peeks with its name, where it runs, what it is doing and
 * the systems it reaches; a click on the circle keeps it open (the figure
 * says `aria-expanded`), a second click or Escape closes it. Its balloon
 * still opens when it speaks, and from its menu. Under reduced motion the
 * light stands at the end the message goes to, and no circle pulses.
 *
 * @module components/teams/backdrops/minimal
 */

import type { JSX } from 'react';
import { memo } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import type {
  AssistantCharacter,
  AssistantDrawingProps,
} from '../../../chat/assistant/characters';
import type {
  ConnectionData,
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
import { luminousEdges } from './space';
import { sceneBackdropChoice } from './catalogue';

// Narrow nodes: a link leaves and reaches a node's sides, so it meets the
// circle rather than stopping short of it.
const NODE_WIDTH = 36;
const CONNECTION_WIDTH = 28;
/** The circle's share of the figure: the rest is its glow. */
const CIRCLE_SCALE = 0.3;

/** A member's colour: its own (`--scene-member`, from its spec), else the stage's glow. */
const MEMBER = 'var(--scene-member, var(--scene-space-glow))';

/** `color-mix` of a colour with transparency. */
const mix = (color: string, percent: number): string =>
  `color-mix(in srgb, ${color} ${percent}%, transparent)`;

/** The minimal layout: the circles, and room between them. */
export const MINIMAL_LAYOUT: SceneBackdropLayout = {
  nodeWidth: NODE_WIDTH,
  gap: 240,
  rowGap: 56,
  memberHeight: size => size,
  connectionScale: 0.34,
  connectionWidth: CONNECTION_WIDTH,
  connectionGap: 140,
  connectionsApart: 20,
  connectionHeight: size => size,
  connectionsTop: size => size / 3,
  balloonRoom: 144,
};

/** A glowing circle in the member's colour, in the middle of its figure. */
function Circle({ size }: AssistantDrawingProps): JSX.Element {
  const diameter = Math.max(10, Math.round(size * CIRCLE_SCALE));
  return (
    <span
      data-scene-circle=""
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
      }}
    >
      <span
        aria-hidden="true"
        data-scene-circle-light=""
        style={{
          width: diameter,
          height: diameter,
          borderRadius: '50%',
          background: `radial-gradient(circle at 42% 38%, ${mix('#ffffff', 85)} 0%, ${MEMBER} 42%, ${mix(MEMBER, 55)} 100%)`,
          boxShadow: [
            `0 0 ${Math.round(diameter * 0.5)}px ${MEMBER}`,
            `0 0 ${Math.round(diameter * 1.4)}px ${Math.round(diameter * 0.35)}px ${mix(MEMBER, 40)}`,
          ].join(', '),
        }}
      />
    </span>
  );
}

/** Every member's figure: the circle, coloured by the member's node (`--scene-member`). */
const CIRCLE: AssistantCharacter = {
  id: 'scene-minimal-circle',
  name: 'a glowing circle',
  Drawing: Circle,
};

const MEMBER_LOOK: MemberLook = {
  width: NODE_WIDTH,
  figure: () => CIRCLE,
  // The circle alone: its name and the rest are in its details.
  name: false,
  where: false,
  figureKeeps: true,
  details: {
    px: 2,
    py: 1,
    borderRadius: 2,
    border: '1px solid',
    borderColor: mix(MEMBER, 55),
    background: 'color-mix(in srgb, var(--scene-stage-bg) 90%, #ffffff)',
    boxShadow: `0 0 18px ${mix(MEMBER, 25)}`,
    fontFamily: 'mono',
    fontSize: '11px',
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
    border: 0,
    background: `radial-gradient(circle at 42% 38%, ${mix('#ffffff', 60)} 0%, var(--scene-space-pop) 45%, ${mix('var(--scene-space-pop)', 40)} 100%)`,
    boxShadow: busy
      ? `0 0 14px var(--scene-space-pop), 0 0 30px 6px ${mix('var(--scene-space-pop)', 45)}`
      : `0 0 10px ${mix('var(--scene-space-pop)', 70)}`,
    opacity: busy ? 1 : 0.75,
  }),
  markScale: 0,
  label: false,
  via: {},
  details: {
    px: 2,
    py: 1,
    borderRadius: 2,
    border: '1px solid',
    borderColor: mix('var(--scene-space-pop)', 55),
    background: 'color-mix(in srgb, var(--scene-stage-bg) 90%, #ffffff)',
    fontFamily: 'mono',
    fontSize: '11px',
    lineHeight: 1.5,
    color: 'var(--scene-stage-fg)',
    textAlign: 'left',
    whiteSpace: 'normal',
  },
  compact: true,
};

/** A member: its glowing circle, nothing more. */
export const MinimalMemberNode = memo(function MinimalMemberNode(
  props: NodeProps<Node<MemberData>>,
): JSX.Element | null {
  return <MemberNodeBase {...props} look={MEMBER_LOOK} />;
});

/** A system: a smaller, dimmer circle. */
export const MinimalConnectionNode = memo(function MinimalConnectionNode(
  props: NodeProps<Node<ConnectionData>>,
): JSX.Element | null {
  return <ConnectionNodeBase {...props} look={CONNECTION_LOOK} />;
});

const EDGES = luminousEdges({ words: false });
/** The A2A link: a thin line, and the light that flows along it; no words. */
export const MinimalLinkEdge = EDGES.LinkEdge;
/** A member's link to a system: the same, dashed. */
export const MinimalCallEdge = EDGES.CallEdge;

const NODE_TYPES = {
  member: MinimalMemberNode,
  connection: MinimalConnectionNode,
};
const EDGE_TYPES = { a2a: MinimalLinkEdge, mcp: MinimalCallEdge };

/** Dark in both modes: the stage is its own, not the page's. */
const MINIMAL_COLOURS = {
  '--scene-stage-bg': '#05070d',
  '--scene-stage-fg': '#e6ecf7',
  '--scene-stage-muted': '#8792a8',
  '--scene-space-glow': '#8fd3ff',
  '--scene-space-pop': '#b8a6ff',
} as const;

/** The `minimal` backdrop. */
export const MINIMAL_BACKDROP: SceneBackdrop = {
  ...sceneBackdropChoice('minimal'),
  figure: () => CIRCLE,
  nodeTypes: NODE_TYPES,
  edgeTypes: EDGE_TYPES,
  theme: {
    light: { ...MINIMAL_COLOURS },
    dark: { ...MINIMAL_COLOURS },
    sx: {
      // Almost nothing on it: the faintest light at its middle.
      background:
        'radial-gradient(ellipse at 50% 45%, rgba(130, 170, 255, 0.07), transparent 65%), var(--scene-stage-bg)',
      borderRadius: 2,
      color: 'var(--scene-stage-fg)',
      '@keyframes sceneMinimalPulse': {
        '0%, 100%': { transform: 'scale(1)' },
        '50%': { transform: 'scale(1.18)' },
      },
      // A member at work breathes; at rest it stands still.
      '& [data-member-state="thinking"] [data-scene-circle-light], & [data-member-state="working"] [data-scene-circle-light], & [data-member-state="speaking"] [data-scene-circle-light]':
        { animation: 'sceneMinimalPulse 2.4s ease-in-out infinite' },
      '@media (prefers-reduced-motion: reduce)': {
        '& [data-scene-circle-light]': { animation: 'none' },
      },
    },
  },
  layout: MINIMAL_LAYOUT,
};
