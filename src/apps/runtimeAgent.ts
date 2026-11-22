/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The agent that answers on a runtime, and the session it holds: what a host
 * asks a running agent-runtimes server before it draws an `AIApplication` in
 * runtime mode on it, so that nothing is guessed.
 *
 * - **Which agent** (`GET …/api/v1/agents`): the one the host's record names,
 *   else `default`, else the first listed (`runtimeAgentAnswering`).
 * - **What it keeps** (`GET …/api/v1/runtime/status`, then
 *   `…/api/v1/apps/sessions?held=true`): a runtime that says
 *   `agent_sessions` keeps an agent's conversation as a session, and says
 *   the one it holds now, newest first — the one to go on with after a
 *   reload (`readRuntimeSessions`).
 *
 * `useRuntimeAgent` asks both, again while the runtime is still coming up,
 * and says the agent and the session to go on with — or, in one sentence,
 * why there is none.
 *
 * @module apps/runtimeAgent
 */

import { useEffect, useRef, useState } from 'react';
import type { ResumedThread } from '../types/chat';

/**
 * The agent that answers on a runtime: the one the record names when the
 * runtime lists it, else `default`, else the first it lists; none when it
 * lists none.
 */
export function runtimeAgentAnswering(
  ids: string[],
  recordAgentId: string,
): string {
  if (recordAgentId && ids.includes(recordAgentId)) {
    return recordAgentId;
  }
  if (ids.includes('default')) {
    return 'default';
  }
  return ids[0] || '';
}

/** What a runtime says of agent sessions: its version, whether it keeps them, and the one it holds now. */
export type RuntimeSessions = {
  version: string;
  capable: boolean;
  held: string;
};

/**
 * Ask a runtime what it can do (`GET …/api/v1/runtime/status`): one that
 * says `agent_sessions` keeps an agent's conversation as a session; one that
 * does not say it — an older runtime — keeps none. Its version is only said,
 * never compared: a checkout says a stale one. A runtime that keeps sessions
 * also says the agent session it holds now (`…/apps/sessions?held=true`),
 * newest first.
 *
 * Throws when the runtime does not answer: the host says so, and guesses nothing.
 */
export async function readRuntimeSessions({
  baseUrl,
  token,
  fetcher = fetch,
}: {
  baseUrl: string;
  token?: string | null;
  fetcher?: typeof fetch;
}): Promise<RuntimeSessions> {
  const headers: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};
  const base = baseUrl.replace(/\/+$/, '');
  const status = await fetcher(`${base}/api/v1/runtime/status`, { headers });
  if (!status.ok) {
    throw new Error(`The runtime did not say what it runs (${status.status}).`);
  }
  const said = (await status.json()) as {
    version?: unknown;
    agent_sessions?: unknown;
  };
  const version = String(said.version || '');
  if (said.agent_sessions !== true) {
    return { version, capable: false, held: '' };
  }
  const held = await fetcher(`${base}/api/v1/apps/sessions?held=true`, {
    headers,
  });
  if (!held.ok) {
    throw new Error(
      `The runtime did not say which sessions it holds (${held.status}).`,
    );
  }
  const body = (await held.json()) as {
    sessions?: Array<{
      uid?: string;
      kind?: string;
      state?: string;
      started_at?: string;
    }>;
  };
  const own = (body.sessions ?? [])
    .filter(
      session =>
        session.kind === 'agent' && session.uid && session.state !== 'ended',
    )
    .sort((a, b) =>
      String(b.started_at || '').localeCompare(String(a.started_at || '')),
    );
  return { version, capable: true, held: String(own[0]?.uid || '') };
}

/** The agent found on a runtime and the session to go on with, or why there is none. */
export type RuntimeAgentFound =
  { agentId: string; thread?: ResumedThread } | { error: string };

/** What a runtime that keeps no agent session is said to be, unless the host says it. */
export const OLDER_RUNTIME = (version: string): string =>
  `Its runtime (agent-runtimes ${version || 'of an earlier release'}) keeps no session of an agent: its conversation would be neither listed nor paused.`;

export type UseRuntimeAgentOptions = {
  /** The runtime's agent-runtimes address; none while it is still being assigned. */
  url: string;
  /** The person's token, sent as a bearer. */
  token?: string | null;
  /** The agent the host's record names on that runtime, if any. */
  recordAgentId?: string;
  /** Whom it is asked for (the agent's spec): asked again for another. */
  specId?: string;
  /** Bumped to ask again. */
  round?: number;
  /**
   * A session to go on with in place of the one the runtime holds (one the
   * host kept for *Resume*): read once the runtime has answered.
   */
  resumed?: () => string;
  /** What a runtime that keeps no agent session is said to be. */
  olderRuntime?: (version: string) => string;
  /** How often a runtime still coming up is asked again, and how many times before it is said. */
  askEveryMs?: number;
  askAtMost?: number;
  fetcher?: typeof fetch;
};

/**
 * Which agent answers on the runtime, and the session to go on with; asked
 * again while the runtime comes up. Undefined while it is asked.
 */
export function useRuntimeAgent({
  url,
  token,
  recordAgentId = '',
  specId = '',
  round = 0,
  resumed,
  olderRuntime = OLDER_RUNTIME,
  askEveryMs = 3000,
  askAtMost = 20,
  fetcher,
}: UseRuntimeAgentOptions): RuntimeAgentFound | undefined {
  const [found, setFound] = useState<RuntimeAgentFound>();
  // Read when the runtime has answered, never a reason to ask again.
  const said = useRef({ resumed, olderRuntime, fetcher });
  said.current = { resumed, olderRuntime, fetcher };
  useEffect(() => {
    setFound(undefined);
    if (!url) {
      return undefined;
    }
    let current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fetchFn = said.current.fetcher ?? fetch;
    const headers: Record<string, string> = token
      ? { Authorization: `Bearer ${token}` }
      : {};
    const ask = async (attempt: number): Promise<void> => {
      try {
        const listed = await fetchFn(`${url}/api/v1/agents`, { headers });
        if (!listed.ok) {
          throw new Error(
            `The runtime did not list its agents (${listed.status}).`,
          );
        }
        const body = (await listed.json().catch(() => ({}))) as {
          agents?: Array<Record<string, unknown>>;
        };
        const ids = (body.agents ?? [])
          .map(entry =>
            String(entry.id || entry.agent_id || entry.name || '').trim(),
          )
          .filter(Boolean);
        const agentId = runtimeAgentAnswering(ids, recordAgentId);
        if (!agentId) {
          throw new Error('No agent answers on the runtime yet.');
        }
        const sessions = await readRuntimeSessions({
          baseUrl: url,
          token,
          fetcher: fetchFn,
        });
        if (!current) {
          return;
        }
        if (!sessions.capable) {
          setFound({ error: said.current.olderRuntime(sessions.version) });
          return;
        }
        const uid = said.current.resumed?.() || sessions.held;
        setFound({
          agentId,
          ...(uid
            ? { thread: { id: uid, messages: [], fromRuntime: true } }
            : {}),
        });
      } catch (error) {
        if (!current) {
          return;
        }
        // A runtime still coming up does not answer yet: asked again, and said when it keeps not answering.
        if (attempt >= askAtMost) {
          setFound({
            error: error instanceof Error ? error.message : String(error),
          });
          return;
        }
        timer = setTimeout(() => void ask(attempt + 1), askEveryMs);
      }
    };
    void ask(1);
    return () => {
      current = false;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [url, specId, recordAgentId, token, round, askEveryMs, askAtMost]);
  return found;
}
