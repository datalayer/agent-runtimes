/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A local session's approvals (VSCODE VS-07, DESKTOP DK-13, the local
 * place): a local runtime decides an *ask me first* request over its
 * websocket (`/api/v1/tool-approvals/ws`) — it sends `agent.snapshot`
 * messages listing the approvals as they stand, and takes
 * `tool_approval_decision` messages — not over an HTTP route
 * (`routes/tool_approvals.py` has no other). What is read from a snapshot,
 * what a decision is sent as, and what a decision came to once the next
 * snapshot no longer lists the approval. Pure: no host API, no socket.
 *
 * @module portable/localApprovals
 */

import {
  type ApprovalRaised,
  ATTENTION_WORDS,
  decisionOutcome,
} from './attention';

/** The agent of a local runtime's sessions: the runtime names it `default`. */
export const LOCAL_AGENT_ID = 'default';

/** What the local approval source says. */
export const LOCAL_APPROVAL_WORDS = {
  notConfirmed:
    'The local runtime did not confirm the decision in time: decide it in the chat.',
  socketGone: (folderName: string): string =>
    `The local runtime of ${folderName} went away before answering.`,
} as const;

/**
 * Where the local runtime's approvals are decided: its websocket, for one agent.
 *
 * @param runtimeUrl - The local runtime's address (`http://127.0.0.1:<port>`).
 * @param agentId - The agent whose approvals are read.
 *
 * @returns The websocket URL.
 */
export function localApprovalsSocketUrl(
  runtimeUrl: string,
  agentId: string = LOCAL_AGENT_ID,
): string {
  const base = runtimeUrl.replace(/\/+$/, '').replace(/^http/, 'ws');
  return `${base}/api/v1/tool-approvals/ws?agent_id=${encodeURIComponent(agentId)}`;
}

const text = (value: unknown): string =>
  typeof value === 'string' ? value : '';

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/**
 * Whether a websocket message is a snapshot of the agent (`agent.snapshot`).
 *
 * @param message - The message, parsed.
 *
 * @returns Whether it is one.
 */
export function isSnapshot(message: unknown): boolean {
  return record(message).type === 'agent.snapshot';
}

/**
 * The approvals still pending in a snapshot, for one agent: read strictly,
 * a row without an id or a tool left out.
 *
 * @param message - The `agent.snapshot` message, parsed.
 * @param agentId - The agent whose approvals are kept.
 *
 * @returns The pending approvals, in the snapshot's order.
 */
export function approvalsOfSnapshot(
  message: unknown,
  agentId: string = LOCAL_AGENT_ID,
): ApprovalRaised[] {
  const envelope = record(message);
  if (envelope.type !== 'agent.snapshot') {
    return [];
  }
  const payload = record(envelope.payload);
  const listed = Array.isArray(payload.approvals) ? payload.approvals : [];
  const approvals: ApprovalRaised[] = [];
  for (const raw of listed.map(record)) {
    const id = text(raw.id);
    const toolName = text(raw.tool_name);
    const status = text(raw.status) || 'pending';
    const agent = text(raw.agent_id) || agentId;
    if (!id || !toolName || status !== 'pending' || agent !== agentId) {
      continue;
    }
    approvals.push({
      id,
      toolName,
      args: record(raw.tool_args),
      agentId: agent,
      requestedAt: text(raw.created_at),
    });
  }
  return approvals;
}

/**
 * The decision as the runtime's websocket takes it.
 *
 * @param approvalId - The approval decided.
 * @param approved - Whether it is approved.
 * @param note - A note, when the person left one.
 *
 * @returns The message to send, serialized.
 */
export function decisionMessage(
  approvalId: string,
  approved: boolean,
  note?: string,
): string {
  return JSON.stringify({
    type: 'tool_approval_decision',
    approvalId,
    approved,
    ...(note ? { note } : {}),
  });
}

/**
 * What a decision came to, read from the snapshots: nothing while the
 * approval is still listed pending; the sentence (done, as the route's 200
 * would say it) once it is no longer; *answered elsewhere* when it was not
 * pending when the decision was asked.
 *
 * @param pendingWhenAsked - Whether the approval was pending when asked.
 * @param pendingNow - The approvals pending in the latest snapshot.
 * @param approvalId - The approval decided.
 * @param approved - Whether approval was asked.
 * @param action - The action in words, for the sentence.
 *
 * @returns The sentence, or null while nothing says yet.
 */
export function decisionSettled(
  pendingWhenAsked: boolean,
  pendingNow: readonly Pick<ApprovalRaised, 'id'>[],
  approvalId: string,
  approved: boolean,
  action: string,
): string | null {
  if (!pendingWhenAsked) {
    return ATTENTION_WORDS.answeredElsewhere;
  }
  if (pendingNow.some(approval => approval.id === approvalId)) {
    return null;
  }
  return decisionOutcome(200, approved, action);
}
