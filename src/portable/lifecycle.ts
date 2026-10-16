/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A deployment's lifecycle as its owner drives it (R-17, D-04): pause
 * and resume one exact version, reset what it holds, and the events recorded
 * with who did each. The requests' bodies, the answers read and the words
 * said — the same in the Studio and Datalayer Mobile (M-041b). Pure:
 * each client sends them with its own authentication.
 *
 * @module portable/lifecycle
 */

/** Whether a deployment answers now. */
export type DeploymentState = 'live' | 'paused';

/** Pause or resume, for one exact version: `PATCH /apps/deployments/{uid}`'s body. */
export const stateChangeBody = (
  version: number,
  state: DeploymentState,
): { version: number; state: DeploymentState } => {
  if (!Number.isInteger(version) || version < 1) {
    throw new Error(
      `A deployment's state is changed for one exact version: ${String(version)} is none.`,
    );
  }
  return { version, state };
};

/** What pausing stopped, and what it could not, with why. */
export type StoppedWork = {
  stopped: { what: string; runtime: string }[];
  notStopped: { what: string; runtime: string; why: string }[];
};

const listOf = (raw: unknown): Record<string, unknown>[] =>
  Array.isArray(raw)
    ? (raw.filter(item => item && typeof item === 'object') as Record<
        string,
        unknown
      >[])
    : [];

const said = (value: unknown): string =>
  typeof value === 'string' ? value : value == null ? '' : String(value);

const count = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
};

const plural = (n: number, word: string): string =>
  `${n} ${word}${n === 1 ? '' : 's'}`;

export function stoppedWorkOf(raw: Record<string, unknown>): StoppedWork {
  return {
    stopped: listOf(raw.stopped).map(item => ({
      what: said(item.what),
      runtime: said(item.runtime),
    })),
    notStopped: listOf(raw.not_stopped).map(item => ({
      what: said(item.what),
      runtime: said(item.runtime),
      why: said(item.why),
    })),
  };
}

/** What pausing did, in a sentence. */
export function stoppedWorkLine(work: StoppedWork): string {
  const stopped = work.stopped.length;
  const first =
    stopped === 0
      ? 'Paused: nothing was running.'
      : `Paused: ${plural(stopped, 'session')} in progress stopped.`;
  if (!work.notStopped.length) {
    return first;
  }
  const missed = work.notStopped
    .map(
      item =>
        `${item.what}${item.runtime ? ` (${item.runtime})` : ''}: ${item.why}`,
    )
    .join(' ');
  return `${first} Not stopped — ${missed}`;
}

/** What a Reset deletes, counted for its confirmation. */
export type ResetCounts = {
  conversations: number;
  entries: number;
  schedules: number;
  /**
   * Why its memories stay: they are its application's, not the
   * deployment's (R-18) — forgotten under *What it remembers*.
   */
  memoriesNote: string;
};

export function resetCountsOf(raw: Record<string, unknown>): ResetCounts {
  return {
    conversations: count(raw.conversations),
    entries: count(raw.entries),
    schedules: count(raw.schedules),
    memoriesNote:
      typeof raw.memories_note === 'string' ? raw.memories_note : '',
  };
}

/** The Reset confirmed against the counts the person was shown: `POST …/reset`'s body. */
export const resetBody = (
  counts: Pick<ResetCounts, 'conversations' | 'schedules'>,
): { conversations: number; schedules: number } => ({
  conversations: counts.conversations,
  schedules: counts.schedules,
});

/** What a Reset could not delete, with why: `POST …/reset`'s answer. */
export function notDeletedOf(
  body: Record<string, unknown>,
): { what: string; why: string }[] {
  return listOf(body.not_deleted).map(item => ({
    what: said(item.what),
    why: said(item.why),
  }));
}

/**
 * What goes, as the confirmation lists it — "12 conversations, 2
 * schedules" — and what does not, said apart.
 */
export function resetLines(counts: ResetCounts): {
  goes: string;
  stays: string[];
} {
  return {
    goes: [
      plural(counts.conversations, 'conversation'),
      plural(counts.schedules, 'schedule'),
    ].join(', '),
    stays: [
      'The deployment, its address and the version it runs stay.',
      ...(counts.memoriesNote ? [counts.memoriesNote] : []),
    ],
  };
}

/** What happened to a deployment, recorded with who did it (D-04, R-17). */
export type DeploymentEventKind =
  'promoted' | 'rolled_back' | 'paused' | 'resumed' | 'reset';

const EVENT_KINDS: readonly DeploymentEventKind[] = [
  'promoted',
  'rolled_back',
  'paused',
  'resumed',
  'reset',
];

/** Who promoted, rolled back, paused, resumed or reset a deployment, and when. */
export type DeploymentEvent = {
  uid: string;
  kind: DeploymentEventKind;
  actor: string;
  at: string;
  details: Record<string, unknown>;
};

export function deploymentEventOf(
  raw: Record<string, unknown>,
): DeploymentEvent {
  if (!EVENT_KINDS.includes(raw.kind as DeploymentEventKind)) {
    throw new Error(
      `A deployment's event of no known kind: ${String(raw.kind)}.`,
    );
  }
  return {
    uid: said(raw.uid),
    kind: raw.kind as DeploymentEventKind,
    actor: said(raw.actor_handle || raw.actor_uid || ''),
    at: typeof raw.at === 'string' ? raw.at : '',
    details:
      raw.details && typeof raw.details === 'object'
        ? (raw.details as Record<string, unknown>)
        : {},
  };
}

/**
 * One event, in a line: "Paused by eric, 4 Oct 2026, 10:12", "Rolled back
 * from version 3 to version 2 by eric, …".
 */
export function deploymentEventLine(
  event: DeploymentEvent,
  locale?: string,
): string {
  const from = count(event.details.from);
  const to = count(event.details.to);
  const moved = from && to ? ` from version ${from} to version ${to}` : '';
  const verb = {
    promoted: `Promoted${moved}`,
    rolled_back: `Rolled back${moved}`,
    paused: 'Paused',
    resumed: 'Resumed',
    reset: 'Reset',
  }[event.kind];
  const when = event.at
    ? new Date(event.at).toLocaleString(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '';
  const deleted = event.details.deleted as Record<string, unknown> | undefined;
  const what =
    event.kind === 'reset' && deleted
      ? ` — ${plural(count(deleted.conversations), 'conversation')} and ${plural(count(deleted.schedules), 'schedule')} deleted`
      : '';
  // Paused by an owner of its owner's organization (I-09): said as such.
  const forOrganization =
    event.kind === 'paused' && event.details.by === 'organization_owner'
      ? ', an owner of your organization'
      : '';
  return `${verb}${event.actor ? ` by ${event.actor}${forOrganization}` : ''}${when ? `, ${when}` : ''}${what}`;
}
