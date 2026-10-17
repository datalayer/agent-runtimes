/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What an application is doing (R-15), as ai-agents answers
 * `/api/ai-agents/v1/apps/activity`, and its record's entries
 * (`/apps/sessions`, `/apps/records`): read and said the same by the Studio
 * and Datalayer Mobile (M-015b). Pure: each client fetches with its own
 * authentication and hands the body here.
 *
 * @module portable/activity
 */

import { RUN_END_WORDS } from './records';

export type RecordKind =
  | 'session'
  /** A run began: in progress until it answers (R-15). Not a step. */
  | 'run'
  | 'tool_call'
  | 'decision'
  | 'check'
  | 'approval'
  | 'output'
  | 'feedback'
  /** A turn of a conversation: what was asked, what it answered (V-16). */
  | 'turn'
  /** What it did, step by step (P-16); a harness's session, turn and plan events. */
  | 'step'
  /** What one of its channels was sent, or why not: `{channel, event, delivery, detail}` (R-37). */
  | 'notification';

/** One entry of an application's record. */
export type RecordEntry = {
  uid: string;
  appUid: string;
  sessionUid: string;
  deploymentUid: string;
  version: number;
  kind: RecordKind;
  summary: string;
  payload: Record<string, unknown>;
  createdAt: string;
  /** `test` for a session its tests ran (the Evals engine's); empty for real use. */
  purpose: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const records = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const said = (value: unknown): string =>
  typeof value === 'string' ? value : value == null ? '' : String(value);

/** An entry as ai-agents answers with it. */
export function entryOf(raw: Record<string, unknown>): RecordEntry {
  return {
    uid: said(raw.uid),
    appUid: said(raw.app_uid),
    sessionUid: said(raw.session_uid),
    deploymentUid: said(raw.deployment_uid),
    version: Number(raw.version) || 0,
    kind: (said(raw.kind) || 'output') as RecordKind,
    summary: said(raw.summary),
    payload: isRecord(raw.payload) ? raw.payload : {},
    createdAt: said(raw.created_at),
    purpose: said(raw.purpose),
  };
}

/** How the run an entry ends ended: `answered`, `stopped`, `gone`; `''` for any other entry. */
export function runEndOf(entry: RecordEntry): string {
  const status = entry.kind === 'output' ? entry.payload.status : undefined;
  return typeof status === 'string' && status in RUN_END_WORDS ? status : '';
}

/** An entry in words: its summary, or how its run ended when its words are not kept. */
export function entrySaid(entry: RecordEntry): string {
  return entry.summary || RUN_END_WORDS[runEndOf(entry)] || '';
}

const plural = (n: number, word: string): string =>
  `${n} ${word}${n === 1 ? '' : 's'}`;

/** A session in a sentence: how many calls, what stopped it, how it ended. */
export function sessionSentence(entries: readonly RecordEntry[]): string {
  const calls = entries.filter(entry => entry.kind === 'tool_call').length;
  const checks = entries.filter(entry => entry.kind === 'check');
  const ends = entries.map(runEndOf).filter(Boolean);
  const answers = ends.filter(end => end === 'answered').length;
  const parts: string[] = [];
  parts.push(calls === 0 ? 'No tool called' : plural(calls, 'tool call'));
  if (checks.length) {
    parts.push(`${plural(checks.length, 'step')} a check did not let pass`);
  }
  const unsent = entries.filter(
    entry => entry.kind === 'notification' && entry.payload.delivery !== 'sent',
  );
  if (unsent.length) {
    parts.push(`${plural(unsent.length, 'notification')} not sent`);
  }
  if (ends[ends.length - 1] === 'stopped') {
    parts.push('stopped');
  } else if (answers) {
    parts.push(plural(answers, 'answer'));
  }
  return `${parts.join(', ')}.`;
}

/** A run its schedule plans, as the scheduler says (R-15). */
export type ScheduledRun = {
  deploymentUid: string;
  appUid: string;
  version: number;
  /** Which of its triggers, by position in its Appspec. */
  position: number;
  cron: string;
  description: string;
  /** When it runs next; empty when the scheduler does not say. */
  nextAt: string;
};

/** What an application, or all of a person's, is doing (R-15): real use only, its tests read apart. */
export type AppActivity = {
  /** Sessions whose latest run has not answered yet, newest first: their run's start. */
  inProgress: RecordEntry[];
  /** Its live deployments' next runs, soonest first. */
  scheduled: ScheduledRun[];
  /** Why its schedules could not be read; empty when they were. */
  scheduledProblem: string;
  /** Its other sessions, newest first: their opening entries. */
  completed: RecordEntry[];
  /** The offset of the next page of completed sessions; `null` after the last. */
  nextOffset: number | null;
};

/** `/apps/activity`'s answer, read. */
export function activityOf(body: Record<string, unknown>): AppActivity {
  return {
    inProgress: records(body.in_progress).map(entryOf),
    scheduled: records(body.scheduled).map(raw => ({
      deploymentUid: said(raw.deployment_uid),
      appUid: said(raw.app_uid),
      version: Number(raw.version) || 0,
      position: Number(raw.position) || 0,
      cron: said(raw.cron),
      description: said(raw.description),
      nextAt: said(raw.next_at),
    })),
    scheduledProblem: said(body.scheduled_problem),
    completed: records(body.completed).map(entryOf),
    nextOffset: typeof body.next_offset === 'number' ? body.next_offset : null,
  };
}

/** Pages as one: in progress and scheduled from the first, completed from all, the last page's next offset. */
export function mergeActivityPages(pages: readonly AppActivity[]): AppActivity {
  const [first] = pages;
  if (!first) {
    return {
      inProgress: [],
      scheduled: [],
      scheduledProblem: '',
      completed: [],
      nextOffset: null,
    };
  }
  const seen = new Set<string>();
  const completed = pages
    .flatMap(page => page.completed)
    .filter(entry => {
      const key = entry.uid || entry.sessionUid;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  return {
    ...first,
    completed,
    nextOffset: pages[pages.length - 1].nextOffset,
  };
}

/** What Activity says, on every client (checked against the vocabulary). */
export const ACTIVITY_WORDS = {
  inProgress: 'In progress',
  scheduled: 'Scheduled',
  completed: 'Completed',
  working: 'Working since',
  next: 'next',
  wakes: 'It also starts on its own when something happens:',
  nothing: 'Nothing yet.',
} as const;

/** What happens that starts it on its own, in words (W-03): its event triggers. */
export const wakesOn = (
  triggers:
    | ReadonlyArray<{ type: string; event?: string; description?: string }>
    | undefined,
): string[] =>
  (triggers ?? [])
    .filter(
      trigger =>
        trigger.type === 'event' && (trigger.description || trigger.event),
    )
    .map(
      trigger =>
        trigger.description ||
        `When ${String(trigger.event).replace(/_/g, ' ')}`,
    );

/** A scheduled run in words: what it does, and on which version. */
export const scheduledSays = (run: ScheduledRun): string =>
  `${run.description || 'Its schedule'} (${run.cron}) · version ${run.version}`;
