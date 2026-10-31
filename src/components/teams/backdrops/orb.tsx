/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The `orb` backdrop: each member drawn as Datalayer's orb — the design
 * library's `SvgAvatarOrb` in its theme tone (`SvgAvatarOrbTheme` in the
 * design gallery), a sphere whose colours swirl inside it and act out what
 * the member is doing — tinted by the member's own colour (`member.color`,
 * by palette name, as `usePaletteColor` gives it), the theme's bright
 * colours when it has none. Its name and where it runs under it; a system
 * a ring with its mark; the links thin luminous lines with the light that
 * flows along them and their words, as on `space` (`luminousEdges`), on
 * the page's own ground, light or dark.
 *
 * The design library is loaded when an orb is first drawn
 * (`orbCharacters`' lazy `SvgAvatarOrb`), so a stage on another backdrop
 * never loads it. Under reduced motion the orb is still, as the design
 * library draws it, and the light stands at the end of its line.
 *
 * @module components/teams/backdrops/orb
 */

import type { JSX } from 'react';
import { memo, Suspense } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import { useColorPalette, usePaletteColor } from '@datalayer/primer-addons';
import type {
  AssistantCharacter,
  AssistantDrawingProps,
} from '../../../chat/assistant/characters';
import {
  SvgAvatarOrb,
  orbStateOf,
} from '../../../chat/assistant/orbCharacters';
import type {
  ConnectionData,
  MemberData,
  SceneBackdrop,
  SceneBackdropFace,
} from './types';
import {
  ConnectionNodeBase,
  MemberNodeBase,
  type ConnectionLook,
  type MemberLook,
} from './nodes';
import { HERO_LAYOUT } from './hero';
import { luminousEdges } from './space';
import { sceneBackdropChoice } from './catalogue';

const NODE_WIDTH = HERO_LAYOUT.nodeWidth;
const CONNECTION_WIDTH = HERO_LAYOUT.connectionWidth;

/** Two hex colours mixed: `share` of `other` in `colour`; a colour that is not a hex as it is. */
export function mixHex(colour: string, other: string, share: number): string {
  const hex = /^#([0-9a-f]{6})$/i;
  const a = hex.exec(colour);
  const b = hex.exec(other);
  if (!a || !b) {
    return colour;
  }
  const channel = (value: string, at: number) =>
    parseInt(value.slice(at, at + 2), 16);
  return `#${[0, 2, 4]
    .map(at =>
      Math.round(channel(a[1], at) * (1 - share) + channel(b[1], at) * share)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/**
 * A member's orb: the theme's orb, its three colours the member's own — as
 * it is, lighter, and deeper — when it has one.
 */
function MemberOrb({
  size,
  state,
  color,
}: AssistantDrawingProps & { color?: string }): JSX.Element {
  const theme = useColorPalette();
  const tint = usePaletteColor()(color);
  const palette = tint
    ? {
        ...theme,
        spark: tint,
        blaze: mixHex(tint, '#ffffff', 0.45),
        surge: mixHex(tint, '#000000', 0.3),
      }
    : theme;
  return (
    <Suspense
      fallback={
        <span
          aria-busy="true"
          style={{ display: 'block', width: size, height: size }}
        />
      }
    >
      <span data-scene-orb={tint ?? 'theme'} style={{ display: 'block' }}>
        <SvgAvatarOrb
          size={size}
          state={orbStateOf(state)}
          tone="theme"
          palette={palette}
        />
      </span>
    </Suspense>
  );
}

/** The orbs drawn so far, by member and colour: the same figure for the same member. */
const ORBS = new Map<string, AssistantCharacter>();

/** A member's orb, made once per member and colour. */
function orbFigure(member: SceneBackdropFace): AssistantCharacter {
  const key = `${member.id}\u0000${member.color ?? ''}`;
  let orb = ORBS.get(key);
  if (!orb) {
    const color = member.color;
    orb = {
      id: `scene-orb-${member.id}`,
      name: `${member.name}’s orb`,
      Drawing: props => <MemberOrb {...props} color={color} />,
    };
    ORBS.set(key, orb);
  }
  return orb;
}

const MEMBER_LOOK: MemberLook = {
  width: NODE_WIDTH,
  figure: orbFigure,
  name: {
    fontWeight: 600,
    textAlign: 'center',
    color: 'var(--scene-stage-fg)',
  },
  where: {
    fontSize: '11px',
    color: 'var(--scene-stage-muted)',
    textAlign: 'center',
  },
};

const CONNECTION_LOOK: ConnectionLook = {
  width: CONNECTION_WIDTH,
  mark: busy => ({
    borderRadius: '50%',
    border: '1.5px solid',
    borderColor: busy ? 'var(--scene-space-pop)' : 'var(--borderColor-default)',
    background: 'var(--bgColor-default)',
    boxShadow: busy
      ? '0 0 16px color-mix(in srgb, var(--scene-space-pop) 45%, transparent)'
      : 'none',
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

/** A member: its orb, its name and where it runs under it. */
export const OrbMemberNode = memo(function OrbMemberNode(
  props: NodeProps<Node<MemberData>>,
): JSX.Element | null {
  return <MemberNodeBase {...props} look={MEMBER_LOOK} />;
});

/** A system: a ring with its mark. */
export const OrbConnectionNode = memo(function OrbConnectionNode(
  props: NodeProps<Node<ConnectionData>>,
): JSX.Element | null {
  return <ConnectionNodeBase {...props} look={CONNECTION_LOOK} />;
});

const EDGES = luminousEdges({ words: true });

const NODE_TYPES = { member: OrbMemberNode, connection: OrbConnectionNode };
const EDGE_TYPES = { a2a: EDGES.LinkEdge, mcp: EDGES.CallEdge };

/** The page's own colours, from Primer's tokens: the lines in the accent, a system's in *done*. */
const ORB_COLOURS = {
  '--scene-stage-bg': 'var(--bgColor-default, #ffffff)',
  '--scene-stage-fg': 'var(--fgColor-default, #1f2328)',
  '--scene-stage-muted': 'var(--fgColor-muted, #656d76)',
  '--scene-space-glow': 'var(--fgColor-accent, #0969da)',
  '--scene-space-pop': 'var(--fgColor-done, #8250df)',
} as const;

/** The `orb` backdrop. */
export const ORB_BACKDROP: SceneBackdrop = {
  ...sceneBackdropChoice('orb'),
  figure: orbFigure,
  nodeTypes: NODE_TYPES,
  edgeTypes: EDGE_TYPES,
  theme: {
    light: { ...ORB_COLOURS },
    dark: { ...ORB_COLOURS },
    sx: {
      background:
        'radial-gradient(ellipse at 50% 40%, color-mix(in srgb, var(--fgColor-accent, #0969da) 8%, transparent), transparent 65%), var(--scene-stage-bg)',
      borderRadius: 2,
      color: 'var(--scene-stage-fg)',
    },
  },
  layout: HERO_LAYOUT,
};
