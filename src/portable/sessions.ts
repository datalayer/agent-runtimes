/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The clients a native app talks to a runtime with: an application's
 * sessions (`/api/v1/apps/sessions`, the Session API) and a standalone agent's
 * AG-UI mount (`/api/v1/ag-ui/{agent}/`). Each streaming route's events are
 * handed to `onEvent` as they arrive (`readRunStream`); a refusal is thrown
 * as a `RuntimeRefusal` with its status and the runtime's own sentence.
 *
 * Nothing is read from a page: the runtime's address, the token and a
 * `fetch` that streams are given (`{ baseUrl, getAccessToken, fetch }`).
 *
 * @module portable/sessions
 */

import type { ChatMessage } from '../types/messages';
import { readRunStream, type AgUiEvent } from './agui';
import { agUiRefusal, refusalBody } from './agUiRefusal';
import { messagesOfThread } from './thread';

/** Where a runtime is, and as whom it is asked. */
export type RuntimeClientOptions = {
  /** The runtime's agent-runtimes address (`…/agent-runtimes/<runtime>`). */
  baseUrl: string;
  getAccessToken: () => string | undefined;
  /** A `fetch` whose response body streams. */
  fetch: typeof fetch;
};

/** A streaming request's listener and its cancellation. */
export type StreamOptions = {
  onEvent: (event: AgUiEvent) => void;
  signal?: AbortSignal;
};

/** A route that refused: its status and the runtime's sentence. */
export class RuntimeRefusal extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'RuntimeRefusal';
  }
}

/** What starting a session names: the application's agent and what it runs. */
export type SessionStart = {
  /** The agent the runtime made for the application. */
  agent: string;
  deploymentUid?: string;
  appUid?: string;
  version?: number;
  /** The first message. */
  opener: string;
  /** The session's uid, when the client chose it. */
  session?: string;
};

function clientOf({
  baseUrl,
  getAccessToken,
  fetch: fetcher,
}: RuntimeClientOptions) {
  const root = baseUrl.replace(/\/+$/, '');
  const headers = (
    extra: Record<string, string> = {},
  ): Record<string, string> => {
    const token = getAccessToken();
    return {
      ...extra,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };
  const refused = async (response: Response): Promise<never> => {
    throw new RuntimeRefusal(
      response.status,
      agUiRefusal(
        response.status,
        response.statusText,
        await refusalBody(response),
      ),
    );
  };
  const json = async (
    path: string,
    method = 'GET',
    body?: unknown,
  ): Promise<Record<string, unknown>> => {
    const response = await fetcher(`${root}${path}`, {
      method,
      headers: headers({
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      }),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      return refused(response);
    }
    return (await response.json()) as Record<string, unknown>;
  };
  const stream = async (
    path: string,
    body: unknown,
    { onEvent, signal }: StreamOptions,
    method: 'POST' | 'PUT' = 'POST',
  ): Promise<void> => {
    const response = await fetcher(`${root}${path}`, {
      method,
      headers: headers({
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      }),
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      return refused(response);
    }
    await readRunStream(response, onEvent);
  };
  return { json, stream, refused, headers, root, fetcher };
}

const at = (uid: string): string =>
  `/api/v1/apps/sessions/${encodeURIComponent(uid)}`;

/**
 * An application's sessions on the runtime that runs it: start, message,
 * settings, resume (streamed), and stop, end, read (JSON).
 */
export function appSessionsClient(options: RuntimeClientOptions) {
  const { json, stream, fetcher, headers, refused, root } = clientOf(options);
  return {
    /** Start a session with its first message. */
    start: (start: SessionStart, streaming: StreamOptions) =>
      stream(
        '/api/v1/apps/sessions',
        {
          agent: start.agent,
          ...(start.deploymentUid
            ? { deployment_uid: start.deploymentUid }
            : {}),
          ...(start.appUid ? { app_uid: start.appUid } : {}),
          ...(start.version ? { version: start.version } : {}),
          ...(start.session ? { session: start.session } : {}),
          opener: start.opener,
        },
        streaming,
      ),
    /** The next turn, or the answer to what the application asked (text, a choice). */
    message: (uid: string, text: string, streaming: StreamOptions) =>
      stream(`${at(uid)}/messages`, { text }, streaming),
    /** A settings change: also what answers a form the application asked. */
    changeSettings: (
      uid: string,
      values: Record<string, unknown>,
      streaming: StreamOptions,
    ) => stream(`${at(uid)}/settings`, { values }, streaming, 'PUT'),
    /** Resume a stopped session — or, with its agent, one the runtime no longer holds, from its record. */
    resume: (uid: string, agent: string, streaming: StreamOptions) =>
      stream(`${at(uid)}/resume`, { agent }, streaming),
    /** Stop: what runs is cancelled; the session waits to be resumed. */
    stop: (uid: string) => json(`${at(uid)}/stop`, 'POST'),
    /** End the conversation for good; its record stays. */
    end: (uid: string) => json(`${at(uid)}/end`, 'POST'),
    /** What the session is: its state (`open`, `paused`, `ended`), its turn phase, what it asks. */
    describe: (uid: string) => json(at(uid)),
    /** The caller's sessions, held and recorded, paged and filtered (`?app=`, `?agent=`, `?state=`, `?q=`, `?archived=true` includes the archived, `?after=`, `?limit=`). */
    list: (params: Record<string, string | number | boolean> = {}) => {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== '' && value !== undefined && value !== false) {
          query.set(key, String(value));
        }
      }
      const search = query.toString();
      return json(`/api/v1/apps/sessions${search ? `?${search}` : ''}`);
    },
    /** Swap the session's agent in place: the new agent is told in a sentence, said back. */
    swap: (uid: string, agent: string) =>
      json(`${at(uid)}/agent`, 'POST', { agent }),
    /** Clone from a turn: a new session, paused, the same or another agent. */
    clone: (
      uid: string,
      options: { upToTurn?: number; agent?: string; title?: string } = {},
    ) =>
      json(`${at(uid)}/clone`, 'POST', {
        up_to_turn: options.upToTurn ?? null,
        agent: options.agent ?? null,
        title: options.title ?? '',
      }),
    /** The session as a `datalayer-session/1` file (JSONL text). */
    exportFile: async (uid: string, format = ''): Promise<string> => {
      const response = await fetcher(
        `${root}${at(uid)}/export${format ? `?format=${encodeURIComponent(format)}` : ''}`,
        { method: 'GET', headers: headers() },
      );
      if (!response.ok) {
        return refused(response);
      }
      return response.text();
    },
    /** Import a session file: a new session, paused, the importer its author. */
    importFile: async (
      text: string,
      options: { agent?: string; format?: string } = {},
    ): Promise<Record<string, unknown>> => {
      const query = new URLSearchParams();
      if (options.agent) {
        query.set('agent', options.agent);
      }
      if (options.format) {
        query.set('format', options.format);
      }
      const search = query.toString();
      const response = await fetcher(
        `${root}/api/v1/apps/sessions/import${search ? `?${search}` : ''}`,
        {
          method: 'POST',
          headers: headers({ 'Content-Type': 'application/x-ndjson' }),
          body: text,
        },
      );
      if (!response.ok) {
        return refused(response);
      }
      return (await response.json()) as Record<string, unknown>;
    },
    /** Rename the session (at most 200 characters). */
    rename: (uid: string, title: string) =>
      json(`${at(uid)}/title`, 'PUT', { title }),
    /** Archive it (hidden from the list unless asked for), or bring it back. */
    archive: (uid: string, archived: boolean) =>
      json(`${at(uid)}/archived`, 'PUT', { archived }),
    /** Its conversation as a person reads it (`messagesOfThread`). */
    messages: async (uid: string): Promise<ChatMessage[]> =>
      messagesOfThread((await json(`${at(uid)}/messages`)).messages),
  };
}

export type AppSessionsClient = ReturnType<typeof appSessionsClient>;

/** One turn of a conversation, as an agent's AG-UI run is sent it. */
export type AgentTurn = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

/**
 * A standalone agent over its AG-UI mount: a run carries the conversation so
 * far, and stopping it terminates the thread's run on the runtime. A raw
 * agent has no session, record or question of an application's.
 */
export function agentRunClient(
  options: RuntimeClientOptions & { agent: string },
) {
  const { stream, refused, root, headers, fetcher } = clientOf(options);
  return {
    run: (
      threadId: string,
      runId: string,
      messages: AgentTurn[],
      streaming: StreamOptions,
    ) =>
      stream(
        `/api/v1/ag-ui/${encodeURIComponent(options.agent)}/`,
        {
          threadId,
          runId,
          messages,
          state: null,
          tools: [],
          context: [],
          forwardedProps: null,
        },
        streaming,
      ),
    /** Stop the thread's run on the runtime (`POST /api/v1/ag-ui/terminate`). */
    terminate: async (threadId: string): Promise<void> => {
      const response = await fetcher(`${root}/api/v1/ag-ui/terminate`, {
        method: 'POST',
        headers: headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ thread_id: threadId }),
      });
      if (!response.ok) {
        await refused(response);
      }
    },
  };
}

export type AgentRunClient = ReturnType<typeof agentRunClient>;

/**
 * A runtime's agent-runtimes address from its ingress, as the runtimes
 * service gives it (`…/jupyter/server/<runtime>` → `…/agent-runtimes/<runtime>`,
 * `build_agent_runtimes_base_url`). Refused when there is none.
 */
export function agentRuntimesUrlOf(ingress: string): string {
  const base = ingress.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(base)) {
    throw new Error(
      `The runtime gave no address to reach its agents: ${ingress || 'none'}.`,
    );
  }
  return base.includes('/jupyter/server/')
    ? base.replace('/jupyter/server/', '/agent-runtimes/')
    : base;
}
