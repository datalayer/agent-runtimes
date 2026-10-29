/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What an application is doing (R-15), as ai-agents answers
 * `/api/ai-agents/v1/apps/activity`, its record's entries (`/apps/records`)
 * and its sessions as the record lists them (`/apps/sessions`: state,
 * agent, title, lineage, where each runs — the row a runtime describes a
 * held session with too): read and said the same by the Studio, the chat
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

// --- a session, as the record lists it ------------------------------------

/** The states of a session: open (held by a runtime), paused, ended. */
export const SESSION_STATES = ['open', 'paused', 'ended'] as const;
export type SessionState = (typeof SESSION_STATES)[number];

/** The phase of an open session's turn, as the runtime that holds it says it. */
export const SESSION_TURNS = ['idle', 'running', 'waiting'] as const;
export type SessionTurn = (typeof SESSION_TURNS)[number];

/** Where an open session runs: a runtime, or a seat of a team run; nothing while paused or ended. */
export type SessionRunsOn =
  | { kind: 'runtime'; uid: string }
  | { kind: 'team_run'; executionId: string; seat: string }
  | null;

/** Where a session comes from: cloned from another at a turn, or imported from a file. */
export type SessionLineage = {
  forkedFrom: { uid: string; atTurn: number } | null;
  importedFrom: {
    digest: string;
    exportedAt: string;
    /** The exporter's uid. */
    exportedBy: string;
  } | null;
};

/**
 * One session, as `GET /api/ai-agents/v1/apps/sessions` lists it and as a
 * runtime describes one it holds (`GET /api/v1/apps/sessions/{uid}`): the
 * same shape on the Studio, the chat and the phone. `turn` and `held` are
 * the runtime's and empty from the record.
 */
export type SessionRow = {
  uid: string;
  appUid: string;
  deploymentUid: string;
  version: number;
  /** `test` for a session its tests ran; empty for real use. */
  purpose: string;
  launchUid: string;
  ownerUid: string;
  openedBy: string;
  wokenBy: string;
  state: SessionState;
  /** The runtime's turn phase of an open session; `''` from the record. */
  turn: SessionTurn | '';
  /** Whether the runtime asked holds it; `null` from the record. */
  held: boolean | null;
  /** The agentspec bound to it now. */
  agent: string;
  /** The harness that agent runs on; empty for a model agent. */
  harness: string;
  title: string;
  archived: boolean;
  runsOn: SessionRunsOn;
  lineage: SessionLineage;
  /** The person's turns so far. */
  turns: number;
  startedAt: string;
  keptUntil: string;
};

const runsOnOf = (raw: unknown): SessionRunsOn => {
  if (!isRecord(raw)) {
    return null;
  }
  if (raw.kind === 'runtime') {
    return { kind: 'runtime', uid: said(raw.uid) };
  }
  if (raw.kind === 'team_run') {
    return {
      kind: 'team_run',
      executionId: said(raw.execution_id),
      seat: said(raw.seat),
    };
  }
  throw new Error(
    `A session runs on a runtime or a team run, not on ${JSON.stringify(raw.kind)}.`,
  );
};

const lineageOf = (raw: unknown): SessionLineage => {
  const lineage = isRecord(raw) ? raw : {};
  const forked = isRecord(lineage.forked_from) ? lineage.forked_from : null;
  const imported = isRecord(lineage.imported_from)
    ? lineage.imported_from
    : null;
  return {
    forkedFrom: forked
      ? { uid: said(forked.uid), atTurn: Number(forked.at_turn) || 0 }
      : null,
    importedFrom: imported
      ? {
          digest: said(imported.digest),
          exportedAt: said(imported.exported_at),
          exportedBy: said(imported.exported_by),
        }
      : null,
  };
};

/**
 * A session row as the record or a runtime answers it. A row without a uid,
 * or whose state is not one of the three, is refused in a sentence: the
 * reader never guesses a state (an older opening is re-indexed, not read).
 */
export function sessionRowOf(raw: Record<string, unknown>): SessionRow {
  const uid = said(raw.uid);
  if (!uid) {
    throw new Error('A session row names its uid; this one does not.');
  }
  const state = said(raw.state);
  if (!(SESSION_STATES as readonly string[]).includes(state)) {
    throw new Error(
      `There is no session state ${JSON.stringify(state)} (session ${uid}): one of ${SESSION_STATES.join(', ')}.`,
    );
  }
  const turn = said(raw.turn);
  if (turn && !(SESSION_TURNS as readonly string[]).includes(turn)) {
    throw new Error(
      `There is no turn phase ${JSON.stringify(turn)} (session ${uid}): one of ${SESSION_TURNS.join(', ')}.`,
    );
  }
  return {
    uid,
    appUid: said(raw.app_uid),
    deploymentUid: said(raw.deployment_uid),
    version: Number(raw.version) || 0,
    purpose: said(raw.purpose),
    launchUid: said(raw.launch_uid),
    ownerUid: said(raw.owner_uid),
    openedBy: said(raw.opened_by),
    wokenBy: said(raw.woken_by),
    state: state as SessionState,
    turn: turn as SessionTurn | '',
    held: typeof raw.held === 'boolean' ? raw.held : null,
    agent: said(raw.agent),
    harness: said(raw.harness),
    title: said(raw.title),
    archived: raw.archived === true,
    runsOn: runsOnOf(raw.runs_on),
    lineage: lineageOf(raw.lineage),
    turns: Number(raw.turns) || 0,
    startedAt: said(raw.started_at),
    keptUntil: said(raw.kept_until),
  };
}

/** A page of sessions, as the record lists them: `{sessions, has_more}`. */
export function sessionPageOf(body: Record<string, unknown>): {
  sessions: SessionRow[];
  hasMore: boolean;
} {
  return {
    sessions: records(body.sessions).map(sessionRowOf),
    hasMore: body.has_more === true,
  };
}

/** The state words, on every client. */
export const SESSION_STATE_WORDS: Record<SessionState, string> = {
  open: 'Open',
  paused: 'Paused',
  ended: 'Ended',
};

/** The turn phase, beside an open session's state. */
export const SESSION_TURN_WORDS: Record<SessionTurn, string> = {
  idle: '',
  running: 'answering',
  waiting: 'waiting for you',
};

/** A session's state in words: *Open · answering*, *Paused*, *Ended*. */
export function sessionStateSaid(
  session: Pick<SessionRow, 'state' | 'turn'>,
): string {
  const phase =
    session.state === 'open' && session.turn
      ? SESSION_TURN_WORDS[session.turn]
      : '';
  return phase
    ? `${SESSION_STATE_WORDS[session.state]} · ${phase}`
    : SESSION_STATE_WORDS[session.state];
}

/** The words of a session's lineage. */
export const SESSION_LINEAGE_WORDS = {
  cloned: (uid: string, atTurn: number): string =>
    `Cloned from ${uid} at turn ${atTurn}`,
  imported: (exportedAt: string): string =>
    exportedAt
      ? `Imported from a file exported ${exportedAt}`
      : 'Imported from a file',
} as const;

/** Where a session comes from, in a sentence; `''` for one opened here. */
export function sessionLineageSaid(
  session: Pick<SessionRow, 'lineage'>,
): string {
  const { forkedFrom, importedFrom } = session.lineage;
  if (forkedFrom) {
    return SESSION_LINEAGE_WORDS.cloned(forkedFrom.uid, forkedFrom.atTurn);
  }
  if (importedFrom) {
    return SESSION_LINEAGE_WORDS.imported(importedFrom.exportedAt);
  }
  return '';
}

/** The agent a session is bound to, with its harness when it runs on one: *shield-mvp-codex (codex)*. */
export function sessionAgentSaid(
  session: Pick<SessionRow, 'agent' | 'harness'>,
): string {
  if (!session.agent) {
    return '';
  }
  return session.harness && session.harness !== session.agent
    ? `${session.agent} (${session.harness})`
    : session.agent;
}

/** What an application, or all of a person's, is doing (R-15): real use only, its tests read apart. */
export type AppActivity = {
  /** Sessions whose latest run has not answered yet, newest first: their run's start. */
  inProgress: RecordEntry[];
  /** Its live deployments' next runs, soonest first. */
  scheduled: ScheduledRun[];
  /** Why its schedules could not be read; empty when they were. */
  scheduledProblem: string;
  /** Its other sessions, newest first, each as the record lists it. */
  completed: SessionRow[];
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
    completed: records(body.completed).map(sessionRowOf),
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
      const key = entry.uid;
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
