/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A conversation run as an anonymous visitor (the user, 15 November 2026):
 * what the chat is told (`runAsAnonymous`, `maxTurns`, where *Sign in* goes),
 * what it says, and the visitor's turns as this browser counts them.
 *
 * The visitors' runtime is the authority: it admits so many turns a day per
 * visitor and so many minutes per conversation, and refuses past them in
 * its own sentence. The count here is for what the chat shows — the turns
 * left, the prompt closed once they are taken — and for nothing else. With
 * no `maxTurns` the chat enforces no limit of its own.
 *
 * Pure but for the storage it is handed.
 *
 * @module chat/anonymous/anonymousMode
 */

/** How a host runs a conversation as an anonymous visitor. */
export type ChatAnonymous = {
  /**
   * The turns a visitor has today, as the chat counts and shows them; none:
   * no limit enforced by the chat (the runtime's own still holds).
   */
  maxTurns?: number;
  /** Where *Sign in* goes: a page's address. */
  signInUrl?: string;
  /** What *Sign in* does, in place of going to `signInUrl`. */
  onSignIn?: () => void;
  /**
   * The limited preview's call to action in the host's words, for a viewer
   * who has no reason to sign in (a signed-in person trying a demo on the
   * visitors' runtime): its sentence in place of *Sign in to save your
   * work.*, its button's word in place of *Sign in*, and what the button
   * does — in the limited-preview indicator's overlay
   * (`apps/plugins/limited-preview`). The turns left and the rest stay.
   */
  callToAction?: ChatCallToAction;
};

/** A host's call to action, in a visitor's limited-preview indicator. */
export type ChatCallToAction = {
  /** Its first sentence: *Make it yours: open your own Shopper.* */
  says: string;
  /** Its button's word: *Open your own Shopper*. */
  label: string;
  /** What its button does. */
  onAction: () => void;
};

/**
 * A conversation's minutes on the visitors' runtime (its chart's default):
 * the temporary key's clock, held full until the first question.
 */
export const ANONYMOUS_MINUTES = 15;

/** Where Datalayer signs a visitor in, when the host names nothing else. */
export const DATALAYER_SIGN_IN = 'https://datalayer.ai/signin';

/** What the chat says to an anonymous visitor, in the platform's words. */
export const ANONYMOUS_WORDS = {
  /** What a visitor cannot use. */
  someDisabled: 'Some features are disabled.',
  signIn: 'Sign in',
  /** The temporary key's clock, in the header. */
  trialKey: (name: string) => (name ? `${name}'s trial key` : 'Trial key'),
  /** While the temporary key is asked for and checked. */
  validating: 'Getting a visitor’s key…',
  /** The day's turns are taken. */
  turnsTaken: (max: number) =>
    `You have taken today’s ${max} turns without an account: sign in to keep going, or come back tomorrow.`,
  /** The conversation has had its minutes. */
  minutesSpent: (minutes: number = ANONYMOUS_MINUTES) =>
    `This conversation without an account has had its ${minutes} minutes: start a new one, or sign in to keep going.`,
  /** A tool refused for want of an account. */
  signInToUse: (tool: string) => `Sign in to use ${tool}`,
  /**
   * A UI the agent brings that needs the person's own connection, drawn
   * locked for a visitor (`apps/plugins/locked-ui`): what its chip says.
   */
  locked: {
    linkedin: 'Sign in to LinkedIn',
    social: 'Sign in to link X, Bluesky',
    x: 'Sign in to post on X',
  },
  /** The locked chips' title: why they are locked. */
  lockedWhy: 'Needs an account: sign in to use it with this agent.',
} as const;

/** `maxTurns` as the chat takes it: a whole number above none, else no limit. */
export function maxTurnsOf(value: unknown): number | undefined {
  const turns = typeof value === 'string' ? Number(value) : value;
  return typeof turns === 'number' && Number.isInteger(turns) && turns > 0
    ? turns
    : undefined;
}

/**
 * Where *Sign in* goes: the host's address, else Datalayer's sign-in page,
 * brought back to `page` once signed in (`post_auth_redirect`, as the sign-in
 * page reads it).
 */
export function signInTarget(signInUrl: string | undefined, page: string) {
  if (signInUrl) {
    return signInUrl;
  }
  return `${DATALAYER_SIGN_IN}?post_auth_redirect=${encodeURIComponent(page)}`;
}

/** Where the browser keeps the day's count: the landing's key, kept. */
export const VISITOR_TURNS_KEY = 'datalayer-agent-visitor-turns';

/** The day's count, as kept. */
export type TurnsKept = { day: string; taken: number };

/** The day a moment falls in, in UTC, as the runtime counts it: `2026-11-15`. */
export const dayOf = (now: number): string =>
  new Date(now).toISOString().slice(0, 10);

/** The turns left today, never below none. */
export const turnsLeft = (taken: number, max: number): number =>
  Math.max(0, max - taken);

/** The day's count from what was kept: none for another day or nothing readable. */
export function turnsToday(kept: unknown, now: number): number {
  if (!kept || typeof kept !== 'object') {
    return 0;
  }
  const { day, taken } = kept as Partial<TurnsKept>;
  return day === dayOf(now) &&
    typeof taken === 'number' &&
    Number.isFinite(taken)
    ? Math.max(0, taken)
    : 0;
}

/** One more turn today: what is to be kept. */
export function takeTurn(kept: unknown, now: number): TurnsKept {
  return { day: dayOf(now), taken: turnsToday(kept, now) + 1 };
}

/** The count as the browser keeps it, or nothing when it keeps none. */
export function readTurns(
  storage: Pick<Storage, 'getItem'> | undefined,
): unknown {
  try {
    const raw = storage?.getItem(VISITOR_TURNS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Keep the count; a browser that keeps nothing counts while the page is open. */
export function writeTurns(
  storage: Pick<Storage, 'setItem'> | undefined,
  kept: TurnsKept,
): void {
  try {
    storage?.setItem(VISITOR_TURNS_KEY, JSON.stringify(kept));
  } catch {
    // Nothing kept: the page still counts while it is open.
  }
}

/**
 * Why no turn is left, or `''`: the conversation's minutes spent (counted
 * from its first turn), or the day's turns taken when the host counts them.
 */
export function anonymousRefusal({
  taken,
  maxTurns,
  startedAt,
  now,
  minutes = ANONYMOUS_MINUTES,
}: {
  taken: number;
  maxTurns?: number;
  startedAt: number | null;
  now: number;
  minutes?: number;
}): string {
  if (startedAt !== null && now - startedAt >= minutes * 60_000) {
    return ANONYMOUS_WORDS.minutesSpent(minutes);
  }
  if (maxTurns !== undefined && taken >= maxTurns) {
    return ANONYMOUS_WORDS.turnsTaken(maxTurns);
  }
  return '';
}

/** What a refusal for want of an account reads like, in a tool's result. */
const AUTH_REFUSAL =
  /\b(401|403)\b|unauthori[sz]ed|forbidden|not authenticated|authentication (required|failed)|requires? (a )?sign[- ]?in|sign in to use|needs you signed in|without an account/i;

/** The visitors' runtime's refusal of a tool in a visitor's turn. */
const VISITOR_REFUSAL =
  /^\W*Without an account (it only reads|nobody is asked)/;

/** The text of a tool's result or error, however it came. */
function textOf(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Whether a tool call's result says it was refused for want of an account:
 * an HTTP 401 or 403, or the runtime's own *requires sign-in*. Asked of a
 * call that ran and failed, never of the tools' discovery.
 */
export function isAuthRefusal(call: {
  status?: string;
  error?: unknown;
  executionError?: unknown;
  result?: unknown;
}): boolean {
  const said = [call.error, call.executionError]
    .map(textOf)
    .filter(Boolean)
    .join(' ');
  if (said && AUTH_REFUSAL.test(said)) {
    return true;
  }
  if (call.status !== 'error' && call.status !== 'complete') {
    return false;
  }
  const result = call.result as
    { status_code?: unknown; status?: unknown; error?: unknown } | undefined;
  if (result && typeof result === 'object') {
    const code = Number(result.status_code ?? result.status);
    if (code === 401 || code === 403) {
      return true;
    }
    if (result.error && AUTH_REFUSAL.test(textOf(result.error))) {
      return true;
    }
  }
  const answer = textOf(call.result);
  // The visitors' runtime's own refusal, returned as the tool's answer
  // (`agent_runtimes.apps.visitors`): "Without an account it only reads: …".
  if (VISITOR_REFUSAL.test(answer)) {
    return true;
  }
  return call.status === 'error' && AUTH_REFUSAL.test(answer);
}
