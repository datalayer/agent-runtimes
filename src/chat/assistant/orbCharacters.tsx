/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Datalayer's orb as the floating assistant's avatar: the design library's
 * `SvgAvatarOrb` (`@datalayer/design`), a sphere whose colours swirl inside
 * it, faster while a turn runs. Two of them, by its tone: `orb`, iridescent
 * (cyan, pink, lavender), and `orb-theme`, in the theme's own bright colours.
 *
 * The design library is loaded when an orb is first drawn, not when this
 * module is read: the characters' catalogue, the Canvas's toolbox and the
 * portable entry never reach it.
 *
 * @module chat/assistant/orbCharacters
 */

import { lazy, Suspense, type JSX } from 'react';
import type { AssistantCharacter, AssistantDrawingProps } from './characters';
import type { AssistantState } from './state';

/** The orb's tones, as the design library names them. */
export type AssistantOrbTone = 'iridescent' | 'theme';

/** The orb's own state: thinking while a turn runs, else idle. */
export function orbStateOf(
  state: AssistantState | undefined,
): 'idle' | 'thinking' {
  return state === 'thinking' || state === 'working' || state === 'speaking'
    ? 'thinking'
    : 'idle';
}

const SvgAvatarOrb = lazy(() =>
  import('@datalayer/design/lib/avatar/SvgAvatarOrb').then(module => ({
    default: module.SvgAvatarOrb,
  })),
);

function orbDrawing(tone: AssistantOrbTone) {
  return function OrbDrawing({
    size,
    state,
  }: AssistantDrawingProps): JSX.Element {
    return (
      <Suspense
        fallback={
          <span
            aria-busy="true"
            style={{ display: 'block', width: size, height: size }}
          />
        }
      >
        <span data-assistant-orb={tone} style={{ display: 'block' }}>
          <SvgAvatarOrb size={size} state={orbStateOf(state)} tone={tone} />
        </span>
      </Suspense>
    );
  };
}

/** The orb in each tone, in the order a picker shows them. */
export const ASSISTANT_ORB_CHARACTERS: readonly AssistantCharacter[] = [
  {
    id: 'orb',
    name: 'Orb',
    family: 'orb',
    Drawing: orbDrawing('iridescent'),
  },
  {
    id: 'orb-theme',
    name: 'Orb in the theme’s colours',
    family: 'orb',
    Drawing: orbDrawing('theme'),
  },
];
