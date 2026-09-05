/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The conversation's current turn, kept by the chat and read by anyone.
 *
 * One instance per reactor — created by the chat plugin when it builds and
 * contributed to `LoopChatTurn` — so two workspaces on one page do not share
 * a turn. The chat view drives it: `begin` on send (which is what clears the
 * previous turn), `assistant` as the reply arrives, `end` when the agent
 * stops. Readers hold the signal.
 *
 * @module loop/plugins/chat/turnState
 */

import { signal, type ReadonlySignal, type Signal } from '@datalayer/reactor';
import type { ContextSnapshotData } from '../../../types';
import type { ChatTurnSnapshot, ChatTurnStatus } from '../../core';

export type TurnFeed = {
  /** The turn, for readers. */
  turn: ReadonlySignal<ChatTurnSnapshot>;
  /** A new turn: the previous one is gone, this one holds the message. */
  begin: (user: string) => void;
  /** The reply so far. Moves the turn to `streaming` on its first text. */
  assistant: (text: string) => void;
  /** The agent stopped, one way or another. */
  end: (status?: Extract<ChatTurnStatus, 'done' | 'error'>) => void;
  /** The context window, as the agent last reported it. */
  usage: (snapshot: ContextSnapshotData | undefined) => void;
  /** What the agent is doing now, or nothing. */
  activity: (label: string | undefined) => void;
};

const IDLE: ChatTurnSnapshot = { id: 0, status: 'idle' };

export function createTurnFeed(): TurnFeed {
  const turn: Signal<ChatTurnSnapshot> = signal<ChatTurnSnapshot>(IDLE);
  return {
    turn,
    begin: user => {
      // The window's fill carries over: it is the conversation's, not the
      // turn's, and the footer under a fresh turn should not read empty
      // until the agent reports again.
      turn.value = {
        id: turn.value.id + 1,
        user,
        status: 'thinking',
        usage: turn.value.usage,
      };
    },
    assistant: text => {
      const current = turn.value;
      // Nothing to attach it to, or nothing new: leave the value alone so
      // readers do not re-render for an identical snapshot.
      if (current.status === 'idle' || current.assistant === text) {
        return;
      }
      turn.value = {
        ...current,
        assistant: text,
        status:
          current.status === 'done' || current.status === 'error'
            ? current.status
            : text
              ? 'streaming'
              : current.status,
      };
    },
    usage: snapshot => {
      const current = turn.value;
      // Kept even while idle: the agent reports the window once at mount,
      // before anyone has typed, and the first turn wants those figures.
      if (current.usage === snapshot) {
        return;
      }
      turn.value = { ...current, usage: snapshot };
    },
    activity: label => {
      const current = turn.value;
      if (current.status === 'idle' || current.activity === label) {
        return;
      }
      turn.value = { ...current, activity: label };
    },
    end: (status = 'done') => {
      const current = turn.value;
      if (current.status === 'idle') {
        return;
      }
      turn.value = { ...current, status, activity: undefined };
    },
  };
}

/**
 * The writers, as extra fields on the contribution.
 *
 * `ChatTurnContribution` is read-only by type — that is what readers get —
 * but the chat view has to reach the same feed to drive it, and it finds it
 * through the contribution like everyone else. So the writers ride along as
 * fields the public type does not name; {@link turnWritersOf} is how the view
 * gets them back.
 */
export const TURN_WRITERS = Symbol.for('loop.chat.turn.writers');

export function feedWriters(feed: TurnFeed): Record<symbol, TurnFeed> {
  return { [TURN_WRITERS]: feed };
}

export function turnWritersOf(value: unknown): TurnFeed | undefined {
  return (value as Record<symbol, TurnFeed | undefined> | undefined)?.[
    TURN_WRITERS
  ];
}
