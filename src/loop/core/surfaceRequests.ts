/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Asking the chat to open a surface, from outside React.
 *
 * The surface beside the chat — a notebook, a document — is the chat's own
 * state, held in the component that draws it. That is right: the chat decides
 * what it shows, and lifting it into a global store so anything could set it
 * would make every caller a co-owner of the chat's layout.
 *
 * But a command runs outside the component tree, and `/notebook` has to be
 * able to open the notebook. Both editor commands used to call
 * `setActiveViewType('chat')` and stop there, which shows the chat and leaves
 * whichever surface was already open — so on the chat view, where a reader
 * usually is, they did nothing at all.
 *
 * This is the narrow channel between the two: a command asks, the chat
 * answers, and nobody else gains a way to set the chat's state. `requestSurface`
 * reports whether anything was listening, so a command invoked with no chat on
 * screen can say so rather than failing silently — which is how this went
 * unnoticed.
 *
 * @module loop/core/surfaceRequests
 */

/** Told which surface somebody asked for. */
export type SurfaceRequestListener = (surfaceId: string) => void;

const listeners = new Set<SurfaceRequestListener>();

/**
 * Ask for a surface by id.
 *
 * @returns whether anything was listening — `false` means no chat is mounted,
 *   and the caller should say so rather than assume it worked.
 */
export function requestSurface(surfaceId: string): boolean {
  if (listeners.size === 0) {
    return false;
  }
  // Copied: a listener that unsubscribes while being told must not shorten the
  // set being iterated.
  for (const listener of [...listeners]) {
    listener(surfaceId);
  }
  return true;
}

/** Listen for those requests. Returns the unsubscribe. */
export function onSurfaceRequest(listener: SurfaceRequestListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
