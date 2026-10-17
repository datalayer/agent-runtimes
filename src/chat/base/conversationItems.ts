/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What the web chat draws of its conversation (M-030): the rows of
 * `reduceConversation`'s state as the `DisplayItem`s `ChatMessageList`
 * renders, with what only the web holds beside them — what a message showed
 * and who said it (Reactor UI ops, RU-W), the steps of an
 * application's code (P-16), and what a message carried that the
 * conversation does not keep (when it was said, a voice's metadata).
 *
 * The conversation is the reducer's; this only draws it. A turn that ended
 * without words and a step of the AG-UI run are not drawn here, as they were
 * not before; a failure is said as the assistant's words.
 *
 * @module chat/base/conversationItems
 */

import type { Display } from '@datalayer/reactor/ui';
import type {
  ConversationItem,
  ConversationState,
} from '../../portable/conversation';
import type {
  DisplayItem,
  DisplayToolCallStatus,
  ToolCallMessage,
} from '../../types/chat';
import type { ChatMessage, MessageSpeaker } from '../../types/messages';

type ToolItem = Extract<ConversationItem, { kind: 'tool' }>;
type MessageItem = Extract<ConversationItem, { kind: 'message' }>;

/** What a message carried that the conversation does not keep. */
export type MessageExtras = Omit<ChatMessage, 'id' | 'role' | 'content'>;

/** A step of an application's code, drawn after the row that was last when it began. */
export type StepRow = { item: ToolCallMessage; after: string | null };

/** What only the web holds beside the conversation's rows. */
export type ChatLayer = {
  /** By message id: when it was said, and what else it carried. */
  extras: ReadonlyMap<string, MessageExtras>;
  /** By message id: what it showed (`show`, `ask`, `patch`, `append`). */
  displays: ReadonlyMap<string, Display[]>;
  /** By message id: who said it (`meta`). */
  speakers: ReadonlyMap<string, MessageSpeaker>;
  /** The steps of an application's code, in the order they began. */
  steps: readonly StepRow[];
};

export const emptyChatLayer = (): ChatLayer => ({
  extras: new Map(),
  displays: new Map(),
  speakers: new Map(),
  steps: [],
});

/** The id a tool call's card has: its call's, prefixed. */
export const toolCardId = (toolCallId: string): string => `tool-${toolCallId}`;

/** The conversation row a drawn item is: a card's call, else itself. */
export const rowIdOf = (item: DisplayItem): string =>
  'toolCallId' in item && item.id === toolCardId(item.toolCallId)
    ? item.toolCallId
    : item.id;

/** A tool call's status, as its card says it. */
export function cardStatusOf(item: ToolItem): DisplayToolCallStatus {
  if (item.status !== 'running') {
    return item.status;
  }
  return item.awaiting === 'approval' ? 'inProgress' : 'executing';
}

/** A tool call as its card draws it. */
export function toolCallOf(item: ToolItem): ToolCallMessage {
  return {
    id: toolCardId(item.id),
    type: 'tool-call',
    toolCallId: item.id,
    toolName: item.name,
    args: item.input ?? {},
    // Its value; its words when the value was too long to keep.
    ...(item.value !== undefined
      ? { result: item.value }
      : item.result
        ? { result: item.result }
        : {}),
    status: cardStatusOf(item),
    ...(item.error ? { error: item.error } : {}),
    ...(item.executionError ? { executionError: item.executionError } : {}),
    ...(item.codeError
      ? {
          codeError: {
            name: item.codeError.name,
            value: item.codeError.value,
            ...(item.codeError.traceback
              ? { traceback: item.codeError.traceback }
              : {}),
          },
        }
      : {}),
    ...(item.exitCode !== null ? { exitCode: item.exitCode } : {}),
  };
}

/**
 * A drawer of a conversation: each row drawn once, and drawn again only when
 * it, or what the web holds beside it, changed — so a message streaming
 * leaves the others as they were, for React.
 */
export function conversationDrawer(
  errorWords: (text: string) => string,
): (state: ConversationState, layer: ChatLayer) => DisplayItem[] {
  const drawn = new Map<
    string,
    {
      row: ConversationItem;
      extras?: MessageExtras;
      displays?: Display[];
      speaker?: MessageSpeaker;
      item: DisplayItem;
    }
  >();

  const message = (
    row: MessageItem | Extract<ConversationItem, { kind: 'error' }>,
    layer: ChatLayer,
  ): ChatMessage => {
    const extras = layer.extras.get(row.id);
    const displays = layer.displays.get(row.id);
    const speaker = layer.speakers.get(row.id);
    const kept = drawn.get(row.id);
    if (
      kept &&
      kept.row === row &&
      kept.extras === extras &&
      kept.displays === displays &&
      kept.speaker === speaker
    ) {
      return kept.item as ChatMessage;
    }
    const item: ChatMessage = {
      ...extras,
      createdAt: extras?.createdAt ?? new Date(),
      id: row.id,
      role: row.kind === 'message' ? row.role : 'assistant',
      content: row.kind === 'message' ? row.text : errorWords(row.text),
      ...(displays ? { displays } : {}),
      ...(speaker ? { speaker } : {}),
    };
    drawn.set(row.id, { row, extras, displays, speaker, item });
    return item;
  };

  const tool = (row: ToolItem): ToolCallMessage => {
    const kept = drawn.get(row.id);
    if (kept && kept.row === row) {
      return kept.item as ToolCallMessage;
    }
    const item = toolCallOf(row);
    drawn.set(row.id, { row, item });
    return item;
  };

  return (state, layer) => {
    const items: DisplayItem[] = [];
    const after = new Map<string | null, ToolCallMessage[]>();
    for (const step of layer.steps) {
      after.set(step.after, [...(after.get(step.after) ?? []), step.item]);
    }
    items.push(...(after.get(null) ?? []));
    const seen = new Set<string>();
    for (const row of state.items) {
      seen.add(row.id);
      if (row.kind === 'message' || row.kind === 'error') {
        items.push(message(row, layer));
      } else if (row.kind === 'tool') {
        items.push(tool(row));
      }
      items.push(...(after.get(row.id) ?? []));
    }
    // A step after a row since taken away: at the end.
    for (const [anchor, steps] of after) {
      if (anchor !== null && !seen.has(anchor)) {
        items.push(...steps);
      }
    }
    for (const id of drawn.keys()) {
      if (!seen.has(id)) {
        drawn.delete(id);
      }
    }
    return items;
  };
}
