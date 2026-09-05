/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Putting words in the workspace's prompt from outside it.
 *
 * A page that embeds the workspace often has something to say about it — a
 * "try this" button beside the notebook, a suggestion in a landing hero — and
 * the honest version of that button is not a link to documentation but the
 * request itself, typed into the prompt where the visitor can read it, edit it
 * and decide whether to send it.
 *
 * A store rather than a prop, because the two sides are far apart: the button
 * lives in the host's page and the prompt lives several plugins deep inside
 * the workspace, and threading a callback between them would put the host's
 * copy into the workspace's props. The host calls a function; whichever prompt
 * is mounted answers. Nothing is imported in the other direction.
 *
 * What is *not* here: sending. A suggestion arrives as a draft, and the
 * visitor presses the button. A page that could make an agent run without
 * anyone reading what it was asked is a page that can spend somebody's compute
 * on their behalf — `submit` exists for the host that genuinely wants that,
 * and defaults to off.
 *
 * @module loop/core/promptStore
 */

import { create } from 'zustand';

/** A prompt offered to whichever workspace is listening. */
export type SuggestedPrompt = {
  /** What to put in the box. */
  text: string;
  /** Whether to send it as well as type it. Off by default. */
  submit: boolean;
  /**
   * Tells two suggestions of the same text apart.
   *
   * Without it, clicking the same "Try this" button twice would set state to
   * a value it already held, React would render nothing, and the second click
   * would look broken. It is also what the prompt watches to take focus again.
   */
  nonce: number;
};

export type LoopPromptState = {
  /** The suggestion waiting to be picked up, if there is one. */
  pending?: SuggestedPrompt;
  /** Offer a prompt to the workspace. */
  suggest: (text: string, options?: { submit?: boolean }) => void;
  /** Called by the prompt once it has taken it. */
  consume: () => void;
};

export const useLoopPromptStore = create<LoopPromptState>((set, get) => ({
  pending: undefined,
  suggest: (text, options) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    set({
      pending: {
        text: trimmed,
        submit: options?.submit ?? false,
        nonce: (get().pending?.nonce ?? 0) + 1,
      },
    });
  },
  consume: () => set({ pending: undefined }),
}));

/**
 * Offer a prompt to the workspace, from anywhere.
 *
 * The function a host calls. It does not need the hook, a provider, or a
 * React tree — a click handler in a landing page is the case this is for:
 *
 * ```ts
 * <Button onClick={() => suggestLoopPrompt('Plot this data as a histogram')}>
 * ```
 *
 * Safe to call before the workspace has mounted: the suggestion waits, and the
 * prompt picks it up when it arrives. That matters for a lazily loaded
 * workspace, where the button can easily be clicked first.
 */
export function suggestLoopPrompt(
  text: string,
  options?: { submit?: boolean },
): void {
  useLoopPromptStore.getState().suggest(text, options);
}

export default useLoopPromptStore;
