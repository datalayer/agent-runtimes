/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What a reader's choice of surface does to the chat's state.
 *
 * Every way of choosing — the footer's view icons ("Show the chat"), the
 * header's selector, the strip, `/editor` — arrives here. A choice is the
 * reader's own, so an editor that was closed while it waited to come back
 * (its sandbox not running yet) is no longer wanted: kept, it went on
 * filling the editor column, and "Show the chat" changed nothing on screen.
 * The shell's word for no surface (`'none'`) and the chat's (`''`) are one.
 *
 * @module apps/plugins/chat/surfaceChoice
 */

import { NONE_EDITOR } from '../shell/editorChoice';

/** The chat's own value for "no surface, just the conversation". */
export const NO_SURFACE = '';

/** The surface to show and the waiting one to forget, for a reader's choice. */
export function surfaceChoice(next: string): {
  surfaceId: string;
  suspendedId: null;
} {
  return {
    surfaceId: !next || next === NONE_EDITOR ? NO_SURFACE : next,
    suspendedId: null,
  };
}
