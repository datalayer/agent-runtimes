/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * How a sign-in under way stands, asked by the person's own client (M-039): the gateway's `GET /api/mcp/v1/pap/sign-in?app_uid&company`, with
 * the person's own sign-in, finishes what can be finished — a Direct return
 * IAM bound to their browser and the company asked, a Device code the
 * company confirmed — and says where it stands.
 *
 * A continuation is accepted only when it is bound: the answer names the
 * application and the company the card was for, and a verified issuer. The
 * client then goes on in the same conversation (its session), once.
 *
 * Pure but for the given `fetch`.
 *
 * @module portable/signInStatus
 */

/** Where the gateway answers how a sign-in stands. */
export const SIGN_IN_STATUS_PATH = '/api/mcp/v1/pap/sign-in';

/** How often a client asks while a sign-in waits, and never past its expiry. */
export const SIGN_IN_POLL_MS = 5000;

export type SignInStands = {
  appUid: string;
  company: string;
  issuer: string;
  status:
    'pending' | 'signed_in' | 'refused' | 'denied' | 'not_started' | 'other';
  reason: string;
};

const STATUSES = [
  'pending',
  'signed_in',
  'refused',
  'denied',
  'not_started',
] as const;

/** The gateway's answer, or `null` when it does not bind to this application and company. */
export function signInStandsOf(
  raw: unknown,
  expected: { appUid: string; company: string },
): SignInStands | null {
  const data =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;
  if (
    !data ||
    data.app_uid !== expected.appUid ||
    typeof data.company !== 'string' ||
    data.company.toLowerCase() !== expected.company.toLowerCase() ||
    typeof data.issuer !== 'string' ||
    !data.issuer.startsWith('https://')
  ) {
    return null;
  }
  return {
    appUid: expected.appUid,
    company: data.company,
    issuer: data.issuer,
    status: STATUSES.find(status => status === data.status) ?? 'other',
    reason: typeof data.reason === 'string' ? data.reason : '',
  };
}

/** Asks how a sign-in stands; `null` for none under way (404) or an answer that does not bind. */
export function signInStatusClient({
  baseUrl,
  getAccessToken,
  fetch: fetcher,
}: {
  baseUrl: string;
  getAccessToken: () => string | undefined;
  fetch: typeof fetch;
}) {
  return async (
    appUid: string,
    company: string,
  ): Promise<SignInStands | null> => {
    const token = getAccessToken();
    if (!token) {
      return null;
    }
    const query = new URLSearchParams({ app_uid: appUid, company });
    const response = await fetcher(
      `${baseUrl.replace(/\/+$/, '')}${SIGN_IN_STATUS_PATH}?${query.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      },
    );
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(
        `How the sign-in at ${company} stands could not be read (${response.status}).`,
      );
    }
    return signInStandsOf(await response.json(), { appUid, company });
  };
}
