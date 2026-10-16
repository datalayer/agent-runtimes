/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 *
 * @vitest-environment node
 */

/**
 * The host's agent client over the session API (DC-004):
 * the exchange, a turn run once by its event id, the session mapped to the
 * thread through the injected `HostShape`, the stream reduced. Ported from
 * the Slack service, over a Discord-like shape.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SemanticEvent } from '../../semantic';
import {
  agUiEventsOf,
  assertTrustedStreamUrl,
  DevelopmentCredentials,
  HostKeyCredentials,
  HostStarters,
  HttpAgentClient,
  InstallationCredentials,
  type HostShape,
  type HostTurnRequest,
} from '../agentClient';
import { HostRefusedError } from '../client';
import { hostSessionUid } from '../sessionUid';

const contracts = JSON.parse(
  readFileSync(join(__dirname, '..', 'contracts.json'), 'utf8'),
) as {
  exchange: {
    optional_request: Record<string, unknown>;
    request: Record<string, string>;
  };
  external_turn: { start_request: Record<string, string> };
  headers: Record<string, string>;
};

const API = 'https://r1.datalayer.run';

type Thread = { app: string; guild: string; channel: string; thread: string };

const NOT_BOUND = 'This server is not connected to Datalayer.';
const shape: HostShape<Thread> = {
  notBound: NOT_BOUND,
  placeOf: request => ({ id: request.provenance.channel, kind: 'channel' }),
  sessionUidOf: request =>
    hostSessionUid(
      'discord',
      [
        request.provenance.app,
        request.provenance.guild,
        request.provenance.channel,
        request.provenance.thread,
      ],
      request.sessionGeneration,
    ),
  targetOf: request => ({
    channelId: request.provenance.channel,
    userId: request.externalUserId,
  }),
};

const request: HostTurnRequest<Thread> = {
  applicationId: 'dep-1',
  externalEventId: 'ix-1',
  externalUserId: '80351110224678912',
  principalId: 'alice',
  prompt: 'Summarize the launch risks',
  provenance: { app: 'A', guild: 'G', channel: 'C', thread: 'T' },
};

const exchanged = {
  success: true,
  access_token: 'host-token',
  token_type: 'Bearer',
  expires_in: 900,
  exp: 4102444800,
  principal_uid: 'alice',
  host_uid: 'inst-1',
  deployment: { uid: 'dep-1', app_uid: 'app-1', app_name: 'Desk', version: 5 },
  session_api: { url: `${API}/rt-1/api/v1/apps/sessions`, agent: 'agent-desk' },
};

function sse(...events: unknown[]): Response {
  return new Response(
    events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''),
    { headers: { 'content-type': 'text/event-stream' } },
  );
}

async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const seen: T[] = [];
  for await (const item of items) seen.push(item);
  return seen;
}

type Call = {
  body?: unknown;
  headers: Record<string, string>;
  method: string;
  url: string;
};

function wire(answers: Record<string, () => Response>) {
  const calls: Call[] = [];
  const fetchImplementation = (async (
    input: string | URL,
    init?: RequestInit,
  ) => {
    const url = String(input);
    calls.push({
      body: init?.body
        ? (JSON.parse(init.body as string) as unknown)
        : undefined,
      headers: (init?.headers ?? {}) as Record<string, string>,
      method: init?.method ?? 'GET',
      url,
    });
    const key = `${init?.method ?? 'GET'} ${url}`;
    const answer = answers[key];
    if (!answer) throw new Error(`unexpected ${key}`);
    return answer();
  }) as typeof fetch;
  return { calls, fetchImplementation };
}

describe('the host agent client', () => {
  it('accepts an HTTPS stream on the configured origin only', () => {
    expect(() =>
      assertTrustedStreamUrl(API, `${API}/api/v1/stream/one`),
    ).not.toThrow();
    expect(() =>
      assertTrustedStreamUrl(API, 'https://attacker.example/collect'),
    ).toThrow(/untrusted stream URL/);
    expect(() =>
      assertTrustedStreamUrl(API, 'http://r1.datalayer.run/x'),
    ).toThrow(/untrusted stream URL/);
  });

  it("exchanges the host key with the shape's place, runs the turn once and maps the thread with the shape's target", async () => {
    const session = shape.sessionUidOf(request);
    const { calls, fetchImplementation } = wire({
      [`POST ${API}/api/ai-agents/v1/apps/hosts/self/token`]: () =>
        Response.json(exchanged),
      [`POST ${exchanged.session_api.url}`]: () =>
        sse(
          { type: 'CUSTOM', name: 'loop.session', value: { uid: session } },
          {
            type: 'CUSTOM',
            name: 'loop.turn',
            value: { session, turn: 't1', replayed: false, state: 'running' },
          },
          { type: 'TOOL_CALL_START', toolCallId: 'c1', toolCallName: 'search' },
          {
            type: 'TOOL_CALL_RESULT',
            toolCallId: 'c1',
            content: JSON.stringify({ success: true }),
          },
          { type: 'TEXT_MESSAGE_CONTENT', delta: 'Option B ' },
          { type: 'TEXT_MESSAGE_CONTENT', delta: 'is safer.' },
          { type: 'RUN_FINISHED' },
        ),
      [`PUT ${API}/api/ai-agents/v1/apps/hosts/sessions/${session}`]: () =>
        Response.json({ success: true }),
    });
    const hostKey = async () => 'dlhk_key';
    const client = new HttpAgentClient(
      API,
      new HostKeyCredentials(API, hostKey, shape, fetchImplementation),
      shape,
      fetchImplementation,
      hostKey,
    );

    const turn = await client.startTurn(request);
    const seen = await collect<SemanticEvent>(turn.updates);

    expect(turn.sessionId).toBe(session);
    expect(session).toMatch(/^discord-[0-9a-f]{40}$/);
    const [exchange, start, bind] = calls;
    expect(exchange?.headers[contracts.headers.host_key!]).toBe('dlhk_key');
    expect(exchange?.body).toEqual({
      deployment_uid: 'dep-1',
      external_user_id: '80351110224678912',
      place: { id: 'C', kind: 'channel' },
    });
    expect(
      Object.keys({
        ...contracts.exchange.request,
        ...contracts.exchange.optional_request,
      }).sort(),
    ).toEqual(Object.keys(exchange?.body as object).sort());
    expect(start?.headers.authorization).toBe('Bearer host-token');
    expect(start?.headers[contracts.headers.idempotency_key!]).toBe('ix-1');
    expect(Object.keys(start?.body as object).sort()).toEqual(
      Object.keys(contracts.external_turn.start_request)
        .filter(key => key !== 'user_token')
        .sort(),
    );
    expect(bind?.method).toBe('PUT');
    expect(bind?.body).toEqual({
      target: { channelId: 'C', userId: '80351110224678912' },
    });
    expect(seen).toEqual([
      { kind: 'tool', id: 'c1', name: 'search', status: 'running' },
      { kind: 'tool', id: 'c1', name: 'search', status: 'complete' },
      { kind: 'text', text: 'Option B ' },
      { kind: 'text', text: 'is safer.' },
      { kind: 'completion' },
    ]);
    expect(turn.run.id).toBe('t1');
  });

  it("sends the shape's provenance on the turn itself, as the contract's optional request", async () => {
    const provenance = (
      contracts.external_turn as unknown as {
        optional_request: { provenance: Record<string, unknown> };
      }
    ).optional_request.provenance;
    const withProvenance: HostShape<Thread> = {
      ...shape,
      provenanceOf: one => ({
        host_kind: 'discord',
        message_id: one.provenance.thread,
        place: { id: one.provenance.channel, kind: 'channel' },
        thread: one.provenance.thread,
      }),
    };
    const session = withProvenance.sessionUidOf(request);
    const { calls, fetchImplementation } = wire({
      [`POST ${API}/api/ai-agents/v1/apps/hosts/self/token`]: () =>
        Response.json(exchanged),
      [`POST ${exchanged.session_api.url}`]: () =>
        sse({ type: 'RUN_FINISHED' }),
      [`POST ${exchanged.session_api.url}/S1/messages`]: () =>
        sse({ type: 'RUN_FINISHED' }),
    });
    const client = new HttpAgentClient(
      API,
      new HostKeyCredentials(
        API,
        async () => 'dlhk_key',
        withProvenance,
        fetchImplementation,
      ),
      withProvenance,
      fetchImplementation,
    );
    await collect((await client.startTurn(request)).updates);
    await collect(
      (await client.startTurn({ ...request, sessionId: 'S1' })).updates,
    );
    const [, start, , message] = calls;
    const sent = (start?.body as { provenance: Record<string, unknown> })
      .provenance;
    expect(Object.keys(sent).sort()).toEqual(Object.keys(provenance).sort());
    expect(sent).toEqual({
      host_kind: 'discord',
      message_id: 'T',
      place: { id: 'C', kind: 'channel' },
      thread: 'T',
    });
    expect((message?.body as { provenance: unknown }).provenance).toEqual(sent);
    expect(JSON.stringify(sent).length).toBeLessThanOrEqual(
      (contracts.external_turn as unknown as { provenance_limit_bytes: number })
        .provenance_limit_bytes,
    );
    expect(session).toMatch(/^discord-/);
  });

  it('answers a replayed turn from the session, running nothing again', async () => {
    const thread = `${exchanged.session_api.url}/S1`;
    const { calls, fetchImplementation } = wire({
      [`POST ${API}/api/ai-agents/v1/apps/hosts/self/token`]: () =>
        Response.json(exchanged),
      [`POST ${thread}/messages`]: () =>
        sse({
          type: 'CUSTOM',
          name: 'loop.turn',
          value: {
            session: 'S1',
            turn: 't1',
            replayed: true,
            state: 'finished',
          },
        }),
      [`GET ${thread}/messages`]: () =>
        Response.json({
          messages: [
            { role: 'user', content: 'Summarize' },
            { role: 'assistant', content: 'Option B is safer.' },
          ],
        }),
    });
    const client = new HttpAgentClient(
      API,
      new HostKeyCredentials(
        API,
        async () => 'dlhk_key',
        shape,
        fetchImplementation,
      ),
      shape,
      fetchImplementation,
    );
    const turn = await client.startTurn({ ...request, sessionId: 'S1' });
    expect(await collect(turn.updates)).toEqual([
      { kind: 'completion', text: 'Option B is safer.' },
    ]);
    expect(calls.map(call => call.method)).toEqual(['POST', 'POST', 'GET']);
  });

  it("says the exchange's refusal and starts nothing", async () => {
    const { calls, fetchImplementation } = wire({
      [`POST ${API}/api/ai-agents/v1/apps/hosts/self/token`]: () =>
        Response.json({ detail: 'not linked' }, { status: 403 }),
    });
    const client = new HttpAgentClient(
      API,
      new HostKeyCredentials(
        API,
        async () => 'dlhk_key',
        shape,
        fetchImplementation,
      ),
      shape,
      fetchImplementation,
    );
    await expect(client.startTurn(request)).rejects.toThrow(/403/);
    expect(calls).toHaveLength(1);
  });

  it("refuses an installation without a host key in the host's words, unless development's credentials stand in", async () => {
    const { calls, fetchImplementation } = wire({});
    const unbound = new HostKeyCredentials(
      API,
      async () => undefined,
      shape,
      fetchImplementation,
    );
    await expect(
      new InstallationCredentials(unbound).forTurn(request),
    ).rejects.toThrow(NOT_BOUND);
    const development = {
      forTurn: async () => ({
        accessToken: 'dev',
        agent: 'agent-desk',
        bindable: false,
        deploymentUid: 'dep-1',
        sessionApiUrl: exchanged.session_api.url,
      }),
    };
    await expect(
      new InstallationCredentials(unbound, development).forTurn(request),
    ).resolves.toMatchObject({ accessToken: 'dev', bindable: false });
    expect(calls).toHaveLength(0);
  });

  it("maps the session again with the shape's target as the speaker, or says nothing binds", async () => {
    const session = shape.sessionUidOf(request);
    const { calls, fetchImplementation } = wire({
      [`POST ${API}/api/ai-agents/v1/apps/hosts/self/token`]: () =>
        Response.json(exchanged),
      [`PUT ${API}/api/ai-agents/v1/apps/hosts/sessions/${session}`]: () =>
        Response.json({ success: true }),
    });
    const hostKey = async () => 'dlhk_key';
    const client = new HttpAgentClient(
      API,
      new HostKeyCredentials(API, hostKey, shape, fetchImplementation),
      shape,
      fetchImplementation,
      hostKey,
    );
    const later = {
      ...request,
      provenance: { ...request.provenance, channel: 'C2' },
    };
    await expect(client.bindSession(session, later)).resolves.toBe(true);
    const [exchange, bind] = calls;
    expect(exchange?.url).toBe(`${API}/api/ai-agents/v1/apps/hosts/self/token`);
    expect(bind?.method).toBe('PUT');
    expect(bind?.headers.authorization).toBe('Bearer host-token');
    expect(bind?.headers[contracts.headers.host_key!]).toBe('dlhk_key');
    expect(bind?.body).toEqual({
      target: { channelId: 'C2', userId: '80351110224678912' },
    });

    const refused = wire({
      [`POST ${API}/api/ai-agents/v1/apps/hosts/self/token`]: () =>
        Response.json(exchanged),
      [`PUT ${API}/api/ai-agents/v1/apps/hosts/sessions/${session}`]: () =>
        new Response('{}', { status: 403 }),
    });
    await expect(
      new HttpAgentClient(
        API,
        new HostKeyCredentials(
          API,
          hostKey,
          shape,
          refused.fetchImplementation,
        ),
        shape,
        refused.fetchImplementation,
        hostKey,
      ).bindSession(session, request),
    ).rejects.toThrow(/403/);

    const development = {
      forTurn: async () => ({
        accessToken: 'dev',
        agent: 'agent-desk',
        bindable: false,
        deploymentUid: 'dep-1',
        sessionApiUrl: exchanged.session_api.url,
      }),
    };
    const none = wire({});
    await expect(
      new HttpAgentClient(
        API,
        development,
        shape,
        none.fetchImplementation,
        hostKey,
      ).bindSession(session, request),
    ).resolves.toBe(false);
    expect(none.calls).toHaveLength(0);
  });

  it('stops a turn, taking 409 (already ended) as done', async () => {
    const stop = `${exchanged.session_api.url}/S1/stop`;
    for (const status of [200, 409]) {
      const { fetchImplementation } = wire({
        [`POST ${API}/api/ai-agents/v1/apps/hosts/self/token`]: () =>
          Response.json(exchanged),
        [`POST ${stop}`]: () => new Response('{}', { status }),
      });
      const client = new HttpAgentClient(
        API,
        new HostKeyCredentials(
          API,
          async () => 'k',
          shape,
          fetchImplementation,
        ),
        shape,
        fetchImplementation,
      );
      await expect(client.stopTurn('S1', request)).resolves.toBeUndefined();
    }
  });
});

describe('agUiEventsOf', () => {
  it('reads frames split across chunks, and a last frame without its blank line', async () => {
    const text =
      'data: {"type":"TEXT_MESSAGE_CONTENT","delta":"é"}\n\ndata: {"type":"RUN_FINISHED"}';
    const bytes = new TextEncoder().encode(text);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        // Split inside the two bytes of "é".
        const cut = text.indexOf('é') + 1;
        controller.enqueue(bytes.slice(0, cut));
        controller.enqueue(bytes.slice(cut));
        controller.close();
      },
    });
    expect(await collect(agUiEventsOf(body))).toEqual([
      { type: 'TEXT_MESSAGE_CONTENT', delta: 'é' },
      { type: 'RUN_FINISHED' },
    ]);
  });
});

describe("an application's starters", () => {
  const current = `${API}/rt-1/api/v1/apps/current`;

  function startersOf(answers: Record<string, () => Response>) {
    const { calls, fetchImplementation } = wire({
      [`POST ${API}/api/ai-agents/v1/apps/hosts/self/token`]: () =>
        Response.json(exchanged),
      ...answers,
    });
    const keyed = new HostKeyCredentials(
      API,
      async () => 'dlhk_key',
      shape,
      fetchImplementation,
    );
    const source = new HostStarters<string, Thread>(
      API,
      keyed,
      async () => 'dlhk_key',
      fetchImplementation,
    );
    return { calls, source };
  }

  it('reads them beside the session API, as the linked person, with no place', async () => {
    const { calls, source } = startersOf({
      [`GET ${current}`]: () =>
        Response.json({
          starters: [{ label: 'Compare', message: 'Compare the options.' }],
        }),
    });
    await expect(source.startersOf('G', 'U', 'dep-1')).resolves.toEqual([
      { label: 'Compare', message: 'Compare the options.' },
    ]);
    expect(calls[0]?.body).toEqual({
      deployment_uid: 'dep-1',
      external_user_id: 'U',
    });
  });

  it('refuses a runtime that answers no starters, or refuses, or an installation never bound', async () => {
    await expect(
      startersOf({
        [`GET ${current}`]: () => Response.json({ id: 'desk' }),
      }).source.startersOf('G', 'U', 'dep-1'),
    ).rejects.toThrow();
    await expect(
      startersOf({
        [`GET ${current}`]: () => new Response('', { status: 403 }),
      }).source.startersOf('G', 'U', 'dep-1'),
    ).rejects.toThrow(/did not say what it suggests asking \(403\)/);
    const keyed = new HostKeyCredentials<Thread>(
      API,
      async () => undefined,
      shape,
    );
    await expect(
      new HostStarters<string, Thread>(
        API,
        keyed,
        async () => undefined,
      ).startersOf('G', 'U', 'dep-1'),
    ).rejects.toThrow(NOT_BOUND);
  });
});

describe('DevelopmentCredentials', () => {
  const request = {
    applicationId: 'dep-1',
  } as unknown as HostTurnRequest<unknown>;
  const answering = (status: number, body: unknown): typeof fetch =>
    (async () =>
      new Response(JSON.stringify(body), {
        status,
      })) as unknown as typeof fetch;

  it('refuses a deployment not kept, with its own reason, as a refusal the host says', async () => {
    const credentials = new DevelopmentCredentials(
      'https://r1.example',
      't',
      answering(200, {
        deployment: {
          kept: { why: 'It has spent 20.00 of its 20.00 credits for today.' },
        },
      }),
    );
    const refusal = await credentials
      .forTurn(request)
      .catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(HostRefusedError);
    expect((refusal as HostRefusedError).status).toBe(409);
    expect((refusal as HostRefusedError).detail).toContain(
      '20.00 credits for today',
    );
  });

  it('refuses without a reason when the deployment gives none, and on a failed answer', async () => {
    const notKept = await new DevelopmentCredentials(
      'https://r1.example',
      't',
      answering(200, { deployment: {} }),
    )
      .forTurn(request)
      .catch((error: unknown) => error);
    expect((notKept as HostRefusedError).detail).toBe(
      'The deployment is not kept always on: turn it on under Ship.',
    );
    const missing = await new DevelopmentCredentials(
      'https://r1.example',
      't',
      answering(404, {}),
    )
      .forTurn(request)
      .catch((error: unknown) => error);
    expect(missing).toBeInstanceOf(HostRefusedError);
    expect((missing as HostRefusedError).status).toBe(404);
  });

  it('answers the kept runtime when the deployment is kept', async () => {
    const session = await new DevelopmentCredentials(
      'https://r1.example',
      't',
      answering(200, {
        deployment: { kept: { agent_id: 'a', url: 'https://rt.example/' } },
      }),
    ).forTurn(request);
    expect(session).toMatchObject({
      agent: 'a',
      deploymentUid: 'dep-1',
      sessionApiUrl: 'https://rt.example/api/v1/apps/sessions',
    });
  });
});

describe('a refused turn', () => {
  it('is a HostRefusedError carrying the reason the runtime gives', async () => {
    const answers = [
      new Response(
        JSON.stringify({
          deployment: { kept: { agent_id: 'a', url: 'https://r1.example/rt' } },
        }),
        { status: 200 },
      ),
      new Response(
        JSON.stringify({
          detail:
            'It acts in the name of each of its users: no user token was sent.',
        }),
        { status: 401 },
      ),
    ];
    const fetchImpl = (async () =>
      answers.shift() as Response) as unknown as typeof fetch;
    const client = new HttpAgentClient(
      'https://r1.example',
      new DevelopmentCredentials('https://r1.example', 't', fetchImpl),
      {
        sessionUidOf: () => 'session-1',
        placeOf: () => 'p',
        targetOf: () => ({}),
      } as unknown as HostShape<unknown>,
      fetchImpl,
    );
    const refusal = await client
      .startTurn({
        applicationId: 'dep-1',
        externalEventId: 'ev-1',
        prompt: 'hi',
      } as unknown as HostTurnRequest<unknown>)
      .catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(HostRefusedError);
    expect((refusal as HostRefusedError).status).toBe(401);
    expect((refusal as HostRefusedError).detail).toBe(
      'It acts in the name of each of its users: no user token was sent.',
    );
  });
});
