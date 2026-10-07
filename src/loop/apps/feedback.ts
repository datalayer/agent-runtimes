/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Feedback from the people who use an application (LOOP V-18): a thumb up or
 * down on an answer, and a comment, kept in the application's record.
 *
 * Kept only when the application's `record.include` names `feedback` — its
 * builder says what its record keeps, and the chat offers nothing it would
 * not keep. Sent to the runtime the conversation runs on
 * (`POST /api/v1/apps/feedback`), which writes it through the recorder of
 * that conversation, under its session: the conversation's AG-UI thread.
 *
 * Pure: no React; the network is the `fetch` it is handed.
 *
 * @module loop/apps/feedback
 */

import type { AppSpec } from '../../types/agentspecs';

/** The longest comment kept, as the runtime holds it (`COMMENT_LIMIT`). */
export const FEEDBACK_COMMENT_LIMIT = 2000;

/** What a person says of an answer. */
export type Feedback = {
  /** The conversation, as the runtime knows it. */
  session: string;
  liked: boolean;
  comment: string;
  /**
   * The answer it is about (LOOP P-24): `answer-<n>`, its place among the
   * conversation's answers; none for the conversation as a whole.
   */
  message?: string;
};

/** How an answer is named in feedback: its place among the conversation's answers, from 1. */
export const answerIdOf = (answers: number): string | undefined =>
  answers > 0 ? `answer-${answers}` : undefined;

/** What the feedback strip says, in a person's words. */
export const FEEDBACK_WORDS = {
  ask: 'Was this answer useful?',
  liked: 'Useful',
  disliked: 'Not useful',
  comment: 'Anything to add? (optional)',
  send: 'Send',
  kept: (app: string): string => `Thank you. Kept in ${app}’s record.`,
  where: (app: string): string =>
    `What you say is kept with this conversation in ${app}’s record, for its builder to read.`,
  tooLong: `A comment is at most ${FEEDBACK_COMMENT_LIMIT} characters.`,
  noSession:
    'This conversation has no name the application knows yet: send a message first.',
} as const;

/** Whether an application keeps feedback: its record names it. */
export const keepsFeedback = (app: Pick<AppSpec, 'record'>): boolean =>
  (app.record?.include ?? []).includes('feedback');

/** Where feedback is sent, on the runtime an application runs on. */
export const feedbackEndpoint = (agentBaseUrl: string): string =>
  `${agentBaseUrl.replace(/\/+$/, '')}/api/v1/apps/feedback`;

/** Why feedback cannot be sent as it is; nothing when it can. */
export function feedbackProblems(feedback: Feedback): string[] {
  const problems: string[] = [];
  if (!feedback.session.trim()) {
    problems.push(FEEDBACK_WORDS.noSession);
  }
  if (feedback.comment.trim().length > FEEDBACK_COMMENT_LIMIT) {
    problems.push(FEEDBACK_WORDS.tooLong);
  }
  return problems;
}

/**
 * Send feedback to the runtime, and say what it kept: the entry, in a
 * sentence. A refusal throws the runtime's own sentence.
 */
export async function sendFeedback(
  feedback: Feedback,
  {
    agentBaseUrl,
    token,
    fetcher = fetch,
  }: { agentBaseUrl: string; token?: string | null; fetcher?: typeof fetch },
): Promise<string> {
  const problems = feedbackProblems(feedback);
  if (problems.length) {
    throw new Error(problems.join(' '));
  }
  const response = await fetcher(feedbackEndpoint(agentBaseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      session: feedback.session,
      liked: feedback.liked,
      comment: feedback.comment.trim(),
      ...(feedback.message ? { message: feedback.message } : {}),
    }),
  });
  const body = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    const detail =
      typeof body.detail === 'string' ? body.detail : `${response.status}`;
    throw new Error(`The feedback was not kept: ${detail}`);
  }
  return String(body.summary ?? '');
}
