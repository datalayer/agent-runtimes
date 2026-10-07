/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What the members of a team showed with their answers: components of the
 * catalog, drawn under the conversation (STUDIO H-02).
 *
 * A member that gives `application/json+a2ui` shows an A2UI surface beside
 * its words — the sources as cards that open (`Evidence`), a comparison as a
 * table, a series as a chart, a choice as buttons that answer the
 * application — one per artifact ({@link A2ATeamSurface}). Each is drawn
 * with the A2UI surface plugin's `InlineSurface`, Datalayer's catalog, in
 * the page's theme. A button pressed is the reader's answer to the member
 * that showed it: its words as the next request and its action beside them
 * (`pressedOf`, the `loop.action` the runtime reads), so that an option
 * that does more than read is decided by the member's rules — and refused
 * to a visitor in a sentence. What came back is said under the surface.
 *
 * This module is light: A2UI's renderer is in `AnswerSurfacesView`, loaded
 * only once a surface is drawn.
 *
 * @module components/teams/AnswerSurfaces
 */

import type { JSX } from 'react';
import { Suspense, lazy } from 'react';
import { Text } from '@primer/react';
import { answerAction } from '../../loop/plugins/a2ui-surface/toolResult';
import type { A2APeerAction } from '../../runtimes/browser/a2aPeer';
import type { A2ATeamSurface } from './useA2ATeam';

/** The renderer itself: A2UI and the catalog, loaded when a surface is drawn. */
const AnswerSurfacesView = lazy(() => import('./AnswerSurfacesView'));

/** A button pressed on a surface, as it is sent back: its words, and its action. */
export type AnswerPressed = {
  /** The reader's turn, in words: the option's label. */
  message: string;
  action: A2APeerAction;
  /** What choosing it does, as the option said: `read`, `send`, `write`… */
  does: string;
};

/**
 * What a button pressed on an answer's surface sends back, or `null` for an
 * action that is not one of an answer's buttons (a form's submission).
 */
export function pressedOf(action: {
  name: string;
  surfaceId: string;
  context?: Record<string, unknown>;
}): AnswerPressed | null {
  const pressed = answerAction(action);
  if (!pressed) {
    return null;
  }
  const { name, payload } = pressed.forwardedProps.loop.action;
  const does = typeof payload.does === 'string' ? payload.does : 'read';
  return { message: pressed.message, action: { name, payload }, does };
}

export type AnswerSurfacesProps = {
  /** The surfaces shown, in the order they came. */
  surfaces: A2ATeamSurface[];
  /** Each member's name, by its id: who showed a surface. */
  names?: Record<string, string>;
  /**
   * A button pressed on one of them: ask the member that showed it, and
   * answer what it said, in words, to be shown under the surface. A team's
   * `pressAction(surface.giver, pressed)` makes the press a turn of its
   * conversation too. A press that throws is said, and another is taken.
   */
  onPress?: (
    surface: A2ATeamSurface,
    pressed: AnswerPressed,
  ) => Promise<string | undefined>;
};

/** The surfaces the members showed, each under who showed it; nothing when there is none. */
export function AnswerSurfaces(props: AnswerSurfacesProps): JSX.Element | null {
  if (!props.surfaces.length) {
    return null;
  }
  return (
    <Suspense
      fallback={
        <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
          Drawing what it shows…
        </Text>
      }
    >
      <AnswerSurfacesView {...props} />
    </Suspense>
  );
}

export default AnswerSurfaces;
