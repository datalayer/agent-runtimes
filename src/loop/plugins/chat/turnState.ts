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
 * Beside the turn, the whole conversation (`conversation`), for a page that
 * shows it as the Chat component does: the chat view hands it every change
 * of its items, streaming included.
 *
 * @module loop/plugins/chat/turnState
 */

import { signal, type ReadonlySignal, type Signal } from '@datalayer/reactor';
import type { ContextSnapshotData } from '../../../types';
import type { DisplayItem, ToolCallMessage } from '../../../types/chat';
import type { ChatMessage } from '../../../types/messages';
import type { PresenceState } from '../../../chat/presence/presenceStatus';
import type {
  ChatTurnSnapshot,
  ChatTurnStatus,
  ConversationEntry,
} from '../../core';

export type TurnFeed = {
  /** The turn, for readers. */
  turn: ReadonlySignal<ChatTurnSnapshot>;
  /**
   * A new turn: the previous one is gone, this one holds the message, and
   * the conversation it went to, when the chat knows it.
   */
  begin: (user: string, thread?: string) => void;
  /** The reply so far. Moves the turn to `streaming` on its first text. */
  assistant: (text: string) => void;
  /** The agent stopped, one way or another. */
  end: (status?: Extract<ChatTurnStatus, 'done' | 'error'>) => void;
  /** The context window, as the agent last reported it. */
  usage: (snapshot: ContextSnapshotData | undefined) => void;
  /** What the agent is doing now, or nothing. */
  activity: (label: string | undefined) => void;
  /** The conversation, for readers. */
  conversation: ReadonlySignal<ConversationEntry[]>;
  /** The chat's items as they now stand, streaming included. */
  items: (items: DisplayItem[]) => void;
  /** What the application is doing, as its chat says it (T-08), for readers. */
  presence: ReadonlySignal<PresenceState>;
  /** What the application is doing now. */
  setPresence: (state: PresenceState) => void;
};

/** A message's words, whether its content is a string or parts. */
export function messageText(message: ChatMessage): string {
  const content = message.content;
  return typeof content === 'string'
    ? content
    : content
        .map(part =>
          typeof part === 'string'
            ? part
            : ((part as { text?: string }).text ?? ''),
        )
        .join('');
}

const isToolCall = (item: DisplayItem): item is ToolCallMessage =>
  (item as ToolCallMessage).type === 'tool-call';

/**
 * The conversation as a page shows it: each person's and assistant's
 * message with words in it, and each tool call by its name, its arguments
 * and its result once it has one. A system message is the chat's own and is
 * left out.
 */
export function conversationOf(items: DisplayItem[]): ConversationEntry[] {
  const entries: ConversationEntry[] = [];
  for (const item of items) {
    if (isToolCall(item)) {
      entries.push({
        role: 'tool',
        name: item.toolName,
        args: item.args ?? {},
        ...(item.result === undefined ? {} : { result: item.result }),
      });
      continue;
    }
    if (item.role !== 'user' && item.role !== 'assistant') {
      continue;
    }
    const text = messageText(item);
    if (text.trim()) {
      entries.push({ role: item.role, text });
    }
  }
  return entries;
}

/** Whether two conversations say the same, entry by entry. */
const sameConversation = (
  one: ConversationEntry[],
  other: ConversationEntry[],
): boolean =>
  one.length === other.length &&
  one.every(
    (entry, index) => JSON.stringify(entry) === JSON.stringify(other[index]),
  );

const IDLE: ChatTurnSnapshot = { id: 0, status: 'idle' };

export function createTurnFeed(): TurnFeed {
  const turn: Signal<ChatTurnSnapshot> = signal<ChatTurnSnapshot>(IDLE);
  const conversation: Signal<ConversationEntry[]> = signal<ConversationEntry[]>(
    [],
  );
  const presence: Signal<PresenceState> = signal<PresenceState>('idle');
  return {
    turn,
    conversation,
    presence,
    setPresence: state => {
      if (presence.value !== state) {
        presence.value = state;
      }
    },
    items: items => {
      const next = conversationOf(items);
      // Nothing new: readers do not re-render for an identical conversation.
      if (!sameConversation(conversation.value, next)) {
        conversation.value = next;
      }
    },
    begin: (user, thread) => {
      // The window's fill carries over: it is the conversation's, not the
      // turn's, and the footer under a fresh turn should not read empty
      // until the agent reports again.
      turn.value = {
        id: turn.value.id + 1,
        user,
        ...(thread ? { thread } : {}),
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
