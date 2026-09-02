/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Which editor the selector last asked for, shared with the command.
 *
 * The chat owns the surface actually on screen; this store holds only the
 * *request* — what was last chosen from the selector or the `/editor` command
 * — plus the options the selector last saw, so the command can cycle through
 * them from outside React. It deliberately does not try to mirror the chat's
 * resolved state: the selector disables what cannot open, which keeps request
 * and reality from drifting far, and the chat remains the one owner of what is
 * actually shown.
 *
 * @module loop/plugins/editors/editorChoice
 */

import { requestSurface } from '../../core';

/** The choice that means "just the conversation". */
export const NONE_EDITOR = 'none';

type EditorChoiceState = {
  /** What was last asked for: `'none'` or a surface id. */
  editorId: string;
  /** Surface ids on offer, in display order. `'none'` is implicit and first. */
  options: readonly string[];
};

let state: EditorChoiceState = { editorId: NONE_EDITOR, options: [] };
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of [...listeners]) {
    listener();
  }
}

/** The current request and options, for `useSyncExternalStore` and commands. */
export function getEditorChoice(): EditorChoiceState {
  return state;
}

/** Subscribe to changes. Returns the unsubscribe. */
export function subscribeEditorChoice(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * What the selector has to offer, published each time the contributions
 * change. The command cycles over this list, which is how it knows the
 * editors without being able to read contributions from outside React.
 */
export function setEditorOptions(options: readonly string[]): void {
  if (
    options.length === state.options.length &&
    options.every((id, index) => id === state.options[index])
  ) {
    return;
  }
  state = { ...state, options };
  notify();
}

/**
 * Ask for an editor — `'none'` closes whatever is open.
 *
 * The request goes through the chat's surface channel: the chat stays the one
 * owner of what is beside the conversation, and this store only remembers
 * what was asked.
 *
 * @returns whether a chat was listening — `false` means no chat is mounted,
 *   and the caller should say so rather than assume it worked.
 */
export function chooseEditor(editorId: string): boolean {
  state = { ...state, editorId };
  notify();
  return requestSurface(editorId);
}

/**
 * Start the store on an editor without asking the chat for it.
 *
 * For the plugin's `build` phase: the chat's own `defaultSurface` is what
 * actually opens the editor when the workspace mounts, and this only makes
 * the selector agree with it from the first paint.
 */
export function seedEditorChoice(editorId: string): void {
  if (state.editorId === editorId) {
    return;
  }
  state = { ...state, editorId };
  notify();
}

/** The choice after the current one, wrapping through `'none'`. */
export function nextEditor(): string {
  const all = [NONE_EDITOR, ...state.options];
  const index = all.indexOf(state.editorId);
  return all[(index + 1) % all.length];
}
