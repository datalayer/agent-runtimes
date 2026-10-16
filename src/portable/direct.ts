/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A Direct Conversation the person types in themselves (P-08,
 * M-038): a linked sub-conversation under the one a company answered
 * in, where the person's own words go to the company as `sender: human`,
 * never through the application's model, until the company closes it.
 *
 * Each message takes a one-use ticket IAM gives the person for one
 * application, one company and one conversation (`POST /pap/my/direct`, with
 * their own sign-in), then goes to the gateway with it (`POST
 * /api/mcp/v1/pap/direct`); the company's replies are read back from the
 * cursor last read (`GET /api/mcp/v1/pap/direct`), never by sending again.
 * One client for every page (the Studio's chat, Datalayer Mobile): the
 * addresses, the person's sign-in and `fetch` are given.
 *
 * Pure but for the given `fetch`: no React, DOM or storage.
 *
 * @module portable/direct
 */

/** Where the person writes: the application, the company by its domain, and the conversation there. */
export type DirectTarget = {
  appUid: string;
  company: string;
  conversationId: string;
};

/** One reply of the company, and who wrote it there. */
export type DirectReply = { text: string; from: 'agent' | 'human' };

/** What the company answered, and where the conversation stands. */
export type DirectAnswer = {
  directConversation: string;
  replies: DirectReply[];
  status: string;
  responder: string;
  cursor: string;
  /** The `PapReplies` display, when the company wrote anything. */
  display: unknown;
};

/** The longest message the gateway takes. */
export const DIRECT_MAX = 4000;

/** What a page says around the person's own words. */
export const DIRECT_WORDS = {
  notConfigured:
    'Datalayer is not configured to send your words to a company here.',
  signIn:
    'Sign in to Datalayer first: only you write in your Direct Conversation.',
  tooLong: `Write a message of at most ${DIRECT_MAX} characters.`,
  empty: 'Write something to send.',
  unread: (company: string): string => `${company}'s answer could not be read.`,
  write: (company: string): string => `Write to ${company} yourself`,
  says: (company: string): string =>
    `Your own words to ${company}, sent as yours, not through the application`,
  writing: (company: string): string => `Writing to ${company} yourself`,
  how: 'What you write here goes to the company as your own words, never through the application. The company’s answers appear here.',
  you: 'You',
  agent: 'Its agent',
  human: 'One of its people',
  back: 'Back to the application',
  closed: (company: string): string =>
    `${company} closed this conversation: write through the application again.`,
  locked: (company: string): string =>
    `You are writing to ${company} yourself: go back to the application to talk to it.`,
} as const;

/** The addresses of IAM and the gateway, the person's sign-in, and `fetch`. */
export type DirectClientOptions = {
  iamUrl: string;
  gatewayUrl: string;
  getAccessToken: () => string | undefined;
  fetch: typeof fetch;
};

const root = (url: string): string => url.replace(/\/+$/, '');

/** The sentence a refusal carries: its `note` (closed, none, another) or its `detail`. */
async function refusal(response: Response, fallback: string): Promise<Error> {
  const body = (await response.json().catch(() => ({}))) as {
    note?: unknown;
    detail?: unknown;
  };
  const said =
    typeof body.note === 'string'
      ? body.note
      : typeof body.detail === 'string'
        ? body.detail
        : '';
  return new Error(said || `${fallback} (${response.status})`);
}

/** The gateway's answer, read whole or refused. */
export function directAnswerOf(raw: unknown, company: string): DirectAnswer {
  const data = raw as Record<string, unknown> | null;
  const replies = data?.replies;
  if (
    !data ||
    typeof data.direct_conversation !== 'string' ||
    !Array.isArray(replies) ||
    typeof data.status !== 'string' ||
    replies.some(
      reply =>
        !reply ||
        typeof (reply as DirectReply).text !== 'string' ||
        ((reply as DirectReply).from !== 'agent' &&
          (reply as DirectReply).from !== 'human'),
    )
  ) {
    throw new Error(DIRECT_WORDS.unread(company));
  }
  return {
    directConversation: data.direct_conversation,
    replies: (replies as DirectReply[]).map(reply => ({
      text: reply.text,
      from: reply.from,
    })),
    status: data.status,
    responder: typeof data.responder === 'string' ? data.responder : '',
    cursor: typeof data.cursor === 'string' ? data.cursor : '',
    display: data.display ?? null,
  };
}

/** IAM's ticket and the gateway's Direct Conversation routes, as the person. */
export function directClient({
  iamUrl,
  gatewayUrl,
  getAccessToken,
  fetch: fetcher,
}: DirectClientOptions) {
  const bearer = (): Record<string, string> => {
    const token = getAccessToken();
    if (!token) {
      throw new Error(DIRECT_WORDS.signIn);
    }
    return { Authorization: `Bearer ${token}` };
  };
  const configured = (...urls: string[]): void => {
    if (urls.some(url => !url)) {
      throw new Error(DIRECT_WORDS.notConfigured);
    }
  };

  /** A one-use ticket for one message, asked of IAM with the person's own sign-in. */
  const ticket = async (target: DirectTarget): Promise<string> => {
    configured(iamUrl);
    const response = await fetcher(`${root(iamUrl)}/api/iam/v1/pap/my/direct`, {
      method: 'POST',
      headers: { ...bearer(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_uid: target.appUid,
        company: target.company,
        conversation_id: target.conversationId,
      }),
    });
    if (!response.ok) {
      throw await refusal(response, 'Your words could not be sent');
    }
    const body = (await response.json()) as { ticket?: unknown };
    if (typeof body.ticket !== 'string' || !body.ticket) {
      throw new Error('Your words could not be sent: no ticket came back.');
    }
    return body.ticket;
  };

  return {
    ticket,
    /**
     * The person's own words, sent as theirs: a ticket, then the words with
     * it. Refused in the gateway's sentence, and never retried.
     */
    send: async (target: DirectTarget, text: string): Promise<DirectAnswer> => {
      const words = text.trim();
      if (!words) {
        throw new Error(DIRECT_WORDS.empty);
      }
      if (words.length > DIRECT_MAX) {
        throw new Error(DIRECT_WORDS.tooLong);
      }
      configured(gatewayUrl);
      const used = await ticket(target);
      const response = await fetcher(
        `${root(gatewayUrl)}/api/mcp/v1/pap/direct`,
        {
          method: 'POST',
          headers: { ...bearer(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticket: used, text: words }),
        },
      );
      if (!response.ok) {
        throw await refusal(response, 'Your words were not sent');
      }
      return directAnswerOf(await response.json(), target.company);
    },
    /** What the company wrote since `cursor`: read, never sent again. */
    read: async (target: DirectTarget, cursor = ''): Promise<DirectAnswer> => {
      configured(gatewayUrl);
      const query = new URLSearchParams({
        app_uid: target.appUid,
        company: target.company,
        conversation_id: target.conversationId,
      });
      if (cursor) {
        query.set('cursor', cursor);
      }
      const response = await fetcher(
        `${root(gatewayUrl)}/api/mcp/v1/pap/direct?${query.toString()}`,
        { headers: bearer() },
      );
      if (!response.ok) {
        throw await refusal(response, DIRECT_WORDS.unread(target.company));
      }
      return directAnswerOf(await response.json(), target.company);
    },
  };
}

export type DirectClient = ReturnType<typeof directClient>;

/** One line of the Direct Conversation: the person's, or the company's (its agent or one of its people). */
export type DirectLine = { from: 'you' | 'agent' | 'human'; text: string };

/** A Direct Conversation open under its parent: the parent's composer is locked while it is. */
export type DirectOpen = {
  /** Before the first words, the conversation it opens under; after, the Direct Conversation itself. */
  target: DirectTarget;
  lines: DirectLine[];
  cursor: string;
  /** Closed by the company: nothing more is sent, and the parent is talked to again. */
  closed: boolean;
};

/** A Direct Conversation opened under the conversation a company answered in. */
export const openDirect = (target: DirectTarget): DirectOpen => ({
  target,
  lines: [],
  cursor: '',
  closed: false,
});

/** The open conversation with what the company answered, and the person's words when they sent some. */
export function withDirectAnswer(
  open: DirectOpen,
  answer: DirectAnswer,
  mine?: string,
): DirectOpen {
  return {
    target: {
      ...open.target,
      conversationId: answer.directConversation || open.target.conversationId,
    },
    lines: [
      ...open.lines,
      ...(mine !== undefined
        ? [{ from: 'you' as const, text: mine.trim() }]
        : []),
      ...answer.replies.map(reply => ({ from: reply.from, text: reply.text })),
    ],
    cursor: answer.cursor || open.cursor,
    closed: answer.status === 'closed',
  };
}

/** Who wrote a line, said apart: the person, the company's agent, one of its people. */
export const directAuthor = (line: DirectLine): string =>
  line.from === 'you'
    ? DIRECT_WORDS.you
    : line.from === 'agent'
      ? DIRECT_WORDS.agent
      : DIRECT_WORDS.human;
