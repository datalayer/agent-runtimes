/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The person's sessions in one list (VSCODE VS-04, VS-12; DESKTOP DK-09,
 * DK-25): on Datalayer (the record, through ai-agents) and on this machine
 * (a local runtime's `GET /api/v1/apps/sessions`, which lists every local
 * session since the file store is one) — grouped by place then application,
 * each row as `loop sessions list` prints it (title, state with the turn
 * phase, agent and harness, turns, lineage, *not held*), filtered by
 * application, state and title, the archived hidden; the person's team runs
 * with their seats.
 *
 * The rule of two holders (DESKTOP D-12): a session `open` on this machine
 * and held by none of the host's own runtimes is open in another host (VS
 * Code, a terminal) and is not resumed from here until it is `paused`.
 *
 * Pure: no host API, no network. The host fetches and draws; the verbs are
 * the chat's (`loop.session.action`).
 *
 * @module portable/sessionList
 */

import {
  sessionAgentSaid,
  sessionLineageSaid,
  type SessionRow,
  sessionRowOf,
  type SessionState,
  sessionStateSaid,
} from './activity';

/** Where a session runs: Datalayer's record, or a local runtime of one folder. */
export type SessionPlace =
  | { kind: 'datalayer' }
  | { kind: 'local'; folder: string; folderName: string; url: string };

/**
 * One key per place.
 *
 * @param place - The place.
 *
 * @returns `datalayer`, or `local:<folder>`.
 */
export function placeKey(place: SessionPlace): string {
  return place.kind === 'datalayer' ? 'datalayer' : `local:${place.folder}`;
}

/**
 * The place as a list labels it.
 *
 * @param place - The place.
 *
 * @returns *On Datalayer*, or *On this machine — <folder>*.
 */
export function placeLabel(place: SessionPlace): string {
  return place.kind === 'datalayer'
    ? 'On Datalayer'
    : `On this machine — ${place.folderName}`;
}

/**
 * Where a session is listed on Datalayer: the record, through ai-agents, for its opener.
 *
 * @param aiAgentsUrl - ai-agents' base URL.
 * @param openedBy - The person's uid.
 *
 * @returns The URL.
 */
export function datalayerSessionsUrl(
  aiAgentsUrl: string,
  openedBy: string,
): string {
  return `${aiAgentsUrl.replace(/\/$/, '')}/api/ai-agents/v1/apps/sessions?opened_by=${encodeURIComponent(openedBy)}`;
}

/** The session API's list route on a runtime. */
export const LOCAL_SESSIONS_PATH = '/api/v1/apps/sessions';

/** The application a session belongs to, as the list groups it. */
export interface SessionApplication {
  /** The application's uid, else its id on the runtime, else empty. */
  key: string;
  /** Its name, else its id, else its uid. */
  name: string;
}

/** A session as listed, with the application it belongs to and its folder when the row names one. */
export interface ListedSession {
  row: SessionRow;
  application: SessionApplication;
  /**
   * The folder a local harness session runs in — the row's `workspace`
   * (agent-runtimes 1.5.71, DESKTOP DK-26), else its `harness_session`'s;
   * empty when the row names none.
   */
  workspace: string;
}

function said(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * The application of a raw session row: ai-agents' rows carry `app_uid`;
 * a runtime's rows carry `app: {id, name}` and `instance.app_uid`.
 *
 * @param raw - The row as answered.
 *
 * @returns The application's key and name.
 */
export function applicationOf(
  raw: Record<string, unknown>,
): SessionApplication {
  const app =
    raw.app && typeof raw.app === 'object'
      ? (raw.app as Record<string, unknown>)
      : {};
  const instance =
    raw.instance && typeof raw.instance === 'object'
      ? (raw.instance as Record<string, unknown>)
      : {};
  const uid = said(raw.app_uid) || said(instance.app_uid);
  const id = said(app.id) || (typeof raw.app === 'string' ? raw.app : '');
  return {
    key: uid || id,
    name: said(app.name) || id || uid || 'An application',
  };
}

/**
 * The folder a raw row names for its harness session: `workspace` on the
 * row (the list's rows since 1.5.71), else `harness_session.workspace`
 * (`GET /sessions/{uid}` on a runtime that holds it).
 *
 * @param raw - The row as answered.
 *
 * @returns The folder, or empty.
 */
export function workspaceOf(raw: Record<string, unknown>): string {
  const own = said(raw.workspace);
  if (own) {
    return own;
  }
  const harness =
    raw.harness_session && typeof raw.harness_session === 'object'
      ? (raw.harness_session as Record<string, unknown>)
      : {};
  return said(harness.workspace);
}

/**
 * One listed session from a raw row: refused by `sessionRowOf` when it is
 * malformed, never defaulted.
 *
 * @param raw - The row as answered.
 *
 * @returns The session with its application and folder.
 */
export function listedSessionOf(raw: Record<string, unknown>): ListedSession {
  return {
    row: sessionRowOf(raw),
    application: applicationOf(raw),
    workspace: workspaceOf(raw),
  };
}

/**
 * The sessions a list route answered (`{sessions, has_more}`), each with its
 * application; a row whose state is none of the three is refused by
 * `sessionRowOf`, never defaulted.
 *
 * @param body - The route's answer.
 *
 * @returns The sessions, in the route's order.
 *
 * @throws Error when the answer lists no sessions, or a row is malformed.
 */
export function listedSessionsOf(body: unknown): ListedSession[] {
  const sessions =
    body && typeof body === 'object'
      ? (body as Record<string, unknown>).sessions
      : undefined;
  if (!Array.isArray(sessions)) {
    throw new Error('The answer for the sessions names no sessions.');
  }
  return sessions.map(raw => listedSessionOf(raw as Record<string, unknown>));
}

/** What the list is narrowed to; empty strings narrow nothing. */
export interface SessionFilter {
  /** An application's key or name, matched case-insensitively. */
  app: string;
  /** One state, or any. */
  state: SessionState | '';
  /** A piece of the title, matched case-insensitively. */
  title: string;
  /** One place's kind, or any. */
  place?: SessionPlace['kind'] | '';
}

/** Nothing narrowed. */
export const NO_FILTER: SessionFilter = {
  app: '',
  state: '',
  title: '',
  place: '',
};

/**
 * The sessions the filter keeps: the archived never, then by application,
 * state and title.
 *
 * @param sessions - The sessions listed.
 * @param filter - What to keep.
 *
 * @returns The sessions kept, in order.
 */
export function filterSessions<T extends ListedSession>(
  sessions: readonly T[],
  filter: SessionFilter,
): T[] {
  const app = filter.app.trim().toLowerCase();
  const title = filter.title.trim().toLowerCase();
  return sessions.filter(({ row, application }) => {
    if (row.archived) {
      return false;
    }
    if (filter.state && row.state !== filter.state) {
      return false;
    }
    if (
      app &&
      !application.key.toLowerCase().includes(app) &&
      !application.name.toLowerCase().includes(app)
    ) {
      return false;
    }
    if (title && !row.title.toLowerCase().includes(title)) {
      return false;
    }
    return true;
  });
}

/**
 * The filter in words, for a view's description.
 *
 * @param filter - The filter.
 *
 * @returns *application: x · state: open · title: y*, or empty when nothing is narrowed.
 */
export function filterSaid(filter: SessionFilter): string {
  return [
    filter.place ? `place: ${filter.place}` : '',
    filter.app.trim() ? `application: ${filter.app.trim()}` : '',
    filter.state ? `state: ${filter.state}` : '',
    filter.title.trim() ? `title: ${filter.title.trim()}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** One application's sessions under a place. */
export interface SessionGroup<T extends ListedSession = ListedSession> {
  application: SessionApplication;
  sessions: T[];
}

/**
 * The sessions grouped by application, in the order the applications first appear.
 *
 * @param sessions - The sessions kept.
 *
 * @returns The groups.
 */
export function groupByApplication<T extends ListedSession>(
  sessions: readonly T[],
): SessionGroup<T>[] {
  const groups = new Map<string, SessionGroup<T>>();
  for (const session of sessions) {
    const key = session.application.key || session.application.name;
    let group = groups.get(key);
    if (!group) {
      group = { application: session.application, sessions: [] };
      groups.set(key, group);
    }
    group.sessions.push(session);
  }
  return [...groups.values()];
}

/**
 * A row's label: its title, else its uid.
 *
 * @param row - The session.
 *
 * @returns The label.
 */
export function rowLabel(row: SessionRow): string {
  return row.title || row.uid;
}

/**
 * A row's description, as `loop sessions list` prints it: the state with the
 * turn phase, the agent with its harness, the turns, the lineage, *not held*
 * for an open session whose runtime is gone.
 *
 * @param row - The session.
 *
 * @returns The parts joined with ` · `.
 */
export function rowDescription(row: SessionRow): string {
  const turns = `${row.turns} turn${row.turns === 1 ? '' : 's'}`;
  const lineage = sessionLineageSaid(row);
  return [
    sessionStateSaid(row),
    sessionAgentSaid(row),
    turns,
    lineage ? lineage.charAt(0).toLowerCase() + lineage.slice(1) : '',
    row.state === 'open' && row.held === false ? 'not held' : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The icon of a row's state, as a codicon id: the turn phase as its icon when open.
 *
 * @param row - The session.
 *
 * @returns A codicon id.
 */
export function stateIconOf(row: Pick<SessionRow, 'state' | 'turn'>): string {
  if (row.state === 'ended') {
    return 'circle-slash';
  }
  if (row.state === 'paused') {
    return 'debug-pause';
  }
  if (row.turn === 'running') {
    return 'sync~spin';
  }
  if (row.turn === 'waiting') {
    return 'question';
  }
  return 'circle-filled';
}

/**
 * The context value a host's menus match: `session-<state>-<place kind>`.
 *
 * @param row - The session.
 * @param place - Its place.
 *
 * @returns E.g. `session-paused-local`.
 */
export function contextValueOf(
  row: Pick<SessionRow, 'state'>,
  place: SessionPlace,
): string {
  return `session-${row.state}-${place.kind}`;
}

/**
 * The one row a place that did not answer shows.
 *
 * @param place - The place.
 * @param message - What went wrong, the server's words.
 *
 * @returns The sentence.
 */
export function placeProblemSentence(
  place: SessionPlace,
  message: string,
): string {
  return place.kind === 'datalayer'
    ? `Datalayer did not answer for your sessions: ${message}`
    : `The local runtime of ${place.folderName} did not answer: ${message}`;
}

/** The sentence under a place with no session. */
export const NOTHING_LISTED = 'No session yet.';

/** The sentence under *On Datalayer* while signed out. */
export const SIGNED_OUT_SENTENCE =
  'Sign in to Datalayer to see your sessions there.';

/**
 * The sentence under *On this machine* while no local runtime runs.
 *
 * @param howToStart - How the host starts one: *Datalayer: Start the local runtime*, *File → Work in a folder…*.
 *
 * @returns The sentence.
 */
export function noLocalRuntimeSentence(howToStart: string): string {
  return `No local runtime is running: start a coding agent in a folder, or ${howToStart}.`;
}

/** The sentence under *On this machine* while no folder was ever worked in (DK-09). */
export const NO_LOCAL_SESSION_YET =
  'No session on this machine yet — File → Work in a folder…';

// ---------------------------------------------------------------------------
// The two places merged (DK-09)
// ---------------------------------------------------------------------------

/** What one place answered: its sessions, or why it did not. */
export type SessionsOfPlace =
  | { place: SessionPlace; sessions: ListedSession[]; problem?: undefined }
  | { place: SessionPlace; sessions?: undefined; problem: string };

/** A session with its place, as the merged list holds it. */
export interface SessionEntry extends ListedSession {
  place: SessionPlace;
  /**
   * The session is `open` on this machine and held by none of the host's
   * own runtimes: open in VS Code or a terminal (D-12).
   */
  elsewhere: boolean;
}

/** A place in the merged list: its entries by application, or its problem. */
export interface PlaceGroup {
  place: SessionPlace;
  groups: SessionGroup<SessionEntry>[];
  /** The one row the place shows instead of sessions, when it has one. */
  note: string;
}

/**
 * Whether a row listed on this machine is held elsewhere: `open`, and held
 * by none of the host's runtimes — the local runtime that listed it says
 * `held` for its own and `false` for every other runtime's.
 *
 * @param row - The session.
 * @param place - Its place.
 *
 * @returns Whether another host holds it.
 */
export function heldElsewhere(
  row: Pick<SessionRow, 'state' | 'held'>,
  place: SessionPlace,
): boolean {
  return place.kind === 'local' && row.state === 'open' && row.held === false;
}

/**
 * The two places merged into one list: each place's sessions grouped by
 * application (the archived hidden, the filter applied), the same uid
 * listed once per place, a place that did not answer one note, a place
 * with nothing one note.
 *
 * @param places - What each place answered, Datalayer first.
 * @param filter - What to keep.
 *
 * @returns The places in order, each with its groups or its note.
 */
export function mergePlaces(
  places: readonly SessionsOfPlace[],
  filter: SessionFilter = NO_FILTER,
): PlaceGroup[] {
  return places
    .filter(answered => !filter.place || answered.place.kind === filter.place)
    .map(answered => {
      if (answered.problem !== undefined) {
        return {
          place: answered.place,
          groups: [],
          note: placeProblemSentence(answered.place, answered.problem),
        };
      }
      const seen = new Set<string>();
      const entries: SessionEntry[] = [];
      for (const listed of answered.sessions) {
        if (seen.has(listed.row.uid)) {
          continue;
        }
        seen.add(listed.row.uid);
        entries.push({
          ...listed,
          place: answered.place,
          elsewhere: heldElsewhere(listed.row, answered.place),
        });
      }
      const kept = filterSessions(entries, filter);
      return {
        place: answered.place,
        groups: groupByApplication(kept),
        note: kept.length === 0 ? NOTHING_LISTED : '',
      };
    });
}

/**
 * Where a session is, in words: *on Datalayer*, *on this machine · <folder>*,
 * or *on this machine · folder unknown* when the row names none (DK-26).
 *
 * @param entry - The session with its place.
 *
 * @returns The sentence.
 */
export function placeSaid(
  entry: Pick<SessionEntry, 'place' | 'workspace'>,
): string {
  if (entry.place.kind === 'datalayer') {
    return 'on Datalayer';
  }
  return `on this machine · ${entry.workspace || 'folder unknown'}`;
}

/** The sentence when a session held elsewhere is resumed from here (D-12). */
export const ELSEWHERE_SENTENCE =
  'This session is open in VS Code or a terminal: pause it there to resume it here.';

/**
 * Why a session cannot be resumed from here, or null when it can: an
 * `open` session held elsewhere waits until it is `paused`; an `ended`
 * one is over; one `open` and held here is already in front.
 *
 * @param entry - The session with its place.
 *
 * @returns The sentence, or null.
 */
export function resumeRefusal(
  entry: Pick<SessionEntry, 'row' | 'elsewhere'>,
): string | null {
  if (entry.elsewhere) {
    return ELSEWHERE_SENTENCE;
  }
  if (entry.row.state === 'ended') {
    return `${rowLabel(entry.row)} has ended: clone it from a turn to go on from there.`;
  }
  return null;
}

/**
 * An entry's description: the row's, then where it is, then *open in VS
 * Code or a terminal* when it is held elsewhere.
 *
 * @param entry - The session with its place.
 *
 * @returns The parts joined with ` · `.
 */
export function entryDescription(entry: SessionEntry): string {
  return [
    rowDescription(entry.row),
    placeSaid(entry),
    entry.elsewhere ? 'open in VS Code or a terminal' : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

// ---------------------------------------------------------------------------
// Teams (VS-12; DESKTOP DK-16, postponed)
// ---------------------------------------------------------------------------

/** A seat of a team run: its execution, its session when it has one. */
export interface TeamSeat {
  executionId: string;
  /** The seat's id, from `team:<team>/<seat>`. */
  seat: string;
  /** The execution's state word. */
  status: string;
  /** The seat's session on Datalayer, when the control plane bound one. */
  sessionUid: string;
  /** The execution's status message, when it has one. */
  statusMessage: string;
}

/** A team run: the root execution and its seats. */
export interface TeamRun {
  executionId: string;
  team: string;
  /** The run's state as a session's (MH-22). */
  state: SessionState;
  /** The execution's own state word. */
  status: string;
  goal: string;
  createdAt: string;
  updatedAt: string;
  /** The supervisor's last line, when the execution carries one. */
  steering: string;
  seats: TeamSeat[];
}

/** A seat's agent id names its team: `team:<team>/<seat>`. */
export const TEAM_PREFIX = 'team:';

const OPEN_WORDS = new Set([
  'created',
  'assigned',
  'running',
  'waiting',
  'retrying',
]);
const ENDED_WORDS = new Set(['completed', 'failed', 'cancelled', 'terminated']);

/**
 * A team run's state as a session's (MH-22): `created|assigned|running|waiting|retrying`
 * → `open`, `paused` → `paused`, `completed|failed|cancelled|terminated` → `ended`.
 *
 * @param status - The execution's state word.
 *
 * @returns The session state.
 *
 * @throws Error for any other word.
 */
export function teamStateOf(status: string): SessionState {
  if (OPEN_WORDS.has(status)) {
    return 'open';
  }
  if (status === 'paused') {
    return 'paused';
  }
  if (ENDED_WORDS.has(status)) {
    return 'ended';
  }
  throw new Error(
    `There is no execution state ${JSON.stringify(status)}: one of ${[...OPEN_WORDS, 'paused', ...ENDED_WORDS].join(', ')}.`,
  );
}

/**
 * The team of an execution, from its seat's agent id; empty for none.
 *
 * @param agentId - The execution's agent id.
 *
 * @returns The team's id.
 */
export function teamOf(agentId: string): string {
  return agentId.startsWith(TEAM_PREFIX)
    ? (agentId.slice(TEAM_PREFIX.length).split('/')[0] ?? '')
    : '';
}

/**
 * The seat of an execution, from its agent id; the id itself when it names no seat.
 *
 * @param agentId - The execution's agent id.
 *
 * @returns The seat.
 */
export function seatOf(agentId: string): string {
  if (!agentId.startsWith(TEAM_PREFIX)) {
    return agentId;
  }
  const after = agentId.slice(TEAM_PREFIX.length);
  const slash = after.indexOf('/');
  return slash >= 0 ? after.slice(slash + 1) : after;
}

/**
 * The person's team runs from the control plane's executions
 * (`GET /api/ai-agents/v1/orchestration/executions`): each root execution of
 * a team, newest first, with its seats (the executions below it, by parent),
 * each seat's session uid when the binding carries one.
 *
 * @param executions - The executions answered.
 *
 * @returns The runs.
 *
 * @throws Error for an execution without an id, or a state word that is none.
 */
export function teamRunsOf(executions: readonly unknown[]): TeamRun[] {
  const records = executions.map(raw => {
    const record = raw as Record<string, unknown>;
    const agent =
      record.agent && typeof record.agent === 'object'
        ? (record.agent as Record<string, unknown>)
        : {};
    const objective =
      record.objective && typeof record.objective === 'object'
        ? (record.objective as Record<string, unknown>)
        : {};
    const executionId = said(record.executionId);
    if (!executionId) {
      throw new Error(
        'An execution of the control plane names no executionId.',
      );
    }
    return {
      executionId,
      parentExecutionId: said(record.parentExecutionId),
      rootExecutionId: said(record.rootExecutionId),
      depth: typeof record.depth === 'number' ? record.depth : 0,
      status: said(record.status),
      statusMessage: said(record.statusMessage),
      agentId: said(agent.agentId),
      sessionId: said(agent.sessionId),
      goal: said(objective.goal),
      createdAt: said(record.createdAt),
      updatedAt: said(record.updatedAt),
    };
  });
  const roots = records.filter(
    record => record.depth === 0 && teamOf(record.agentId) !== '',
  );
  roots.sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
  );
  return roots.map(root => ({
    executionId: root.executionId,
    team: teamOf(root.agentId),
    state: teamStateOf(root.status),
    status: root.status,
    goal: root.goal,
    createdAt: root.createdAt,
    updatedAt: root.updatedAt,
    steering: root.statusMessage,
    seats: records
      .filter(
        record =>
          record.parentExecutionId === root.executionId ||
          (record.rootExecutionId === root.executionId &&
            record.executionId !== root.executionId &&
            record.depth === 1),
      )
      .filter(
        (record, index, all) =>
          all.findIndex(other => other.executionId === record.executionId) ===
          index,
      )
      .map(record => ({
        executionId: record.executionId,
        seat: seatOf(record.agentId),
        status: record.status,
        sessionUid: record.sessionId,
        statusMessage: record.statusMessage,
      })),
  }));
}

/**
 * Where the control plane lists the person's executions.
 *
 * @param aiAgentsUrl - ai-agents' base URL.
 *
 * @returns The URL.
 */
export function executionsUrl(aiAgentsUrl: string): string {
  return `${aiAgentsUrl.replace(/\/$/, '')}/api/ai-agents/v1/orchestration/executions`;
}

/**
 * A team run's label: its team and its goal's first line.
 *
 * @param run - The run.
 *
 * @returns The label.
 */
export function teamRunLabel(run: TeamRun): string {
  const goal = run.goal.split('\n')[0]?.trim() ?? '';
  return goal ? `${run.team} — ${goal}` : run.team || run.executionId;
}

/**
 * A team run's description: its state, its seats, its supervisor's last line.
 *
 * @param run - The run.
 *
 * @returns The parts joined with ` · `.
 */
export function teamRunDescription(run: TeamRun): string {
  const state = sessionStateSaid({ state: run.state, turn: '' });
  const seats = `${run.seats.length} seat${run.seats.length === 1 ? '' : 's'}`;
  return [
    run.status === run.state ? state : `${state} (${run.status})`,
    seats,
    run.steering,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * A seat's description: its state and whether its session can be opened.
 *
 * @param seat - The seat.
 *
 * @returns The parts joined with ` · `.
 */
export function teamSeatDescription(seat: TeamSeat): string {
  return [
    seat.status,
    seat.sessionUid ? `session ${seat.sessionUid}` : 'no session yet',
    seat.statusMessage,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The sentence under *Teams* when the person has no run. */
export const NO_TEAM_RUN = 'No team run yet.';

/** The sentence under *Teams* when the control plane did not answer. */
export function teamsProblemSentence(message: string): string {
  return `Datalayer did not answer for your team runs: ${message}`;
}

/** A session as a host watches it for the person's attention: its state, its turn, where it is. */
export interface SessionAttention {
  /** What tells sessions apart: the session's uid, or the chat's choice. */
  key: string;
  title: string;
  /** The agent bound to it. */
  agent: string;
  state: 'open' | 'paused' | 'ended';
  /** The turn's phase of an open session; `''` when unknown. */
  turn: 'idle' | 'running' | 'waiting' | '';
  /** Whether its runtime holds it; `null` when unknown. */
  held: boolean | null;
  /** The chat shows it. */
  inFront: boolean;
  /** The first line of what it last answered, when known. */
  lastAnswer?: string;
}

/**
 * The sessions of a place as a host watches them (VS-10, DK-14): one row
 * per session listed, by its uid, none in front — the chat says which is.
 *
 * @param listed - The place's sessions as read.
 *
 * @returns The rows.
 */
export function attentionRowsOf(
  listed: readonly ListedSession[],
): SessionAttention[] {
  return listed.map(({ row }) => ({
    key: row.uid,
    title: row.title || row.uid,
    agent: row.agent,
    state: row.state,
    turn: row.turn,
    held: row.held,
    inFront: false,
  }));
}
