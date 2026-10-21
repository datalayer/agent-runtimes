/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A thread opened from a person's history, to go on with it (P-24).
 *
 * A thread is a session of an application: its uid is the conversation's
 * AG-UI thread. Opened again, its conversation is read from the runtime the
 * chat runs on — the session's messages while the runtime holds it
 * (`GET …/sessions/{uid}/messages`, D-13), else the session resumed from its
 * record (`POST …/sessions/{uid}/resume` with the agent, R-04), whose
 * stream's `MESSAGES_SNAPSHOT` says what it holds — and the chat draws it
 * and goes on with it on the same thread.
 *
 * Opening it is `openThread` (`portable/thread`), as every client opens one;
 * here is what a deployment's chat decides of the thread it opens on — and
 * the web's deep link to a session, `?session=<uid>` on the chat's URL
 * (`sessionOfSearch`).
 *
 * @module apps/apps/threads
 */

import type { ResumedThread } from '../../types/chat';

/**
 * The deployment an application's agent is created for, as its create
 * payload names it (`app_instance.deployment_uid`, `appDatalayerCreatePayload`),
 * or `''` for a Preview, a test or no application.
 */
export function deploymentOfPayload(
  createPayload: Record<string, unknown> | undefined,
): string {
  const instance = createPayload?.app_instance;
  if (!instance || typeof instance !== 'object') {
    return '';
  }
  const uid = (instance as { deployment_uid?: unknown }).deployment_uid;
  return typeof uid === 'string' ? uid.trim() : '';
}

/**
 * The thread a deployment's chat opens on when its host gave none: a new one,
 * `id` (the release gates, found on r1, 14 October 2026).
 *
 * A deployment's agent serves every visitor, and what its runtime holds in
 * memory is the last run's, whoever ran it: drawn as the page's
 * conversation, a second account opening the same link saw the first
 * person's turns. A given thread is drawn as given and never replaced by the
 * runtime's snapshot, so each visitor sees only their own conversation —
 * this one, or one opened from their history. A Preview, or a chat that runs
 * no deployment, keeps what it was given.
 */
export function threadOfVisit(
  given: ResumedThread | undefined,
  deploymentUid: string,
  id: string,
): ResumedThread | undefined {
  if (given || !deploymentUid) {
    return given;
  }
  return { id, messages: [] };
}

/**
 * The session a chat's URL names, `?session=<uid>` (the web's deep link):
 * the chat opens that session as its thread when its host gave none. A
 * uid is 8 to 128 letters, digits, hyphens or underscores (`SESSION_UID`);
 * anything else is no session and refused in a sentence rather than sent
 * to the runtime.
 */
export function sessionOfSearch(search: string): string {
  const uid = (new URLSearchParams(search).get('session') ?? '').trim();
  if (!uid) {
    return '';
  }
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(uid)) {
    throw new Error(
      `?session=${uid} names no session: a session uid is 8 to 128 letters, digits, hyphens or underscores.`,
    );
  }
  return uid;
}
