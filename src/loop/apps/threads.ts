/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A thread opened from a person's history, to go on with it (LOOP P-24).
 *
 * A thread is a session of an application: its uid is the conversation's
 * AG-UI thread. Opened again, its conversation is read from the runtime the
 * chat runs on — the session's messages while the runtime holds it
 * (`GET …/sessions/{uid}/messages`, D-13), else the session resumed from its
 * record (`POST …/sessions/{uid}/resume` with the agent, R-04), whose
 * stream's `MESSAGES_SNAPSHOT` says what it holds — and the chat draws it
 * and goes on with it on the same thread.
 *
 * Pure: the network is the `fetch` it is handed.
 *
 * @module loop/apps/threads
 */

import type { ChatMessage } from '../../types/messages';
import { messagesOfThread } from '../embed/embedSession';

/** What opening a thread says, in a person's words. */
export const THREAD_WORDS = {
  opening: 'Opening your conversation…',
  notOpened: (detail: string): string =>
    `Your conversation could not be opened, so this is a new one: ${detail}`,
} as const;

/** The AG-UI messages a session-API stream's `MESSAGES_SNAPSHOT` carries, if one does. */
export function snapshotOfStream(text: string): unknown[] | undefined {
  let found: unknown[] | undefined;
  for (const block of text.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice('data:'.length).trim())
      .join('');
    if (!data) {
      continue;
    }
    try {
      const event = JSON.parse(data) as { type?: unknown; messages?: unknown };
      if (event.type === 'MESSAGES_SNAPSHOT' && Array.isArray(event.messages)) {
        found = event.messages;
      }
    } catch {
      // Not an event: skipped.
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
