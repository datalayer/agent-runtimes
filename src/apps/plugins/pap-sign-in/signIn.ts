/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What the gateway's `pap_sign_in` tool answers, read and checked
 * (AGENT_PROTOCOLS PI-56, PAP_DATALAYER P-03): the person signs in at a
 * company themselves — on the company's page (`direct`), or by entering a
 * code there (`device`). The chat shows the link, the code and until when;
 * the agent never sees what the person types.
 *
 * Pure: no React. A test reaches it without a chat around it.
 *
 * @module apps/plugins/pap-sign-in/signIn
 */

/** A sign-in waiting for the person, as the card shows it. */
export type PapSignInWaiting = {
  mode: 'direct' | 'device';
  /** The company's page, `https` only. */
  open: string;
  /** The company's domain, read from the page's address: what the person can trust. */
  host: string;
  /** The code to enter, for `device`. */
  code?: string;
  /** Until when, ISO 8601. */
  expiresAt?: string;
};

/** What the card says. */
export const PAP_SIGN_IN_WORDS = {
  title: (host: string): string => `Sign in at ${host}`,
  direct: 'Open the company’s page, sign in there, and come back here.',
  device: 'Open the company’s page and enter this code there.',
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
} as const;

/** Whether a tool is `pap_sign_in`, as the gateway names it with or without a prefix. */
export const isPapSignInTool = (name: string): boolean =>
  /(^|[_.:\-/])pap_sign_in$/.test(name);

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
  if (data.mode !== 'direct' && data.mode !== 'device') {
    return null;
  }
  const url = safeSignInUrl(data.open);
  if (!url) {
    return { refused: PAP_SIGN_IN_WORDS.refused };
  }
  if (data.mode === 'device' && (typeof data.code !== 'string' || !data.code)) {
    return null;
  }
  return {
    mode: data.mode,
    open: url.toString(),
    host: url.hostname,
    ...(typeof data.code === 'string' && data.code ? { code: data.code } : {}),
    ...(typeof data.expires_at === 'string' && data.expires_at
      ? { expiresAt: data.expires_at }
      : {}),
  };
}
