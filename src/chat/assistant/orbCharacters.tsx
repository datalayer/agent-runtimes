/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Datalayer's orb as the floating assistant's avatar: the design library's
 * `SvgAvatarOrb` (`@datalayer/design`), a sphere whose colours swirl inside
 * it, in the theme's own bright colours, acting out each of the assistant's
 * states (greeting, thinking, working, waiting, speaking, paused, goodbye)
 * as the design library draws them. One orb, `orb`: the iridescent one was
 * dropped (27 October 2026), the themed one kept and named Orb.
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

/** The orb's state: the assistant's own, idle when it has none. */
export function orbStateOf(state: AssistantState | undefined): AssistantState {
  return state ?? 'idle';
}

/**
 * The design library's orb, loaded when one is first drawn: the
 * assistant's, and the `orb` backdrop's members (`backdrops/orb`).
 */
export const SvgAvatarOrb = lazy(() =>
  import('@datalayer/design/lib/avatar/SvgAvatarOrb').then(module => ({
    default: module.SvgAvatarOrb,
  })),
);

function OrbDrawing({ size, state }: AssistantDrawingProps): JSX.Element {
  return (
    <Suspense
      fallback={
        <span
          aria-busy="true"
          style={{ display: 'block', width: size, height: size }}
        />
      }
    >
      <span data-assistant-orb="theme" style={{ display: 'block' }}>
        <SvgAvatarOrb size={size} state={orbStateOf(state)} tone="theme" />
      </span>
    </Suspense>
  );
}

/** The orb, as a picker shows it. */
export const ASSISTANT_ORB_CHARACTERS: readonly AssistantCharacter[] = [
  {
    id: 'orb',
    name: 'Orb',
    family: 'orb',
    Drawing: OrbDrawing,
  },
];
