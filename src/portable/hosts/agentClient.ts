/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A chat host's turns on Datalayer: the host credential exchange, a turn
 * started or sent on the deployment's session API (idempotent by the host's
 * event id), its AG-UI stream reduced to semantic events, and its session
 * mapped to the host's thread so approvals and completions are delivered
 * (SLACK §4.3, DISCORD §4.3). What is the host's own (its thread key, the
 * session uid, the place, the delivery target, its words) is injected as a
 * `HostShape`. Moved from the Slack service (plans/DISCORD.md DC-004).
 *
 * @module portable/hosts/agentClient
 */

import { z } from 'zod';

import { AgUiFrames, type AgUiEvent } from '../agui';
import type { SemanticEvent } from '../semantic';
import { semanticOf, turnOf } from '../semanticOfAgUi';
import { HostRefusedError } from './client';
import {
  exchangeSchema,
  HOST_KEY_HEADER,
  IDEMPOTENCY_HEADER,
  type HostExchange,
} from './contracts';

/**
 * A turn a host asks for. `provenance` is the host's own thread key (Slack's
 * `ThreadKey`, Discord's): opaque here, read only through the `HostShape`.
 */
export type HostTurnRequest<P> = Readonly<{
  /** The deployment the turn runs: one the installation allows. */
  applicationId: string;
  externalEventId: string;
  /** The host user the host speaks for: what the credential exchange names. */
  externalUserId: string;
  principalId: string;
  prompt: string;
  provenance: P;
  sessionId?: string;
  /**
   * How many sessions the thread had before (an explicit start over or
   * another application): a new session's uid is derived with it.
   */
  sessionGeneration?: number;
}>;

export type TurnStream = Readonly<{
  /**
   * The run the stream is of, as its `loop.turn` event names it: known once
   * the stream has said it (what a Stop button names).
   */
  run: { id?: string };
  sessionId: string;
  updates: AsyncIterable<SemanticEvent>;
}>;

export interface AgentClient<P> {
  startTurn(request: HostTurnRequest<P>): Promise<TurnStream>;
  stopTurn(sessionId: string, request: HostTurnRequest<P>): Promise<void>;
}

/**
 * Maps a session to its host place again, once the place changed after the
 * turn started (plans/DISCORD.md §3.2: Discord's answer thread exists only
 * once the answer is shown, so the target is PUT again with it).
 */
export interface SessionBinder<P> {
  /** Whether the session was mapped: `false` where nothing binds (development's credentials). */
  bindSession(sessionId: string, request: HostTurnRequest<P>): Promise<boolean>;
}

/** Where a host asks from (`exchange.optional_request.place`): a channel, or a direct conversation. */
export type Place = Readonly<{ kind: 'channel' | 'direct'; id: string }>;

/**
 * Where a turn comes from, as the session API takes it on the turn itself
 * (`provenance`, plans/DISCORD.md §4.3, §4.4; at most 1 KiB): the host's
 * kind, the place, the thread and the message.
 */
export type TurnProvenance = Readonly<{
  host_kind: string;
  place: Place;
  thread: string;
  message_id: string;
}>;

/**
 * What is the host's own in a turn: the session uid its thread derives
 * (`hostSessionUid`), the place Datalayer checks the channel policy against,
 * the delivery target handed back with every delivery, the provenance sent
 * with the turn, and what is said when its installation holds no host key.
 */
export type HostShape<P> = Readonly<{
  sessionUidOf(request: HostTurnRequest<P>): string;
  placeOf(request: HostTurnRequest<P>): Place;
  targetOf(request: HostTurnRequest<P>): Record<string, unknown>;
  /** The turn's provenance; a host that sends none leaves it out. */
  provenanceOf?(request: HostTurnRequest<P>): TurnProvenance;
  notBound: string;
}>;

/**
 * What a turn runs with: a short-lived credential for the linked person and
 * where the deployment's session API is. A bot token is never one.
 */
export type HostSession = Readonly<{
  accessToken: string;
  agent: string;
  deploymentUid: string;
  /** Whether the session can be mapped to its host thread for deliveries. */
  bindable: boolean;
  sessionApiUrl: string;
  userToken?: string;
}>;

export interface HostCredentials<P> {
  forTurn(request: HostTurnRequest<P>): Promise<HostSession>;
}

/** What the installation's key is, for a turn: `undefined` when it was never bound. */
export type HostKeyLookup<P> = (
  request: HostTurnRequest<P>,
) => Promise<string | undefined>;

/**
 * The host credential exchange (SLACK §4.3, 1): the installation's key and
 * the host user it speaks for, exchanged at ai-agents for a fifteen-minute
 * host token of the linked person and one deployment.
 */
export class HostKeyCredentials<P> implements HostCredentials<P> {
  constructor(
    readonly apiUrl: string,
    readonly hostKeyFor: HostKeyLookup<P>,
    readonly shape: HostShape<P>,
    readonly fetchImplementation: typeof fetch = fetch,
  ) {}

  async exchange(request: HostTurnRequest<P>): Promise<HostExchange> {
    const hostKey = await this.hostKeyFor(request);
    if (!hostKey) {
      throw new Error(this.shape.notBound);
    }
    return this.exchangeFor({
      deploymentUid: request.applicationId,
      externalUserId: request.externalUserId,
      hostKey,
      place: this.shape.placeOf(request),
    });
  }

  /** The exchange for one host user and deployment, with a key in hand (a delivery, an action). */
  async exchangeFor(input: {
    deploymentUid: string;
    externalUserId: string;
    hostKey: string;
    /** Where the turn is asked from: Datalayer refuses a denied channel at once. */
    place?: Place;
  }): Promise<HostExchange> {
    const response = await this.fetchImplementation(
      `${this.apiUrl}/api/ai-agents/v1/apps/hosts/self/token`,
      {
        body: JSON.stringify({
          deployment_uid: input.deploymentUid,
          external_user_id: input.externalUserId,
          ...(input.place ? { place: input.place } : {}),
        }),
        headers: {
          'content-type': 'application/json',
          [HOST_KEY_HEADER]: input.hostKey,
        },
        method: 'POST',
      },
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        detail?: unknown;
      };
      throw new HostRefusedError(
        response.status,
        typeof body.detail === 'string' ? body.detail : 'refused',
        'Datalayer refused the host credential exchange',
      );
    }
    return exchangeSchema.parse(await response.json());
  }

  async forTurn(request: HostTurnRequest<P>): Promise<HostSession> {
    return hostSessionOf(await this.exchange(request));
  }
}

export function hostSessionOf(exchanged: HostExchange): HostSession {
  return {
    accessToken: exchanged.access_token,
    agent: exchanged.session_api.agent,
    bindable: true,
    deploymentUid: exchanged.deployment.uid,
    sessionApiUrl: exchanged.session_api.url,
    userToken: exchanged.user_token,
  };
}

/**
 * A turn's credentials: the exchange when its installation holds a host
 * key; otherwise, in development only, the developer's own (`fallback`);
 * otherwise a refusal saying the installation is not connected.
 */
export class InstallationCredentials<P> implements HostCredentials<P> {
  constructor(
    readonly keyed: HostKeyCredentials<P>,
    readonly fallback?: HostCredentials<P>,
  ) {}

  async forTurn(request: HostTurnRequest<P>): Promise<HostSession> {
    if (await this.keyed.hostKeyFor(request)) {
      return this.keyed.forTurn(request);
    }
    if (this.fallback) {
      return this.fallback.forTurn(request);
    }
    throw new Error(this.keyed.shape.notBound);
  }
}

/**
 * Development only: the developer's own Datalayer key, and their own kept
 * deployment, read from ai-agents as its owner. Never in production.
 */
export class DevelopmentCredentials<P> implements HostCredentials<P> {
  constructor(
    readonly apiUrl: string,
    readonly token: string,
    readonly fetchImplementation: typeof fetch = fetch,
  ) {}

  async forTurn(request: HostTurnRequest<P>): Promise<HostSession> {
    const response = await this.fetchImplementation(
      `${this.apiUrl}/api/ai-agents/v1/apps/deployments/${encodeURIComponent(request.applicationId)}`,
      { headers: { authorization: `Bearer ${this.token}` } },
    );
    if (!response.ok) {
      throw new Error(
        `Datalayer did not answer the deployment (${response.status}).`,
      );
    }
    const body = (await response.json()) as {
      deployment?: { kept?: { agent_id?: string; url?: string } };
    };
    const kept = body.deployment?.kept;
    if (!kept?.url || !kept.agent_id) {
      throw new Error(
        'The deployment is not kept always on: turn it on under Ship.',
      );
    }
    return {
      accessToken: this.token,
      agent: kept.agent_id,
      bindable: false,
      deploymentUid: request.applicationId,
      sessionApiUrl: `${kept.url.replace(/\/+$/, '')}/api/v1/apps/sessions`,
    };
  }
}

/** One of an application's starters (SLACK S-104): the words shown, and the message it suggests asking. */
export type Starter = Readonly<{ label: string; message: string }>;

/** Where an application's starters are read, as one linked person of one installation. */
export interface StarterSource<K> {
  startersOf(
    key: K,
    externalUserId: string,
    applicationId: string,
  ): Promise<readonly Starter[]>;
}

/** What `GET /api/v1/apps/current` answers that a host reads: the application's starters. */
const currentAppSchema = z.object({
  starters: z.array(z.object({ label: z.string(), message: z.string() })),
});

/**
 * An application's starters (SLACK S-104), read from its runtime as the
 * linked person: the host credential exchange (no place: what is suggested
 * is private to them), then `GET /api/v1/apps/current` beside the session
 * API it answers. A runtime that does not answer starters is refused.
 */
export class HostStarters<K, P> implements StarterSource<K> {
  constructor(
    readonly apiUrl: string,
    readonly keyed: HostKeyCredentials<P>,
    readonly hostKeyOf: (key: K) => Promise<string | undefined>,
    readonly fetchImplementation: typeof fetch = fetch,
  ) {}

  async startersOf(
    key: K,
    externalUserId: string,
    applicationId: string,
  ): Promise<readonly Starter[]> {
    const hostKey = await this.hostKeyOf(key);
    if (!hostKey) {
      throw new Error(this.keyed.shape.notBound);
    }
    const exchanged = await this.keyed.exchangeFor({
      deploymentUid: applicationId,
      externalUserId,
      hostKey,
    });
    const sessions = exchanged.session_api.url.replace(/\/+$/, '');
    assertTrustedStreamUrl(this.apiUrl, sessions);
    if (!sessions.endsWith('/api/v1/apps/sessions')) {
      throw new Error(
        "Datalayer answered a session API that is not an application runtime's.",
      );
    }
    const response = await this.fetchImplementation(
      `${sessions.slice(0, -'/sessions'.length)}/current`,
      { headers: { authorization: `Bearer ${exchanged.access_token}` } },
    );
    if (!response.ok) {
      throw new HostRefusedError(
        response.status,
        'refused',
        'The application did not say what it suggests asking',
      );
    }
    return currentAppSchema.parse(await response.json()).starters;
  }
}

/** Each AG-UI event of a run's `text/event-stream` body, as it arrives (`AgUiFrames`). */
export async function* agUiEventsOf(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<AgUiEvent> {
  const decoder = new TextDecoder();
  const frames = new AgUiFrames();
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      yield* frames.push(decoder.decode(value, { stream: true }));
    }
    yield* frames.push(decoder.decode());
    yield* frames.end();
  } finally {
    reader.releaseLock();
  }
}

/**
 * The host's Datalayer client: a turn is started or sent on the deployment's
 * session API (idempotent by the host's event id, SLACK §4.3, 2), its AG-UI
 * stream reduced to semantic events, and its session mapped to the host's
 * thread so that approvals and completions are delivered (§4.3, 3).
 */
export class HttpAgentClient<P> implements AgentClient<P>, SessionBinder<P> {
  constructor(
    readonly apiUrl: string,
    readonly credentials: HostCredentials<P>,
    readonly shape: HostShape<P>,
    readonly fetchImplementation: typeof fetch = fetch,
    readonly hostKeyFor?: HostKeyLookup<P>,
  ) {}

  async startTurn(request: HostTurnRequest<P>): Promise<TurnStream> {
    const host = await this.credentials.forTurn(request);
    assertTrustedStreamUrl(this.apiUrl, host.sessionApiUrl);
    const sessionId = request.sessionId ?? this.shape.sessionUidOf(request);
    const provenance = this.shape.provenanceOf?.(request);
    const headers = {
      accept: 'text/event-stream',
      authorization: `Bearer ${host.accessToken}`,
      'content-type': 'application/json',
      [IDEMPOTENCY_HEADER]: request.externalEventId,
    };
    const response = request.sessionId
      ? await this.fetchImplementation(
          `${host.sessionApiUrl}/${encodeURIComponent(sessionId)}/messages`,
          {
            body: JSON.stringify({
              external_event_id: request.externalEventId,
              text: request.prompt,
              ...(provenance ? { provenance } : {}),
            }),
            headers,
            method: 'POST',
          },
        )
      : await this.fetchImplementation(host.sessionApiUrl, {
          body: JSON.stringify({
            agent: host.agent,
            deployment_uid: host.deploymentUid,
            external_event_id: request.externalEventId,
            opener: request.prompt,
            session: sessionId,
            ...(host.userToken ? { user_token: host.userToken } : {}),
            ...(provenance ? { provenance } : {}),
          }),
          headers,
          method: 'POST',
        });
    if (!response.ok || !response.body) {
      throw new Error(`Datalayer refused the turn (${response.status}).`);
    }
    const hostKey =
      host.bindable && this.hostKeyFor
        ? await this.hostKeyFor(request)
        : undefined;
    if (hostKey) {
      await this.#bind(request, host, sessionId, hostKey);
    }
    const run: { id?: string } = {};
    return {
      run,
      sessionId,
      updates: this.#updates(response.body, host, sessionId, run),
    };
  }

  /**
   * The session mapped again with the shape's target for `request`, as the
   * speaker (a fresh exchange): the binding is replaced, never doubled.
   */
  async bindSession(
    sessionId: string,
    request: HostTurnRequest<P>,
  ): Promise<boolean> {
    const host = await this.credentials.forTurn(request);
    const hostKey =
      host.bindable && this.hostKeyFor
        ? await this.hostKeyFor(request)
        : undefined;
    if (!hostKey) return false;
    await this.#bind(request, host, sessionId, hostKey);
    return true;
  }

  async stopTurn(
    sessionId: string,
    request: HostTurnRequest<P>,
  ): Promise<void> {
    const host = await this.credentials.forTurn(request);
    assertTrustedStreamUrl(this.apiUrl, host.sessionApiUrl);
    const response = await this.fetchImplementation(
      `${host.sessionApiUrl}/${encodeURIComponent(sessionId)}/stop`,
      {
        headers: { authorization: `Bearer ${host.accessToken}` },
        method: 'POST',
      },
    );
    if (!response.ok && response.status !== 409) {
      throw new Error(
        `Datalayer could not stop the turn (${response.status}).`,
      );
    }
  }

  async #bind(
    request: HostTurnRequest<P>,
    host: HostSession,
    sessionId: string,
    hostKey: string,
  ): Promise<void> {
    const response = await this.fetchImplementation(
      `${this.apiUrl}/api/ai-agents/v1/apps/hosts/sessions/${encodeURIComponent(sessionId)}`,
      {
        // Handed back with every delivery: the thread, and the host user the
        // host token speaks for, whom an approval waits on.
        body: JSON.stringify({ target: this.shape.targetOf(request) }),
        headers: {
          authorization: `Bearer ${host.accessToken}`,
          'content-type': 'application/json',
          [HOST_KEY_HEADER]: hostKey,
        },
        method: 'PUT',
      },
    );
    if (!response.ok) {
      throw new Error(
        `Datalayer did not map the thread to its session (${response.status}).`,
      );
    }
  }

  async *#updates(
    body: ReadableStream<Uint8Array>,
    host: HostSession,
    sessionId: string,
    run: { id?: string },
  ): AsyncIterable<SemanticEvent> {
    const tools = new Map<string, string>();
    for await (const event of agUiEventsOf(body)) {
      const turn = turnOf(event);
      if (turn?.turn) {
        run.id = turn.turn;
      }
      if (turn?.replayed) {
        // A retry: nothing ran again; what the turn said is the session's.
        yield* this.#replayed(host, sessionId, turn.state);
        return;
      }
      yield* semanticOf(event, tools);
    }
  }

  async *#replayed(
    host: HostSession,
    sessionId: string,
    state: string,
  ): AsyncIterable<SemanticEvent> {
    if (state === 'running') {
      yield { kind: 'progress', label: 'Still working on this message…' };
      return;
    }
    const text = await lastAnswer(this.fetchImplementation, host, sessionId);
    if (text === null) {
      yield {
        kind: 'error',
        message: 'This message was already answered in Datalayer.',
      };
      return;
    }
    yield { kind: 'completion', text };
  }
}

/**
 * The session's last answer, read with the host token (what a replayed turn
 * and a `turn.completed` delivery show); `null` when the session is not read.
 */
export async function lastAnswer(
  fetchImplementation: typeof fetch,
  host: HostSession,
  sessionId: string,
): Promise<string | undefined | null> {
  const response = await fetchImplementation(
    `${host.sessionApiUrl}/${encodeURIComponent(sessionId)}/messages`,
    { headers: { authorization: `Bearer ${host.accessToken}` } },
  );
  if (!response.ok) {
    return null;
  }
  const { messages } = (await response.json()) as {
    messages?: Array<{ content?: unknown; role?: string }>;
  };
  const last = [...(messages ?? [])]
    .reverse()
    .find(message => message.role === 'assistant');
  return typeof last?.content === 'string' ? last.content : undefined;
}

/** A session API or stream URL Datalayer answered: HTTPS, on Datalayer's own origin. */
export function assertTrustedStreamUrl(
  baseUrl: string,
  streamUrl: string,
): void {
  const base = new URL(baseUrl);
  const stream = new URL(streamUrl);
  if (stream.protocol !== 'https:' || stream.origin !== base.origin) {
    throw new Error('Datalayer returned an untrusted stream URL.');
  }
}
