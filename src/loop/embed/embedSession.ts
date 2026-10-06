/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An embedded application's conversation, picked up again after the host's
 * page reloads (LOOP D-13).
 *
 * The session an embed opened is kept by its uid in the host page's own
 * storage, under the application and the visit its embed token names —
 * the host's server issues the reloaded page a token for the same visit.
 * After the reload, the session is asked for its conversation on the
 * agent-runtimes server that holds it, with that token, and the chat draws
 * it again and goes on with it. A session that is gone, or refused, is
 * forgotten and said once; a new one starts.
 *
 * Kept in memory as well, for as long as the page lives: a token renewed
 * for the visit redraws the application, which goes on with its session
 * even when the host keeps nothing (`resume="false"`).
 *
 * Pure but for the storage and the request, each given or guarded: the page
 * works without storage.
 *
 * @module loop/embed/embedSession
 */

import type { ChatMessage } from '../../types/messages';
import { windowTurnOf } from '../../chat/base/loopWindow';

/** Where a visit's session is kept in the host's storage: `<prefix>:<app>:<visit>`. */
export const EMBED_SESSION_KEY_PREFIX = 'datalayer-app:session';

/**
 * The visit an embed token was issued for: its `visit` claim, read without
 * checking the signature — the runtime checks the token; the page only
 * needs the name to keep the session under.
 */
export function visitOfToken(token: string | undefined): string | undefined {
  const payload = token?.split('.')[1];
  if (!payload) {
    return undefined;
  }
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const claims = JSON.parse(atob(padded)) as { visit?: unknown };
    return typeof claims.visit === 'string' && claims.visit
      ? claims.visit
      : undefined;
  } catch {
    return undefined;
  }
}

/** The key a visit's session is kept under. */
export function embedSessionKey(app: string, visit: string): string {
  return `${EMBED_SESSION_KEY_PREFIX}:${app}:${visit}`;
}

/** What keeps a visit's session uid. */
export type SessionKeeper = {
  read: (key: string) => string | undefined;
  keep: (key: string, uid: string) => void;
  forget: (key: string) => void;
};

/** The sessions of this page, while it lives. */
const IN_MEMORY = new Map<string, string>();

/** The host's `localStorage`, when there is one the page may use. */
function hostStorage(): Storage | undefined {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The keeper of a visit's session: in memory, and — unless the host opted
 * out — in its storage too, read first. Every access to the storage is
 * guarded: a page whose storage is blocked, full or absent keeps the
 * session in memory and resumes nothing after a reload.
 */
export function sessionKeeper({
  persist,
  storage = hostStorage,
}: {
  persist: boolean;
  storage?: () => Storage | undefined;
}): SessionKeeper {
  return {
    read: key => {
      if (persist) {
        try {
          const kept = storage()?.getItem(key);
          if (kept) {
            return kept;
          }
        } catch {
          // No storage: what the page holds in memory.
        }
      }
      return IN_MEMORY.get(key);
    },
    keep: (key, uid) => {
      IN_MEMORY.set(key, uid);
      if (persist) {
        try {
          storage()?.setItem(key, uid);
        } catch {
          // Kept in memory only.
        }
      }
    },
    forget: key => {
      IN_MEMORY.delete(key);
      try {
        storage()?.removeItem(key);
      } catch {
        // Nothing kept there to forget.
      }
    },
  };
}

/** Forget what this page holds in memory (a test). */
export function forgetSessionsInMemory(): void {
  IN_MEMORY.clear();
}

/**
 * A session's conversation as the chat draws it, from the AG-UI messages
 * the runtime says (`GET …/sessions/{uid}/messages`): what was said and
 * answered, in words. A page an answer drew is not drawn again here.
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
    const { id, role, content } = message as {
      id?: unknown;
      role?: unknown;
      content?: unknown;
    };
    if (
      (role === 'user' || role === 'assistant') &&
      typeof id === 'string' &&
      typeof content === 'string' &&
      content.trim()
    ) {
      drawn.push({ id, role, content, createdAt: new Date() });
    }
  }
  return drawn;
}

/** What asking for a kept session found. */
export type Reattached =
  | { kind: 'resumed'; uid: string; messages: ChatMessage[] }
  | { kind: 'gone'; uid: string };

/**
 * Ask the server that runs the application for a session's conversation,
 * with the visit's token. Anything but an answer — a session the runtime
 * let go, another visit's, a token refused, a server out of reach — is
 * `gone`: a new session starts.
 */
export async function reattachSession({
  serverUrl,
  uid,
  token,
  fetcher = fetch,
}: {
  serverUrl: string;
  uid: string;
  token: string;
  fetcher?: typeof fetch;
}): Promise<Reattached> {
  try {
    const response = await fetcher(
      `${serverUrl.replace(/\/+$/, '')}/api/v1/apps/sessions/${encodeURIComponent(uid)}/messages`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) {
      return { kind: 'gone', uid };
    }
    const body = (await response.json()) as { messages?: unknown };
    return { kind: 'resumed', uid, messages: messagesOfThread(body.messages) };
  } catch {
    return { kind: 'gone', uid };
  }
}

/** Said when a window message is posted before the conversation has started. */
export const WINDOW_NOT_YET =
  'The application takes a window message once its conversation has started, on its own server (the "server" attribute).';

/**
 * Post a window message to a session (LOOP P-25): its code's `@app.window`
 * runs on it. Returns what the code told the page back; refused — the
 * runtime's sentence — when the session or its code takes none.
 */
export async function postWindowMessage({
  serverUrl,
  uid,
  token,
  data,
  fetcher = fetch,
}: {
  serverUrl: string;
  uid: string;
  token?: string;
  data: unknown;
  fetcher?: typeof fetch;
}): Promise<unknown[]> {
  const response = await fetcher(
    `${serverUrl.replace(/\/+$/, '')}/api/v1/apps/sessions/${encodeURIComponent(uid)}/window`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ data }),
    },
  );
  if (!response.ok) {
    let detail = '';
    try {
      const body = (await response.json()) as { detail?: unknown };
      detail = typeof body.detail === 'string' ? body.detail : '';
    } catch {
      // No sentence: the status says it.
    }
    throw new Error(
      detail || `The window message was refused (${response.status}).`,
    );
  }
  const turn = windowTurnOf(await response.text());
  if (turn.error) {
    throw new Error(turn.error);
  }
  return turn.said;
}

/** What the page says, once, when the conversation it kept is gone. */
export const sessionGoneSentence = (name: string): string =>
  `Your earlier conversation with ${name} has ended, so this is a new one.`;
