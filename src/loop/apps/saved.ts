/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Approve and save (LOOP R-24): what an application wants to keep, shown
 * before it is kept. The runtime asks every `save_to_space` call on the
 * approvals path with the title and the whole text; an approvals card shows
 * them, with *Approve and save* and *Decline* in place of *Approve* and
 * *Reject*.
 *
 * Pure: no React.
 *
 * @module loop/apps/saved
 */

/** The runtime's tool that saves a result as a page of a Space. */
export const SAVE_TOOL = 'save_to_space';

/** What an approvals card says of a result to keep. */
export const SAVE_WORDS = {
  approve: 'Approve and save',
  decline: 'Decline',
  where: (space: string): string =>
    space
      ? `To keep as a page of ${space}:`
      : 'To keep as a page of its Space:',
} as const;

/** The result an approval asks to save: its title, its text, its Space. */
export type Draft = { title: string; content: string; space: string };

/** The draft an approval carries, or null for any other approval. */
export function draftOfApproval(approval: {
  tool_name: string;
  tool_args?: Record<string, unknown>;
}): Draft | null {
  if (approval.tool_name !== SAVE_TOOL) {
    return null;
  }
  const said = (key: string): string => {
    const value = approval.tool_args?.[key];
    return typeof value === 'string' ? value : '';
  };
  return {
    title: said('title'),
    content: said('content'),
    space: said('space'),
  };
}
