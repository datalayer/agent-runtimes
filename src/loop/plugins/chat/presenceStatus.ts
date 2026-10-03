/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What an application is doing, in plain words (LOOP T-08): the one line of
 * status beside its face.
 *
 * @module loop/plugins/chat/presenceStatus
 */

/** The states a person is told about. Paused waits for a pause to exist. */
export type PresenceState = 'idle' | 'thinking' | 'working' | 'waiting';

/** The line each state is said by. */
export const PRESENCE_LINES: Record<PresenceState, string> = {
  idle: 'Ready',
  thinking: 'Thinking…',
  working: 'Working…',
  waiting: 'Waiting for you',
};

/** The newest tool call of the conversation, as far as presence reads it. */
export interface PresenceTool {
  /** It has not returned. */
  open: boolean;
  /** It waits on a person's approval. */
  pendingApproval: boolean;
}

/**
 * The state, from whether a turn is running and the newest tool call.
 *
 * Waiting for an approval is said whether or not the turn is still
 * streaming — the stream may end while the approval is asked. A tool that
 * has not returned counts as work only during a turn: a stopped turn can
 * leave one open, and the application is not working then.
 */
export function presenceState(
  busy: boolean,
  tool?: PresenceTool,
): PresenceState {
  if (tool?.open && tool.pendingApproval) {
    return 'waiting';
  }
  if (!busy) {
    return 'idle';
  }
  return tool?.open ? 'working' : 'thinking';
}
