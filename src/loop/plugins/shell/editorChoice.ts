/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The editor choice, in the loop's vocabulary.
 *
 * The store itself lives in `@datalayer/reactor-shell` now — the loop's
 * editor selector grew into the generic shell plugin, and this module is the
 * thin dictionary between the two: `editor` here is `view` there. Kept so
 * everything written against the loop's names (the `/editor` command, the
 * tests, the barrel) reads unchanged.
 *
 * The one behavioural difference from the old local store is deliberate:
 * `chooseEditor` no longer calls the chat's surface channel itself — the
 * generic store announces every choice through the announcer the loop's
 * shell plugin installs, which is wired to `requestSurface`. One path,
 * whether the choice came from the selector, `/editor`, or the generic
 * cycle command.
 *
 * @module loop/plugins/shell/editorChoice
 */

import {
  NONE_VIEW,
  chooseView,
  getViewChoice,
  nextView,
  seedViewChoice,
  setViewAnnouncer,
  setViewOptions,
  subscribeViewChoice,
} from '@datalayer/reactor-shell';
import { requestSurface } from '../../core/surfaceRequests';

/*
 * Wired at import, not only at plugin start: the `/editor` command is a
 * plain contribution that can be run without a reactor around it — the tests
 * do, and so does anything driving commands headlessly — and a choice that
 * silently announced to nobody would look exactly like the bug the surface
 * channel exists to prevent. The loop shell plugin installs the same
 * announcer again when it registers, which is idempotent by construction.
 */
setViewAnnouncer(requestSurface);

/** The choice that means "just the conversation". */
export const NONE_EDITOR = NONE_VIEW;

/** The current request and options, in loop names. */
export function getEditorChoice(): {
  editorId: string;
  options: readonly string[];
} {
  const { viewId, options } = getViewChoice();
  return { editorId: viewId, options };
}

export const subscribeEditorChoice = subscribeViewChoice;
export const setEditorOptions = setViewOptions;
export const chooseEditor = chooseView;
export const seedEditorChoice = seedViewChoice;
export const nextEditor = nextView;
