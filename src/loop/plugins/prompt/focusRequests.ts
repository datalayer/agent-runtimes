/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Asking the floating prompt to take focus, from outside React.
 *
 * The prompt's focus lives in a DOM node the component owns, and a command
 * runs outside the component tree — the same gap `surfaceRequests` bridges for
 * the chat, bridged the same way: a command asks, the mounted prompt answers,
 * and nobody gains a handle on the input itself. `focusPrompt` reports whether
 * anything was listening, so the command can say "no prompt is on screen"
 * rather than appearing to work.
 *
 * @module loop/plugins/prompt/focusRequests
 */

const listeners = new Set<() => void>();

/**
 * Ask the prompt to focus.
 *
 * @returns whether anything was listening — `false` means no floating prompt
 *   is mounted, and the caller should say so rather than assume it worked.
 */
export function focusPrompt(): boolean {
  if (listeners.size === 0) {
    return false;
  }
  // Copied: a listener that unsubscribes while being told must not shorten
  // the set being iterated.
  for (const listener of [...listeners]) {
    listener();
  }
  return true;
}

/** Listen for those requests. Returns the unsubscribe. */
export function onPromptFocusRequest(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
