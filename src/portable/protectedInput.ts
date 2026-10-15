/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Mediated sign-in (PAP_DATALAYER P-03, MOBILE M-039): a personal agent signs
 * the person in at a company that asks for what only the person knows — a
 * name and a password, or a code the company sent them. The person types it
 * on a page of their own Datalayer client, signed in to Datalayer; it goes
 * to IAM with the one-use protected ticket the sign-in named
 * (`/pap/my/protected/{ticket}`), which passes it to the company once. The
 * agent never sees it. The Studio's `/pap/sign-in` and Datalayer Mobile use
 * this one module.
 *
 * Pure but for the given `fetch`: nothing typed is kept — not in an address,
 * not in storage, not in an error.
 *
 * @module portable/protectedInput
 */

/** One thing the company asks the person to type. */
export type ProtectedField = {
  name: string;
  label: string;
  /** Typed as a password: hidden, never filled in by the browser. */
  secret: boolean;
};

/** What the company asks, of whom, until when. */
export type ProtectedRequest = {
  companyName: string;
  /** The company's own domain: what the person can check. */
  companyDomain: string;
  purpose: 'credentials' | 'one_time_code';
  fields: ProtectedField[];
  /** Where the company sent its code, when it did. */
  sentTo: string | null;
  expiresAt: string;
};

/** What IAM keeps of one field, at most. */
export const MAX_VALUE_LENGTH = 1024;

/** What the page says (checked against the vocabulary). */
export const PROTECTED_INPUT_WORDS = {
  title: (company: string): string => `Sign in at ${company}`,
  intro: (company: string): string =>
    `Your personal agent is signing you in at ${company}, which asks for what only you know. Type it here: Datalayer passes it to ${company} once, and your agent never sees it.`,
  asks: 'Who asks',
  where: 'Where',
  whereHint: 'The company’s address: the part you can check.',
  sentCode: (company: string, sentTo: string): string =>
    `${company} sent a code to ${sentTo}.`,
  sentCodeSomewhere: (company: string): string => `${company} sent you a code.`,
  code: 'Code',
  signIn: (company: string): string => `Sign in at ${company}`,
  sendCode: 'Send the code',
  sending: 'Sending…',
  fillEvery: 'Fill in every field.',
  tooLong: (label: string): string =>
    `${label} is longer than ${MAX_VALUE_LENGTH} characters.`,
  done: 'Done. Go back to your conversation: the agent continues once it checks.',
  expires: (at: string): string =>
    `This request ends at ${new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}.`,
  reading: 'Reading the request…',
  gone: 'This request is unknown, already answered or expired. Ask your personal agent to start again.',
  incomplete:
    'This link is incomplete: it names no request. Start again from your personal agent.',
  signedOut: 'Sign in to Datalayer first.',
} as const;

const TICKET = /^[A-Za-z0-9_-]{8,256}$/;
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;

/** Whether a link names a request. */
export const ticketComplete = (ticket: string): boolean =>
  TICKET.test(ticket.trim());

/** Raised when IAM does not know the request (unknown, answered or expired): the page says only that. */
export class ProtectedRequestGone extends Error {
  constructor() {
    super(PROTECTED_INPUT_WORDS.gone);
    this.name = 'ProtectedRequestGone';
  }
}

/** IAM's answer read whole, or refused with a sentence: no default. */
export function protectedRequestOf(raw: unknown): ProtectedRequest {
  const refused = () => new Error('The request could not be read.');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw refused();
  }
  const data = raw as Record<string, unknown>;
  if (
    typeof data.company_name !== 'string' ||
    typeof data.company_domain !== 'string' ||
    !data.company_domain ||
    (data.purpose !== 'credentials' && data.purpose !== 'one_time_code') ||
    !Array.isArray(data.fields) ||
    data.fields.length === 0 ||
    data.fields.length > 10 ||
    typeof data.expires_at !== 'string' ||
    !(
      data.sent_to === null ||
      data.sent_to === undefined ||
      typeof data.sent_to === 'string'
    )
  ) {
    throw refused();
  }
  const names = new Set<string>();
  const fields = data.fields.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw refused();
    }
    const entry = item as Record<string, unknown>;
    if (
      typeof entry.name !== 'string' ||
      !FIELD_NAME.test(entry.name) ||
      names.has(entry.name) ||
      typeof entry.label !== 'string' ||
      typeof entry.secret !== 'boolean'
    ) {
      throw refused();
    }
    names.add(entry.name);
    return {
      name: entry.name,
      label: entry.label || entry.name,
      secret: entry.secret,
    };
  });
  if (data.purpose === 'one_time_code' && fields.length !== 1) {
    throw refused();
  }
  return {
    companyName: data.company_name || data.company_domain,
    companyDomain: data.company_domain,
    purpose: data.purpose,
    fields,
    sentTo:
      typeof data.sent_to === 'string' && data.sent_to ? data.sent_to : null,
    expiresAt: data.expires_at,
  };
}

/** The fields still empty, by name: the form is sent only when there is none. */
export const emptyFields = (
  request: Pick<ProtectedRequest, 'fields'>,
  values: Record<string, string>,
): string[] =>
  request.fields
    .filter(field => !(values[field.name] ?? '').trim())
    .map(field => field.name);

/** What keeps the form from being sent, in sentences; none when it can be. Never what was typed. */
export function fieldProblems(
  request: Pick<ProtectedRequest, 'fields'>,
  values: Record<string, string>,
): string[] {
  const problems: string[] = [];
  if (emptyFields(request, values).length) {
    problems.push(PROTECTED_INPUT_WORDS.fillEvery);
  }
  for (const field of request.fields) {
    if ((values[field.name] ?? '').length > MAX_VALUE_LENGTH) {
      problems.push(PROTECTED_INPUT_WORDS.tooLong(field.label));
    }
  }
  return problems;
}

/** The words on the one button. */
export const submitWords = (
  request: Pick<ProtectedRequest, 'purpose' | 'companyName'>,
): string =>
  request.purpose === 'one_time_code'
    ? PROTECTED_INPUT_WORDS.sendCode
    : PROTECTED_INPUT_WORDS.signIn(request.companyName);

/** What the code page says of where the code went. */
export const sentWords = (
  request: Pick<ProtectedRequest, 'companyName' | 'sentTo'>,
): string =>
  request.sentTo
    ? PROTECTED_INPUT_WORDS.sentCode(request.companyName, request.sentTo)
    : PROTECTED_INPUT_WORDS.sentCodeSomewhere(request.companyName);

/**
 * The body sent: exactly the fields asked, none empty, as typed. A code is
 * sent without its spaces; a password, exactly as typed.
 */
export function submitBody(
  request: Pick<ProtectedRequest, 'fields' | 'purpose'>,
  values: Record<string, string>,
): {
  values: Record<string, string>;
} {
  const problems = fieldProblems(request, values);
  if (problems.length) {
    throw new Error(problems.join(' '));
  }
  const sent: Record<string, string> = {};
  for (const field of request.fields) {
    const typed = values[field.name];
    sent[field.name] =
      request.purpose === 'one_time_code' ? typed.replace(/\s+/g, '') : typed;
  }
  return { values: sent };
}

/** The ticket a mediated sign-in page names (`…?ticket=`), or `''`. */
export function ticketOfPage(open: string): string {
  try {
    const ticket = new URL(open).searchParams.get('ticket') ?? '';
    return ticketComplete(ticket) ? ticket.trim() : '';
  } catch {
    return '';
  }
}

/** IAM's protected-input routes, with the person's own sign-in. */
export function protectedInputClient({
  iamUrl,
  getAccessToken,
  fetch: fetcher,
}: {
  iamUrl: string;
  getAccessToken: () => string | undefined;
  fetch: typeof fetch;
}) {
  const address = (ticket: string): string => {
    if (!iamUrl) {
      throw new Error('Datalayer’s sign-in service is not configured.');
    }
    return `${iamUrl.replace(/\/+$/, '')}/api/iam/v1/pap/my/protected/${encodeURIComponent(ticket.trim())}`;
  };
  const headers = (): Record<string, string> => {
    const token = getAccessToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };
  /** IAM's refusal in its own sentence; never what was typed. */
  const answered = async (
    response: Response,
    what: string,
  ): Promise<Record<string, unknown>> => {
    const body = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (response.status === 404) {
      throw new ProtectedRequestGone();
    }
    if (!response.ok) {
      throw new Error(
        `${what}: ${typeof body.detail === 'string' ? body.detail : response.status}`,
      );
    }
    return body;
  };
  return {
    /** What the company asks; reading it does not use the request up. */
    read: async (ticket: string): Promise<ProtectedRequest> =>
      protectedRequestOf(
        await answered(
          await fetcher(address(ticket), { headers: headers() }),
          'The request could not be read',
        ),
      ),
    /** What the person typed, sent once to IAM. */
    send: async (
      ticket: string,
      request: Pick<ProtectedRequest, 'fields' | 'purpose'>,
      values: Record<string, string>,
    ): Promise<void> => {
      const body = submitBody(request, values);
      const answer = await answered(
        await fetcher(address(ticket), {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify(body),
        }),
        'It was not sent',
      );
      if (answer.kept !== true) {
        throw new Error(
          'It was not sent: the answer does not say it was kept.',
        );
      }
    },
  };
}
