/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What an application is doing, in plain words (LOOP T-08): the one line of
 * status beside its face.
 *
 * @module chat/presence/presenceStatus
 */

/**
 * The states a person is told about. Paused is its deployment's: its owner
 * paused it (LOOP R-17), and it answers nobody until it is resumed.
 */
export type PresenceState =
  'idle' | 'thinking' | 'working' | 'waiting' | 'paused';

/** The line each state is said by. */
export const PRESENCE_LINES: Record<PresenceState, string> = {
  idle: 'Ready',
  thinking: 'Thinking…',
  working: 'Working…',
  waiting: 'Waiting for you',
  paused: 'Paused',
};

/** The newest tool call of the conversation, as far as presence reads it. */
export interface PresenceTool {
  /** It has not returned. */
  open: boolean;
  /** It waits on a person's approval. */
  pendingApproval: boolean;
}

/**
 * The state, from whether a turn is running, the newest tool call, and
 * whether its deployment is paused.
 *
 * Paused wins: a paused application does nothing, whatever its last turn
 * left behind.
 * Waiting for an approval is said whether or not the turn is still
 * streaming — the stream may end while the approval is asked. A tool that
 * has not returned counts as work only during a turn: a stopped turn can
 * leave one open, and the application is not working then.
 */
export function presenceState(
  busy: boolean,
  tool?: PresenceTool,
  paused = false,
): PresenceState {
  if (paused) {
    return 'paused';
  }
  if (tool?.open && tool.pendingApproval) {
    return 'waiting';
  }
  if (!busy) {
    return 'idle';
  }
  return tool?.open ? 'working' : 'thinking';
}

/** An item of the conversation, as far as presence reads it. */
interface PresenceItem {
  toolName?: unknown;
  toolCallId?: unknown;
  status?: unknown;
  result?: unknown;
}

/**
 * The newest tool call of the conversation: whether it has not returned, and
 * whether it waits on a person's approval. A tool call is an item with a
 * tool name and a call id; it has returned once it is complete or failed.
 */
export function presenceToolOf(items: readonly unknown[]): PresenceTool {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index] as PresenceItem;
    if (typeof item.toolName === 'string' && item.toolCallId) {
      const open = item.status !== 'complete' && item.status !== 'error';
      const pendingApproval =
        open &&
        (item.result as { pending_approval?: unknown } | undefined)
          ?.pending_approval === true;
      return { open, pendingApproval };
    }
  }
  return { open: false, pendingApproval: false };
}
