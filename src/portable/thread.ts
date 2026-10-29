/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A person's conversation with an application, read again: the person-facing
 * projection of a session's thread, and the thread opened from the runtime
 * that holds it — or resumed from its record (P-24, D-13, R-04).
 *
 * The web chat (`ChatView`, an embed after its page reloads) and Datalayer
 * Mobile open a thread with these, so that what a person reads of their own
 * conversation is the same on each. Pure: the network is the `fetch` given.
 *
 * @module portable/thread
 */

import type { ChatMessage } from '../types/messages';
import { eventsOfStream, REACTOR_UI_NAME } from './agui';
import { askedOf } from './records';

/** What opening a thread says, in a person's words. */
export const THREAD_WORDS = {
  opening: 'Opening your conversation…',
  notOpened: (detail: string): string =>
    `Your conversation could not be opened, so this is a new one: ${detail}`,
} as const;

/**
 * A session's conversation as a person reads it, from the AG-UI messages the
 * runtime says (`GET …/sessions/{uid}/messages`, a `MESSAGES_SNAPSHOT`): what
 * was said and answered, in words. A turn a personal agent asked is shown
 * without what the runtime told the application before the person's words
 * (`askedOf`, decided 2026-10-14). What its messages showed comes on the
 * conversation's ui socket (RU-W), never here: a `reactor.ui`
 * activity in a thread is refused.
 */
export function messagesOfThread(messages: unknown): ChatMessage[] {
  if (!Array.isArray(messages)) {
    return [];
  }
  const drawn: ChatMessage[] = [];
  for (const message of messages) {
    if (!message || typeof message !== 'object') {
      continue;
    }
    const { id, role, content, activityType } = message as {
      id?: unknown;
      role?: unknown;
      content?: unknown;
      activityType?: unknown;
    };
    if (role === 'activity' && activityType === REACTOR_UI_NAME) {
      throw new Error(
        `Activity ${String(id)}: what a message showed comes on the ui socket (RU-W)`,
      );
    }
    if (
      (role === 'user' || role === 'assistant') &&
      typeof id === 'string' &&
      typeof content === 'string' &&
      content.trim()
    ) {
      drawn.push({
        id,
        role,
        content: role === 'user' ? askedOf(content) : content,
        createdAt: new Date(),
      });
    }
  }
  return drawn;
}

/** The AG-UI messages a session-API stream's `MESSAGES_SNAPSHOT` carries, if one does. */
export function snapshotOfStream(text: string): unknown[] | undefined {
  let found: unknown[] | undefined;
  for (const event of eventsOfStream(text)) {
    if (event.type === 'MESSAGES_SNAPSHOT' && Array.isArray(event.messages)) {
      found = event.messages;
    }
  }
  return found;
}

async function detailOf(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === 'string' && body.detail) {
      return body.detail;
    }
  } catch {
    // No sentence: the status says it.
  }
  return `${response.status}`;
}

/**
 * A thread's conversation, read from the runtime its application runs on:
 * held there, or resumed from its record. Throws the runtime's sentence when
 * neither answers.
 */
export async function openThread({
  agentBaseUrl,
  agentId,
  uid,
  token,
  fetcher = fetch,
}: {
  agentBaseUrl: string;
  agentId: string;
  uid: string;
  token?: string | null;
  fetcher?: typeof fetch;
}): Promise<ChatMessage[]> {
  const base = `${agentBaseUrl.replace(/\/+$/, '')}/api/v1/apps/sessions/${encodeURIComponent(uid)}`;
  const authorization: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};
  const held = await fetcher(`${base}/messages`, { headers: authorization });
  if (held.ok) {
    const body = (await held.json()) as { messages?: unknown };
    return messagesOfThread(body.messages);
  }
  if (held.status !== 404) {
    throw new Error(await detailOf(held));
  }
  // Not held here: resumed from its record, under the same uid.
  const resumed = await fetcher(`${base}/resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authorization },
    body: JSON.stringify({ agent: agentId }),
  });
  if (!resumed.ok) {
    throw new Error(await detailOf(resumed));
  }
  const snapshot = snapshotOfStream(await resumed.text());
  if (!snapshot) {
    throw new Error(`The runtime said nothing of session ${uid}.`);
  }
  return messagesOfThread(snapshot);
}
