/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What a host says outside the chat about a session, and when (VSCODE
 * VS-07, VS-10; DESKTOP DK-14, DK-25): the approvals, the questions, the
 * finished turns, a runtime gone — pure, no host API, no React.
 *
 * - **An approval raised** — an *ask me first* decision — is said as a
 *   notification that names the application, the action and its class
 *   (*read*, *write*, *send*, *buy*, *delete*, *execute*, *publish*) and
 *   never its arguments (DESKTOP decision D-8: a notification is read on a
 *   lock screen): the request is read whole in the chat, and a decision
 *   from the notification is allowed only once the chat has shown it. The
 *   decision goes through the place's one way after the approval is read
 *   again: one answered elsewhere (409, or no longer pending) is said so;
 *   one that is gone (404) reveals nothing.
 * - **The count** of sessions waiting for the person: the editor's status
 *   bar, the desktop's dock badge and tray.
 * - **A finished turn**, a question asked or a runtime gone, of a session
 *   the chat does not show, is said as a notification with the first line
 *   of its answer; the session in front is never notified (what the person
 *   is looking at needs no toast).
 *
 * @module portable/attention
 */

import { actionOf } from './approvalCard';
import type { SessionAttention } from './sessionList';

export type { SessionAttention } from './sessionList';

/** The Rules' classes of an action, as the Shield names them. */
export type ActionClass =
  'read' | 'write' | 'send' | 'buy' | 'delete' | 'execute' | 'publish';

/** Every class, for a strict read of what an approval says. */
export const ACTION_CLASSES: readonly ActionClass[] = [
  'read',
  'write',
  'send',
  'buy',
  'delete',
  'execute',
  'publish',
];

/**
 * A coding agent's ACP `kind`, as a class: `read`, `search`, `fetch` read;
 * `edit`, `move` write; `delete` deletes; `execute` executes; `other` is a
 * write (fail closed), as the Shield maps them.
 */
export const ACP_KIND_CLASSES: Readonly<Record<string, ActionClass>> = {
  read: 'read',
  search: 'read',
  fetch: 'read',
  edit: 'write',
  move: 'write',
  delete: 'delete',
  execute: 'execute',
  other: 'write',
};

/** The verbs a tool's name starts with, when the approval names no class. */
const NAMED_CLASSES: readonly [RegExp, ActionClass][] = [
  [/^(run|exec|execute|shell|bash|terminal|command)\b/i, 'execute'],
  [/^(delete|remove|rm|drop|unlink)\b/i, 'delete'],
  [/^(send|mail|email|reply|message|post)\b/i, 'send'],
  [/^(publish|deploy|release|push)\b/i, 'publish'],
  [/^(buy|pay|purchase|order|charge)\b/i, 'buy'],
  [/^(read|search|fetch|grep|glob|list|find|get|view|open|cat)\b/i, 'read'],
];

/** An approval, as the chat's banner holds it. */
export interface ApprovalRaised {
  /** Its id where it is decided (ai-agents, or the local runtime). */
  id: string;
  /** The tool waiting on it. */
  toolName: string;
  /** Its arguments: read for the class only, never said in a notification. */
  args: Record<string, unknown>;
  /** The agent waiting on it. */
  agentId: string;
  /** When it was asked. */
  requestedAt: string;
}

const text = (value: unknown): string =>
  typeof value === 'string' ? value : '';

/**
 * The class of what an approval asks: `_class` when it names one of the
 * seven, else its ACP `_kind` mapped, else the verb its tool's name starts
 * with; `write` when nothing says (fail closed, as `other` is).
 *
 * @param approval - Its tool and arguments.
 *
 * @returns One of the seven classes.
 */
export function actionClassOf(
  approval: Pick<ApprovalRaised, 'toolName' | 'args'>,
): ActionClass {
  const named = text(approval.args._class).toLowerCase();
  if ((ACTION_CLASSES as readonly string[]).includes(named)) {
    return named as ActionClass;
  }
  const kind = ACP_KIND_CLASSES[text(approval.args._kind).toLowerCase()];
  if (kind) {
    return kind;
  }
  const words = approval.toolName.replace(/[_\-.:/]+/g, ' ').trim();
  for (const [verb, cls] of NAMED_CLASSES) {
    if (verb.test(words)) {
      return cls;
    }
  }
  return 'write';
}

/** The notification's three answers, in their order. */
export const APPROVAL_ACTIONS = ['Approve', 'Decline', 'Show'] as const;
/** One of the notification's answers. */
export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number];

/** What a host says of approvals and decisions. */
export const ATTENTION_WORDS = {
  /**
   * The sentence of a notification: *Support Desk asks to Run git push (execute)*.
   *
   * @param app - The application asking.
   * @param action - What it asks to do, in words.
   * @param cls - The action's class.
   *
   * @returns The sentence.
   */
  asks: (app: string, action: string, cls: ActionClass): string =>
    `${app} asks to ${action} (${cls})`,
  notShown: 'Open the chat to read the whole request before deciding it: Show.',
  answeredElsewhere: 'This approval was answered elsewhere.',
  gone: 'This approval is no longer waiting.',
  approved: (action: string): string => `Approved: ${action}.`,
  declined: (action: string): string => `Declined: ${action}.`,
  refused: (status: number): string => `The decision was refused (${status}).`,
  working: 'Datalayer: working…',
  waiting: (count: number): string => `Datalayer: ${count} waiting for you`,
  finished: (title: string): string => `${title} finished its turn.`,
  asksYou: (title: string): string => `${title} is waiting for you.`,
  runtimeGone: (title: string): string => `${title}: its runtime went away.`,
} as const;

/**
 * The notification an approval is said as: the application, the action in
 * words (`send_email` → *Send email*) and its class — never its arguments.
 *
 * @param app - The application asking.
 * @param approval - What it asks: its tool and arguments.
 *
 * @returns The message and its answers.
 */
export function approvalNotification(
  app: string,
  approval: Pick<ApprovalRaised, 'toolName' | 'args'>,
): { message: string; actions: readonly ApprovalAction[] } {
  return {
    message: ATTENTION_WORDS.asks(
      app,
      actionOf(approval.toolName),
      actionClassOf(approval),
    ),
    actions: APPROVAL_ACTIONS,
  };
}

/**
 * The approvals to notify: those pending now that were not seen before —
 * each is notified once, however often the banner is read again.
 *
 * @param seen - The ids notified already.
 * @param pending - What is pending now.
 *
 * @returns The approvals not seen before, in the order asked.
 */
export function newlyRaised<T extends { id: string }>(
  seen: ReadonlySet<string>,
  pending: readonly T[],
): T[] {
  return pending.filter(approval => !seen.has(approval.id));
}

/**
 * Whether a decision may be taken from the notification: only once the chat
 * has shown the request whole at least once.
 *
 * @param shown - The ids the chat has shown.
 * @param id - The approval to decide.
 *
 * @returns Whether deciding is allowed.
 */
export function decisionAllowed(
  shown: ReadonlySet<string>,
  id: string,
): boolean {
  return shown.has(id);
}

/**
 * Whether an approval read again still waits: decided only then.
 *
 * @param readAgain - The approval as read again, or null when the read failed.
 *
 * @returns Whether it is still pending.
 */
export function stillPending(
  readAgain: { status?: unknown } | null | undefined,
): boolean {
  return Boolean(readAgain) && text(readAgain?.status) === 'pending';
}

/**
 * What a decision came to, in a sentence: done; answered elsewhere (409);
 * gone (404, which reveals nothing of it); refused with its status.
 *
 * @param status - The route's status.
 * @param approved - Whether approval was asked.
 * @param action - The action in words.
 *
 * @returns The sentence.
 */
export function decisionOutcome(
  status: number,
  approved: boolean,
  action: string,
): string {
  if (status >= 200 && status < 300) {
    return approved
      ? ATTENTION_WORDS.approved(action)
      : ATTENTION_WORDS.declined(action);
  }
  if (status === 409) {
    return ATTENTION_WORDS.answeredElsewhere;
  }
  if (status === 404) {
    return ATTENTION_WORDS.gone;
  }
  return ATTENTION_WORDS.refused(status);
}

/** The turn's phase in words, after the state. */
const phaseWords: Record<SessionAttention['turn'], string> = {
  idle: '',
  running: 'answering',
  waiting: 'waiting for you',
  '': '',
};

/**
 * One session in a sentence: *Open · answering — shield-mvp-claude-code*.
 *
 * @param session - Its state, turn and agent.
 *
 * @returns The sentence.
 */
export function sessionSaid(session: SessionAttention): string {
  const state = session.state.charAt(0).toUpperCase() + session.state.slice(1);
  const phase = session.state === 'open' ? phaseWords[session.turn] : '';
  const stated = phase ? `${state} · ${phase}` : state;
  return session.agent ? `${stated} — ${session.agent}` : stated;
}

/**
 * The sessions waiting for the person: open, their turn waiting.
 *
 * @param sessions - The sessions watched.
 *
 * @returns The waiting ones, in order.
 */
export function waitingSessions(
  sessions: readonly SessionAttention[],
): SessionAttention[] {
  return sessions.filter(
    session => session.state === 'open' && session.turn === 'waiting',
  );
}

/**
 * What a dock badge counts (DK-14): the sessions waiting for the person.
 *
 * @param sessions - The sessions watched.
 *
 * @returns The count; zero clears the badge.
 */
export function badgeCount(sessions: readonly SessionAttention[]): number {
  return waitingSessions(sessions).length;
}

/**
 * The status bar's item (VS-10): *Datalayer: 2 waiting for you* when sessions
 * wait (the first waiting one is what a click opens), *Datalayer: working…*
 * while a turn of any runs, nothing otherwise. The tooltip says the
 * session in front.
 *
 * @param sessions - The sessions watched.
 *
 * @returns The item, or null when it is hidden.
 */
export function statusBarItem(
  sessions: readonly SessionAttention[],
): { text: string; tooltip: string; first: string | null } | null {
  const open = sessions.filter(session => session.state === 'open');
  const waiting = open.filter(session => session.turn === 'waiting');
  const running = open.filter(session => session.turn === 'running');
  const front = sessions.find(session => session.inFront);
  const tooltip = front ? `${front.title}: ${sessionSaid(front)}` : '';
  const [firstWaiting] = waiting;
  if (firstWaiting) {
    return {
      text: ATTENTION_WORDS.waiting(waiting.length),
      tooltip: tooltip || `${firstWaiting.title}: ${sessionSaid(firstWaiting)}`,
      first: firstWaiting.key,
    };
  }
  const [firstRunning] = running;
  if (firstRunning) {
    return {
      text: ATTENTION_WORDS.working,
      tooltip: tooltip || `${firstRunning.title}: ${sessionSaid(firstRunning)}`,
      first: firstRunning.key,
    };
  }
  return null;
}

/** One entry of a tray's menu (DK-14). */
export interface TrayEntry {
  /** The session's key, or empty for the heading. */
  key: string;
  label: string;
}

/**
 * The tray's menu: a heading with the count, then one *Open* entry per
 * session waiting for the person; *Nothing waits for you* when none does.
 *
 * @param sessions - The sessions watched.
 *
 * @returns The entries, the heading first.
 */
export function trayMenuOf(sessions: readonly SessionAttention[]): TrayEntry[] {
  const waiting = waitingSessions(sessions);
  if (waiting.length === 0) {
    return [{ key: '', label: 'Nothing waits for you' }];
  }
  return [
    { key: '', label: ATTENTION_WORDS.waiting(waiting.length) },
    ...waiting.map(session => ({
      key: session.key,
      label: `Open ${session.title || session.key}`,
    })),
  ];
}

/** A notification about a session's turn. */
export interface TurnNotice {
  key: string;
  title: string;
  said: string;
  /** What fired it. */
  kind: 'finished' | 'asks' | 'gone';
}

const firstLine = (value: string | undefined): string =>
  (value ?? '').split('\n').find(line => line.trim()) ?? '';

/**
 * The turns to notify between two readings: a session **not in front**
 * whose turn was running and is not any more (the first line of its answer,
 * else that it finished), whose turn came to wait for the person (a
 * question, `loop.ask`), or whose runtime went away. The session in front
 * is never notified; a session first seen is not.
 *
 * @param before - The sessions as last read.
 * @param after - The sessions as read now.
 *
 * @returns The notices, in the order of `after`.
 */
export function finishedTurns(
  before: readonly SessionAttention[],
  after: readonly SessionAttention[],
): TurnNotice[] {
  const was = new Map(before.map(session => [session.key, session]));
  const notices: TurnNotice[] = [];
  for (const session of after) {
    if (session.inFront) {
      continue;
    }
    const earlier = was.get(session.key);
    if (!earlier) {
      continue;
    }
    const title = session.title || session.key;
    if (earlier.held !== false && session.held === false) {
      notices.push({
        key: session.key,
        title,
        said: ATTENTION_WORDS.runtimeGone(title),
        kind: 'gone',
      });
      continue;
    }
    if (session.state !== 'open') {
      continue;
    }
    if (earlier.turn !== 'waiting' && session.turn === 'waiting') {
      notices.push({
        key: session.key,
        title,
        said: ATTENTION_WORDS.asksYou(title),
        kind: 'asks',
      });
      continue;
    }
    if (earlier.turn === 'running' && session.turn !== 'running') {
      notices.push({
        key: session.key,
        title,
        said: firstLine(session.lastAnswer) || ATTENTION_WORDS.finished(title),
        kind: 'finished',
      });
    }
  }
  return notices;
}

/**
 * How the OS cues the person (DK-14, Omnigent's rule): a banner when the
 * host is not in front; a dock bounce or a taskbar flash when it is, so
 * nothing covers what they look at.
 *
 * @param frontmost - Whether the host's window is focused.
 *
 * @returns `banner` or `cue`.
 */
export function cueOf(frontmost: boolean): 'banner' | 'cue' {
  return frontmost ? 'cue' : 'banner';
}
