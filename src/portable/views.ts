/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The conversation's components, as one contract for every renderer (M-032):
 * the props each one takes, and what each says — to the
 * eye and to a screen reader — computed here once, so that a native renderer
 * (Datalayer Mobile's `.native` views) and the web's draw the same rows with
 * the same words and states, over `reduceConversation`'s state.
 *
 * A renderer owns its markup and its look, never these words, these states or
 * the rule of when a person may type.
 *
 * @module portable/views
 */

import type {
  ConversationItem,
  ConversationQuestion,
  ConversationState,
} from './conversation';
import type { ProtocolDisplay } from './displays';
import { PRESENCE_LINES, type PresenceState } from './presence';

export type MessageItem = Extract<ConversationItem, { kind: 'message' }>;
export type ToolItem = Extract<ConversationItem, { kind: 'tool' }>;
export type StepItem = Extract<ConversationItem, { kind: 'step' }>;
export type TurnEndItem = Extract<ConversationItem, { kind: 'end' }>;
export type ErrorItem = Extract<ConversationItem, { kind: 'error' }>;

/** A message: the person's words as they are, an answer through the safe Markdown subset. */
export type MessageRowProps = { item: MessageItem };

/** A tool call, collapsed until the person opens it. */
export type ToolRowProps = {
  item: ToolItem;
  expanded: boolean;
  onToggle: () => void;
};

/** A step of the application's code. */
export type StepRowProps = { item: StepItem };

/** How a turn that said nothing ended. */
export type TurnEndRowProps = { item: TurnEndItem };

/** A failure, announced. */
export type ErrorRowProps = { item: ErrorItem };

/** What the application waits for the person to answer (`loop.ask`). */
export type QuestionCardProps = {
  question: ConversationQuestion;
  busy: boolean;
  /** A choice, or words, answered by a message. */
  onChoose: (option: string) => void;
  /** A form, answered by a settings change. */
  onForm: (values: Record<string, unknown>) => void;
};

/**
 * A protocol display under its tool row (M-037): what it shows is
 * `displayLine`'s and the display's own — a coding agent's `diff` as a
 * unified diff in the file's language (`unifiedDiffLines`), its `terminal`
 * as the command and the output kept; what the person does goes out
 * through the host — a sign-in page opened outside the conversation, an
 * operation answered where approvals are, *I have signed in* said as their
 * next message. Nothing is answered from the card itself.
 */
export type ProtocolDisplayProps = {
  display: ProtocolDisplay;
  /** Open a sign-in page, `https` only, outside the conversation. */
  onOpenSignIn: (url: string) => void;
  /** Open the approval an operation stands for. */
  onOpenApproval: (approvalId: string) => void;
  /** The person says they signed in (`PAP_SIGN_IN_WORDS.checkMessage`). */
  onSignedIn: (words: string) => void;
  /**
   * Open a Direct Conversation under the conversation a company answered in
   * (`portable/direct`, M-038); absent where none can be opened.
   */
  onOpenDirect?: (company: string, conversationId: string) => void;
};

/** The line beside the application's face. */
export type PresenceLineProps = { state: PresenceState };

/** The message box and its one button: Send, or Stop while a turn streams. */
export type ComposerProps = ComposerState & {
  draft: string;
  onDraft: (draft: string) => void;
  onSend: () => void;
  onStop: () => void;
};

/** A whole conversation: its state and what the person can do to it. */
export type ConversationViewProps = {
  state: ConversationState;
  /** It is being read from the server. */
  opening: boolean;
  /** It was ended; its record stays. */
  ended: boolean;
  /** Why nothing can be sent, when nothing can (paused, closed). */
  closed?: string;
  placeholder: string;
  onSend: (words: string) => void;
  onStop: () => void;
  onForm: (values: Record<string, unknown>) => void;
};

/** A tool call's state, in words. */
export const TOOL_STATUS_WORDS: Record<ToolItem['status'], string> = {
  running: 'running',
  complete: 'done',
  error: 'failed',
};

/** Said while a conversation is read from the server. */
export const OPENING_WORDS = 'Opening your conversation…';
/** Said once an answer is complete — once, never token by token. */
export const ANSWER_COMPLETE = 'The answer is complete.';
/** Said in place of the message box of an ended conversation. */
export const ENDED_WORDS = 'This conversation has ended. Its record stays.';
/** Said under a question answered in the message box. */
export const ANSWER_BELOW = 'Answer in the message box below.';

/** What a message says to a screen reader: whose, and its words. */
export const messageLabel = (item: MessageItem): string =>
  `${item.role === 'user' ? 'You' : 'Answer'}: ${item.text}`;

/** A tool call's one line: its name and its state. */
export const toolLabel = (item: ToolItem): string =>
  `Tool ${item.name || 'call'}, ${TOOL_STATUS_WORDS[item.status]}`;

/** A step's one line: running or done, and its name. */
export const stepLine = (item: StepItem): string =>
  `${item.status === 'running' ? '…' : '✓'} ${item.name}`;

/** Said of the oldest rows a device did not keep, or nothing. */
export const droppedWords = (dropped: number): string =>
  dropped > 0
    ? `${dropped} earlier ${dropped === 1 ? 'row is' : 'rows are'} not kept on this device.`
    : '';

/** The line of a presence state. */
export const presenceLine = ({ state }: PresenceLineProps): string =>
  PRESENCE_LINES[state];

/** Whether the person may type, why not, and what the box says. */
export type ComposerState = {
  /** Why nothing can be sent; `''` when something can. */
  blocked: string;
  canType: boolean;
  /** A turn is streaming: the button is Stop. */
  running: boolean;
  placeholder: string;
};

/**
 * The message box, from the conversation: closed or ended, nothing is sent;
 * while it opens or a turn streams, nothing is typed; a form or a file
 * question is answered elsewhere; a text question puts its prompt in the box.
 */
export function composerOf({
  state,
  opening,
  ended,
  closed,
  placeholder,
  running = state.running,
}: Pick<
  ConversationViewProps,
  'state' | 'opening' | 'ended' | 'closed' | 'placeholder'
> & {
  /** A turn is running, as its client knows it before its first event. */
  running?: boolean;
}): ComposerState {
  const blocked = closed || (ended ? ENDED_WORDS : '');
  const asking = state.asking;
  return {
    blocked,
    running,
    canType:
      !blocked &&
      !opening &&
      !running &&
      asking?.kind !== 'form' &&
      asking?.kind !== 'file',
    placeholder: asking?.kind === 'text' ? asking.prompt : placeholder,
  };
}

/** Whether the question card is shown: asked, and no turn streaming. */
export const showsQuestion = (
  state: ConversationState,
  running = state.running,
): boolean => Boolean(state.asking) && !running;
