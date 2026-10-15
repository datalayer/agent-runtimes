/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What the gateway's `pap_sign_in` tool answers, read and checked
 * (AGENT_PROTOCOLS PI-56, PAP_DATALAYER P-03): the person signs in at a
 * company themselves — on the company's page (`direct`), by entering a
 * code there (`device`), or by typing what the company asks on Datalayer's
 * own page (`mediated`), never in the conversation. The chat shows the link,
 * the code and until when; the agent never sees what the person types. A
 * business over PACT answers its `pact_sign_in` the same way (a `device`
 * sign-in at the business).
 *
 * Pure: no React. A test reaches it without a chat around it.
 *
 * Kept in `portable/` (MOBILE M-037): Datalayer Mobile reads the same
 * sign-in with the same checks; the web plugin re-exports it.
 *
 * @module portable/signIn
 */

/** A sign-in waiting for the person, as the card shows it. */
export type PapSignInWaiting = {
  mode: 'direct' | 'device' | 'mediated';
  /** The company's page — Datalayer's own, for `mediated` — `https` only. */
  open: string;
  /** The page's domain, read from its address: what the person can trust. */
  host: string;
  /**
   * The company's domain, when the gateway names it: for a bound `direct`
   * sign-in the page opened is Datalayer's start link (PAP_DATALAYER P-04),
   * which sends the person on to the company and takes them back only from it.
   */
  company?: string;
  /** The code to enter, for `device`. */
  code?: string;
  /** Where the company sent a code, for `mediated`, when it did. */
  sentTo?: string;
  /** Until when, ISO 8601. */
  expiresAt?: string;
  /**
   * What the company said it needs (its `authorization` event's scope,
   * PAP_DATALAYER P-02): what the person is asked to allow there.
   */
  needs?: string[];
};

/** What the card says. */
export const PAP_SIGN_IN_WORDS = {
  title: (host: string): string => `Sign in at ${host}`,
  direct:
    'Open the company’s page through Datalayer, sign in there, and this conversation goes on once you are back.',
  device: 'Open the company’s page and enter this code there.',
  /** `mediated`: the page is Datalayer's, which names the company and asks what it asks. */
  mediatedTitle: (host: string): string => `Sign in through ${host}`,
  mediated:
    'Open this page: it names the company and asks what the company needs. Type it there, never in this conversation.',
  sentTo: (to: string): string => `The company sent a code to ${to}.`,
  needs: (scopes: string[]): string => `It needs: ${scopes.join(', ')}.`,
  open: (host: string): string => `Open ${host}`,
  code: 'Your code',
  copy: 'Copy the code',
  copied: 'Copied',
  until: (at: string): string =>
    `Until ${new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}.`,
  checkAgain: 'I have signed in: check again',
  tellMe: 'Tell me when you are done.',
  checkMessage: (host: string): string =>
    `I have signed in at ${host}. Please check again.`,
  refused: 'This sign-in link cannot be opened safely, so it is not shown.',
  qr: (host: string): string => `A code to scan to open ${host} on your phone`,
  /** Once the person's browser came back from the company (P-04), said under the card. */
  returned: {
    signed_in: (company: string): string =>
      `Signed in at ${company}: checking again.`,
    denied: (company: string): string =>
      `You did not sign in at ${company}: ask again when you want to.`,
    refused: (company: string): string =>
      `That sign-in at ${company} was refused, and nothing was kept: start it again here.`,
  },
} as const;

/**
 * Where Datalayer's `/pap/signed-in` page says a Direct Sign-In came back
 * (PAP_DATALAYER P-04): the card waiting for that company hears it in the
 * person's tab, so the conversation goes on there.
 */
export const PAP_SIGN_IN_CHANNEL = 'datalayer-pap-sign-in';

/** How a Direct Sign-In came back. */
export type PapSignInReturn = keyof typeof PAP_SIGN_IN_WORDS.returned;

/** One OAuth scope token (RFC 6749 §3.3). */
const SCOPE = /^[\x21\x23-\x5B\x5D-\x7E]{1,128}$/;

const DOMAIN =
  /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** What a message on the channel says of this company's sign-in, or `null`: another company's, or not one. */
export function signInReturnOf(
  message: unknown,
  company: string,
): PapSignInReturn | null {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return null;
  }
  const said = message as Record<string, unknown>;
  const outcome = said.outcome;
  return said.company === company &&
    (outcome === 'signed_in' || outcome === 'denied' || outcome === 'refused')
    ? outcome
    : null;
}

/**
 * `pap_sign_in` — or a business's `pact_sign_in` (PI-56) — as the gateway
 * names it with or without a prefix.
 */
export const PAP_SIGN_IN_TOOL = /(^|[_.:\-/])pa(?:p|ct)_sign_in$/;

/** Whether a tool is `pap_sign_in` or `pact_sign_in`, as the gateway names it with or without a prefix. */
export const isPapSignInTool = (name: string): boolean =>
  PAP_SIGN_IN_TOOL.test(name);

/** An MCP result's own object: its structured content, or the JSON of its text. */
function unwrapped(result: unknown): unknown {
  let value = result;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const data = value as Record<string, unknown>;
  if (data.structuredContent && typeof data.structuredContent === 'object') {
    return unwrapped(data.structuredContent);
  }
  if (Array.isArray(data.content)) {
    const text = (data.content as Array<Record<string, unknown>>).find(
      part => part?.type === 'text' && typeof part.text === 'string',
    );
    return text ? unwrapped(text.text) : null;
  }
  // FastMCP wraps a non-object answer as `{result: …}`.
  if (data.result && typeof data.result === 'object' && !('status' in data)) {
    return unwrapped(data.result);
  }
  return data;
}

/** The page's address, `https` only; `null` for anything else. */
export function safeSignInUrl(open: unknown): URL | null {
  if (typeof open !== 'string') {
    return null;
  }
  try {
    const url = new URL(open);
    return url.protocol === 'https:' && url.hostname ? url : null;
  } catch {
    return null;
  }
}

/**
 * The sign-in waiting for the person, or why it is not shown: `null` for a
 * result that is not one (another status: the chat's default row says it),
 * `{ refused }` for a link that is not `https`.
 */
export function readPapSignIn(
  result: unknown,
): PapSignInWaiting | { refused: string } | null {
  const data = unwrapped(result) as Record<string, unknown> | null;
  if (!data || data.status !== 'waiting_for_the_person') {
    return null;
  }
  if (
    data.mode !== 'direct' &&
    data.mode !== 'device' &&
    data.mode !== 'mediated'
  ) {
    return null;
  }
  const url = safeSignInUrl(data.open);
  if (!url) {
    return { refused: PAP_SIGN_IN_WORDS.refused };
  }
  if (data.mode === 'device' && (typeof data.code !== 'string' || !data.code)) {
    return null;
  }
  // A bound Direct Sign-In opens Datalayer's start link: the card names the company the gateway
  // names (`PapSignIn.company`); without one, the page's own domain is the company's.
  const company =
    typeof data.company === 'string' && DOMAIN.test(data.company)
      ? data.company
      : '';
  // What the company said it needs: scope tokens only, anything else not shown.
  const needs = Array.isArray(data.needs)
    ? data.needs.filter(
        (scope): scope is string =>
          typeof scope === 'string' && SCOPE.test(scope),
      )
    : [];
  return {
    mode: data.mode,
    open: url.toString(),
    host: url.hostname,
    ...(company ? { company } : {}),
    ...(typeof data.code === 'string' && data.code ? { code: data.code } : {}),
    ...(data.mode === 'mediated' &&
    typeof data.sent_to === 'string' &&
    data.sent_to
      ? { sentTo: data.sent_to }
      : {}),
    ...(typeof data.expires_at === 'string' && data.expires_at
      ? { expiresAt: data.expires_at }
      : {}),
    ...(needs.length > 0 ? { needs } : {}),
  };
}
