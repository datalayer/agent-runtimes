/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The record of an application (LOOP R-07), as ai-agents keeps it: what it
 * did, session by session, written by the runtime it ran on — read here for
 * its activity feed (R-01b, R-15): the sessions, newest first, and what each
 * one did, step by step.
 *
 * Pure but for `fetch`: no React.
 *
 * @module loop/apps/records
 */

/** What a record entry is. */
export type RecordKind =
  | 'session'
  | 'tool_call'
  | 'decision'
  | 'check'
  | 'approval'
  | 'output'
  | 'feedback'
  /** A turn of a conversation: what was asked, what it answered. */
  | 'turn'
  /** A run began: what Activity reads as in progress until it answers (R-15). */
  | 'run'
  /** What one of its channels was sent, or why not (R-37). */
  | 'notification';

/** One entry of an application's record. */
export type RecordEntry = {
  uid: string;
  sessionUid: string;
  deploymentUid: string;
  version: number;
  kind: RecordKind;
  summary: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

/** Where the record is read, and as whom. */
export type RecordsContext = {
  /** The ai-agents service. */
  aiAgentsUrl: string;
  /** The reader's token: the record is its owner's. */
  token: string;
};

/** Each kind in a word, as the feed labels it. */
export const RECORD_KIND_WORDS: Record<RecordKind, string> = {
  session: 'Session',
  tool_call: 'Tool call',
  decision: 'Rule',
  check: 'Check',
  approval: 'Approval',
  output: 'Answer',
  feedback: 'Feedback',
  turn: 'Turn',
  run: 'Working',
  notification: 'Notification',
};

/** An entry as ai-agents answers with it. */
export function entryOf(raw: Record<string, unknown>): RecordEntry {
  return {
    uid: String(raw.uid ?? ''),
    sessionUid: String(raw.session_uid ?? ''),
    deploymentUid: String(raw.deployment_uid ?? ''),
    version: Number(raw.version) || 0,
    kind: String(raw.kind ?? 'output') as RecordKind,
    summary: String(raw.summary ?? ''),
    payload:
      raw.payload && typeof raw.payload === 'object'
        ? (raw.payload as Record<string, unknown>)
        : {},
    createdAt: String(raw.created_at ?? ''),
  };
}

/** A session in a sentence: how many calls, what stopped it, how it ended. */
export function sessionSentence(entries: readonly RecordEntry[]): string {
  const calls = entries.filter(entry => entry.kind === 'tool_call').length;
  const checks = entries.filter(entry => entry.kind === 'check');
  const outputs = entries.filter(entry => entry.kind === 'output');
  const last = outputs[outputs.length - 1];
  const parts: string[] = [
    calls === 0
      ? 'No tool called'
      : `${calls} tool call${calls === 1 ? '' : 's'}`,
  ];
  if (checks.length) {
    parts.push(
      `${checks.length} step${checks.length === 1 ? '' : 's'} a check did not let pass`,
    );
  }
  if (last?.summary.startsWith('Stopped:')) {
    parts.push('stopped');
  } else if (outputs.length) {
    parts.push(`${outputs.length} answer${outputs.length === 1 ? '' : 's'}`);
  }
  return `${parts.join(', ')}.`;
}

async function read(
  context: RecordsContext,
  path: string,
  failure: string,
): Promise<Record<string, unknown>> {
  if (!context.aiAgentsUrl) {
    throw new Error('The record service is not configured.');
  }
  const response = await fetch(
    `${context.aiAgentsUrl.replace(/\/+$/, '')}/api/ai-agents/v1/apps${path}`,
    {
      headers: context.token
        ? { Authorization: `Bearer ${context.token}` }
        : {},
    },
  );
  const body = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok || body.success === false) {
    throw new Error(`${failure}: ${String(body.detail ?? response.status)}`);
  }
  return body;
}

/**
 * The sessions of an application, newest first: their opening entries. Real
 * use only — the sessions its tests ran are read apart (R-07) — unless
 * `tests` says otherwise: `true` for the tests only, `null` for both.
 */
export async function listSessions(
  context: RecordsContext,
  appUid: string,
  limit = 20,
  tests: boolean | null = false,
): Promise<RecordEntry[]> {
  const body = await read(
    context,
    `/sessions?app_uid=${encodeURIComponent(appUid)}&limit=${limit}${
      tests === null ? '' : `&tests=${tests}`
    }`,
    'The sessions could not be read',
  );
  return Array.isArray(body.sessions)
    ? (body.sessions as Record<string, unknown>[]).map(entryOf)
    : [];
}

/** What one session did, in order: a run's start is a mark, not a step (R-15). */
export async function readSession(
  context: RecordsContext,
  sessionUid: string,
): Promise<RecordEntry[]> {
  const body = await read(
    context,
    `/records?session_uid=${encodeURIComponent(sessionUid)}&limit=500`,
    'The session could not be read',
  );
  return Array.isArray(body.entries)
    ? (body.entries as Record<string, unknown>[])
        .map(entryOf)
        .filter(entry => entry.kind !== 'run')
    : [];
}
