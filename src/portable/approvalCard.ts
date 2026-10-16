/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An approval as every card says it (M-016): the shared controller
 * and prop contract under the web's *Waiting for you* and Datalayer Mobile's
 * Inbox and detail. A message to send is shown whole — its recipients,
 * subject and body — and anything else is every argument the tool gave,
 * complete (the raw fallback), its private `_` markers said apart as *why it
 * asked*. A renderer owns its markup and its buttons, never these words.
 *
 * @module portable/approvalCard
 */

import {
  messageOfApproval,
  whyAsked,
  type ApprovalArgs,
  type MessageAsked,
} from './approvals';

/** What every approval card says. */
export const APPROVAL_CARD_WORDS = {
  to: 'To',
  cc: 'Cc',
  bcc: 'Bcc',
  subject: 'Subject',
  forwards: 'It forwards a message you received.',
  replies: 'A reply, in its conversation.',
  arguments: 'What it would do',
  why: 'Why it asked',
  noArguments: 'It gave no arguments.',
} as const;

/** An approval's tool and arguments, under either naming. */
export type ApprovalCardSource = ApprovalArgs & {
  tool_name?: string;
  toolName?: string;
};

/** What a card shows of one approval. */
export type ApprovalCard = {
  /** The tool as an action, in words: `send_email` → `Send email`. */
  action: string;
  /** Why it asked (its Rule or check), or `''`. */
  why: string;
  /** A message to send, shown whole; `null` for anything else. */
  message: MessageAsked | null;
  /** Every non-private argument, complete, when it is not a message. */
  raw: string;
  /** One line for a list row: a message's recipients and subject (never its body), else why. */
  summary: string;
};

/** The props of an approval card, on every platform. */
export type ApprovalCardProps = {
  card: ApprovalCard;
  status: string;
  /** A decision being sent: both buttons wait. */
  busy?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
};

const argsOf = (approval: ApprovalCardSource): Record<string, unknown> =>
  (approval.tool_args ?? approval.toolArgs ?? {}) as Record<string, unknown>;

/** `send_email` → `Send email`. */
export const actionOf = (toolName: string): string => {
  const words = toolName.replace(/[_-]+/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : 'An action';
};

/** Every argument, complete, as the raw fallback; private `_` markers are said apart as *why*. */
export function argumentsShown(approval: ApprovalCardSource): string {
  const visible = Object.fromEntries(
    Object.entries(argsOf(approval)).filter(([key]) => !key.startsWith('_')),
  );
  return Object.keys(visible).length === 0
    ? APPROVAL_CARD_WORDS.noArguments
    : JSON.stringify(visible, null, 2);
}

/** What a card shows of an approval. */
export function approvalCardOf(approval: ApprovalCardSource): ApprovalCard {
  const message = messageOfApproval(approval);
  const why = whyAsked(approval);
  return {
    action: actionOf(String(approval.tool_name ?? approval.toolName ?? '')),
    why,
    message,
    raw: message ? '' : argumentsShown(approval),
    summary: message
      ? message.subject
        ? `${message.to} · ${message.subject}`
        : message.to
      : why,
  };
}
