/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A side panel asked open by a tool call still running (the user,
 * 24 November 2026: "create a notebook and document fails"). A panel opens
 * from the conversation's recorded calls, and a call is recorded once it
 * has completed: a document's or a notebook's tool, which writes through
 * the editor its panel mounts, would wait for a panel that waits for it.
 * Such a call asks here instead; the side whose panel follows the tool
 * opens and selects its tab, as a person's click would.
 *
 * @module apps/shell/sidePanelReveal
 */

export type RevealRequest = { toolName: string; seq: number };

let last: RevealRequest | undefined;
let seq = 0;
const listeners = new Set<() => void>();

/** Ask the panel that follows this tool to open and show its tab. */
export function revealPanelFor(toolName: string): void {
  seq += 1;
  last = { toolName, seq };
  listeners.forEach(listener => listener());
}

export function subscribeReveal(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const lastReveal = (): RevealRequest | undefined => last;
