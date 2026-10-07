/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/*
 * Copyright (c) 2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Normalised approval record. Both snake_case (server-native) and
 * camelCase (TypeScript-idiomatic) keys are present so existing UI
 * consumers keep working regardless of which naming they read.
 */
export type ApprovalRecord = {
  id: string;
  agent_id: string;
  agentId: string;
  runtime_name: string;
  runtimeName: string;
  tool_name: string;
  toolName: string;
  tool_call_id?: string;
  toolCallId?: string;
  tool_args: Record<string, unknown>;
  toolArgs: Record<string, unknown>;
  status: string;
  note?: string | null;
  requester_uid?: string;
  requesterUid?: string;
  requested_by?: string;
  requestedBy?: string;
  resolved_by?: string;
  resolvedBy?: string;
  resolved_at?: string;
  resolvedAt?: string;
  created_at: string;
  createdAt: string;
  updated_at?: string;
  updatedAt?: string;
  read?: boolean;
};

function str(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

/** An approval as the server or the `/ws` stream sends it; null without an id. */
export function normalizeApproval(raw: unknown): ApprovalRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const idSource = rec.id ?? rec.approval_id ?? rec.approvalId;
  const id = typeof idSource === 'string' ? idSource : undefined;
  if (!id) return null;

  const agent = str(rec.agent_id ?? rec.agentId);
  const pod = str(rec.runtime_name ?? rec.runtimeName);
  const tool = str(rec.tool_name ?? rec.toolName ?? 'unknown');
  const toolCall = rec.tool_call_id ?? rec.toolCallId;
  const args =
    (rec.tool_args as Record<string, unknown> | undefined) ??
    (rec.toolArgs as Record<string, unknown> | undefined) ??
    {};
  const created = str(rec.created_at ?? rec.createdAt);
  const updated = str(rec.updated_at ?? rec.updatedAt);
  const resolvedBy = str(rec.resolved_by ?? rec.resolvedBy);
  const requesterUid = str(rec.requester_uid ?? rec.requesterUid);
  const requestedBy = str(rec.requested_by ?? rec.requestedBy);
  const resolvedAtRaw = str(rec.resolved_at ?? rec.resolvedAt);
  const status = str(rec.status ?? 'pending');
  // Keep reviewer metadata from WS payloads. If this is dropped during
  // normalization, downstream pages receive status=approved/rejected but no
  // reviewer/timestamp context and can incorrectly render "review pending".
  // Some producers only set updated_at on decision; for non-pending statuses,
  // fall back to updated_at so UI can still show a decision time.
  const resolvedAt =
    resolvedAtRaw || (status !== 'pending' ? updated || undefined : undefined);

  return {
    id,
    agent_id: agent,
    agentId: agent,
    runtime_name: pod,
    runtimeName: pod,
    tool_name: tool,
    toolName: tool,
    tool_call_id: typeof toolCall === 'string' ? toolCall : undefined,
    toolCallId: typeof toolCall === 'string' ? toolCall : undefined,
    tool_args: args,
    toolArgs: args,
    status,
    note:
      typeof rec.note === 'string'
        ? rec.note
        : rec.note === null
          ? null
          : undefined,
    requester_uid: requesterUid || undefined,
    requesterUid: requesterUid || undefined,
    requested_by: requestedBy || undefined,
    requestedBy: requestedBy || undefined,
    resolved_by: resolvedBy || undefined,
    resolvedBy: resolvedBy || undefined,
    resolved_at: resolvedAt,
    resolvedAt: resolvedAt,
    created_at: created,
    createdAt: created,
    updated_at: updated || undefined,
    updatedAt: updated || undefined,
    read: typeof rec.read === 'boolean' ? rec.read : undefined,
  };
}

/** An approval's arguments, under either key: the web reads `tool_args`, mobile `toolArgs`. */
export type ApprovalArgs = {
  tool_args?: Record<string, unknown>;
  toolArgs?: Record<string, unknown>;
};

/** A message it asks to send, as the approval carries it, whole (LOOP W-05). */
export type MessageAsked = {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  /** It forwards a message received, named by its id. */
  forwards: boolean;
  /** A reply, in the conversation it names. */
  replies: boolean;
};

const argsOf = (approval: ApprovalArgs): Record<string, unknown> =>
  approval.tool_args ?? approval.toolArgs ?? {};

const said = (approval: ApprovalArgs, key: string): string => {
  const value = argsOf(approval)[key];
  return typeof value === 'string' ? value : '';
};

const addressed = (value: unknown): string =>
  Array.isArray(value)
    ? value.filter(item => typeof item === 'string').join(', ')
    : typeof value === 'string'
      ? value
      : '';

/**
 * The message a send asks for, to show whole before *Approve* (LOOP W-05):
 * an approval whose arguments say to whom and what. `null` for anything else.
 */
export function messageOfApproval(approval: ApprovalArgs): MessageAsked | null {
  const args = argsOf(approval);
  const to = addressed(args.to);
  if (!to || typeof args.body !== 'string') {
    return null;
  }
  return {
    to,
    cc: addressed(args.cc),
    bcc: addressed(args.bcc),
    subject: said(approval, 'subject'),
    body: args.body,
    forwards: Boolean(said(approval, 'forward_message_id')),
    replies: Boolean(
      said(approval, 'thread_id') || said(approval, 'in_reply_to'),
    ),
  };
}

/** Why it was asked: the rule (`_rule`) or the check (`_check`). */
export const whyAsked = (approval: ApprovalArgs): string =>
  said(approval, '_rule') || said(approval, '_check');
