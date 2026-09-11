/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Every call of the environments API: its method, its URL, its body, and the
 * headers a conditional or keyed write carries, held to the routes of
 * PLAN_ENV.md section 9 as Runtimes serves them (E1-01). Following a build's
 * log runs on the stream E1-16's route sent, recorded in
 * `agent_runtimes/tests/environments_build_logs_recorded.sse`, and on streams
 * written to break where a network would.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { environments } from '..';
import { requestDatalayerAPI } from '@datalayer/core/lib/api/DatalayerApi';
import { MOCK_JWT_TOKEN } from '../../../__tests__/shared/test-constants';
import type { EnvironmentDocument } from '../../../models/Environment';

vi.mock('@datalayer/core/lib/api/DatalayerApi', () => ({
  requestDatalayerAPI: vi.fn(),
}));

const token = MOCK_JWT_TOKEN;
const BASE = 'https://runtimes.example';
const API = `${BASE}/api/runtimes/v1`;
const ENV = '01M28PM382W8640FXVM22D72Z7';
const VERSION = '01M28PM38J6VRXRW6AC2KX0HSG';
const BUILD = '01M28PM3955P23VDGB42HGD9BV';

const spec: EnvironmentDocument = {
  apiVersion: 'environments.datalayer.io/v1alpha1',
  kind: 'Environment',
  metadata: { name: 'geo' },
  spec: {
    language: { name: 'python', version: '3.13' },
    base: { ref: 'datalayer/python-cpu', channel: '2026.09' },
    packages: { python: { dependencies: ['geopandas==1.1.1'] } },
    compatibility: { variants: { required: ['datalayer'], optional: ['e2b'] } },
  },
};

interface Sent {
  method: string;
  url: string;
  body?: unknown;
  headers?: Record<string, string>;
}

/** Each call, and what it must send. */
const CALLS: Array<[string, () => Promise<unknown>, Sent]> = [
  [
    'listEnvironments',
    () => environments.listEnvironments(token, BASE),
    { method: 'GET', url: `${API}/environments` },
  ],
  [
    'listEnvironments with filters and a cursor',
    () =>
      environments.listEnvironments(token, BASE, {
        owner: 'org-1',
        origin: 'user',
        variant: 'e2b',
        q: 'geo',
        cursor: 'next',
        limit: 20,
      }),
    {
      method: 'GET',
      url: `${API}/environments?owner=org-1&origin=user&variant=e2b&q=geo&cursor=next&limit=20`,
    },
  ],
  [
    'createEnvironment',
    () =>
      environments.createEnvironment(
        token,
        {
          name: 'geo',
          title: 'Geo',
          ownerType: 'organization',
          ownerUid: 'org-1',
        },
        { idempotencyKey: 'env-1', correlationId: 'trace-1' },
        BASE,
      ),
    {
      method: 'POST',
      url: `${API}/environments`,
      body: {
        name: 'geo',
        title: 'Geo',
        ownerType: 'organization',
        ownerUid: 'org-1',
      },
      headers: { 'Idempotency-Key': 'env-1', 'X-Correlation-Id': 'trace-1' },
    },
  ],
  [
    'getEnvironment',
    () => environments.getEnvironment(token, ENV, {}, BASE),
    { method: 'GET', url: `${API}/environments/${ENV}` },
  ],
  [
    'updateEnvironment',
    () =>
      environments.updateEnvironment(
        token,
        ENV,
        { title: 'Geospatial' },
        '"101"',
        {},
        BASE,
      ),
    {
      method: 'PATCH',
      url: `${API}/environments/${ENV}`,
      body: { title: 'Geospatial' },
      headers: { 'If-Match': '"101"' },
    },
  ],
  [
    'deleteEnvironment',
    () =>
      environments.deleteEnvironment(token, ENV, { ifMatch: '"102"' }, BASE),
    {
      method: 'DELETE',
      url: `${API}/environments/${ENV}`,
      headers: { 'If-Match': '"102"' },
    },
  ],
  [
    'archiveEnvironment',
    () => environments.archiveEnvironment(token, ENV, {}, BASE),
    { method: 'POST', url: `${API}/environments/${ENV}/archive` },
  ],
  [
    'promoteEnvironmentVersion',
    () =>
      environments.promoteEnvironmentVersion(
        token,
        ENV,
        { versionUid: VERSION, acknowledgeUnavailableVariants: ['e2b'] },
        '"102"',
        { correlationId: 'trace-2' },
        BASE,
      ),
    {
      method: 'PUT',
      url: `${API}/environments/${ENV}/promoted-version`,
      body: { versionUid: VERSION, acknowledgeUnavailableVariants: ['e2b'] },
      headers: { 'If-Match': '"102"', 'X-Correlation-Id': 'trace-2' },
    },
  ],
  [
    'promoteEnvironmentVersion of none',
    () =>
      environments.promoteEnvironmentVersion(
        token,
        ENV,
        { versionUid: null },
        '"103"',
        {},
        BASE,
      ),
    {
      method: 'PUT',
      url: `${API}/environments/${ENV}/promoted-version`,
      body: { versionUid: null },
      headers: { 'If-Match': '"103"' },
    },
  ],
  [
    'createEnvironmentVersion',
    () =>
      environments.createEnvironmentVersion(
        token,
        ENV,
        { spec, label: 'first' },
        { idempotencyKey: 'v-1' },
        BASE,
      ),
    {
      method: 'POST',
      url: `${API}/environments/${ENV}/versions`,
      body: { spec, label: 'first' },
      headers: { 'Idempotency-Key': 'v-1' },
    },
  ],
  [
    'listEnvironmentVersions',
    () =>
      environments.listEnvironmentVersions(
        token,
        ENV,
        { cursor: 'c1', limit: 2 },
        {},
        BASE,
      ),
    {
      method: 'GET',
      url: `${API}/environments/${ENV}/versions?cursor=c1&limit=2`,
    },
  ],
  [
    'getEnvironmentVersion',
    () => environments.getEnvironmentVersion(token, VERSION, {}, BASE),
    { method: 'GET', url: `${API}/environment-versions/${VERSION}` },
  ],
  [
    'updateEnvironmentVersion',
    () =>
      environments.updateEnvironmentVersion(
        token,
        VERSION,
        { label: 'renamed' },
        '"101"',
        {},
        BASE,
      ),
    {
      method: 'PATCH',
      url: `${API}/environment-versions/${VERSION}`,
      body: { label: 'renamed' },
      headers: { 'If-Match': '"101"' },
    },
  ],
  [
    'validateEnvironmentVersion',
    () =>
      environments.validateEnvironmentVersion(
        token,
        VERSION,
        { variants: ['datalayer'] },
        {},
        BASE,
      ),
    {
      method: 'POST',
      url: `${API}/environment-versions/${VERSION}/validate`,
      body: { variants: ['datalayer'] },
    },
  ],
  [
    'resolveEnvironmentVersion',
    () => environments.resolveEnvironmentVersion(token, VERSION, {}, BASE),
    { method: 'POST', url: `${API}/environment-versions/${VERSION}/resolve` },
  ],
  [
    'createEnvironmentBuilds',
    () =>
      environments.createEnvironmentBuilds(
        token,
        VERSION,
        {
          variants: ['datalayer', 'e2b'],
          requiredVariants: ['datalayer'],
          regions: ['r1'],
          force: true,
        },
        { idempotencyKey: 'build-1', correlationId: 'trace-3' },
        BASE,
      ),
    {
      method: 'POST',
      url: `${API}/environment-versions/${VERSION}/builds`,
      body: {
        variants: ['datalayer', 'e2b'],
        requiredVariants: ['datalayer'],
        regions: ['r1'],
        force: true,
      },
      headers: { 'Idempotency-Key': 'build-1', 'X-Correlation-Id': 'trace-3' },
    },
  ],
  [
    'listEnvironmentBuilds',
    () =>
      environments.listEnvironmentBuilds(
        token,
        VERSION,
        { limit: 10 },
        {},
        BASE,
      ),
    {
      method: 'GET',
      url: `${API}/environment-versions/${VERSION}/builds?limit=10`,
    },
  ],
  [
    'listEnvironmentArtifacts',
    () => environments.listEnvironmentArtifacts(token, VERSION, {}, {}, BASE),
    { method: 'GET', url: `${API}/environment-versions/${VERSION}/artifacts` },
  ],
  [
    'trialEnvironmentVersion',
    () => environments.trialEnvironmentVersion(token, VERSION, {}, BASE),
    { method: 'POST', url: `${API}/environment-versions/${VERSION}/trial` },
  ],
  [
    'deprecateEnvironmentVersion',
    () => environments.deprecateEnvironmentVersion(token, VERSION, {}, BASE),
    { method: 'POST', url: `${API}/environment-versions/${VERSION}/deprecate` },
  ],
  [
    'getEnvironmentBuild',
    () => environments.getEnvironmentBuild(token, BUILD, {}, BASE),
    { method: 'GET', url: `${API}/environment-builds/${BUILD}` },
  ],
  [
    'getEnvironmentBuildLogs',
    () =>
      environments.getEnvironmentBuildLogs(
        token,
        BUILD,
        { cursor: '0', limit: 10 },
        {},
        BASE,
      ),
    {
      method: 'GET',
      url: `${API}/environment-builds/${BUILD}/logs?cursor=0&limit=10`,
    },
  ],
  [
    'cancelEnvironmentBuild',
    () =>
      environments.cancelEnvironmentBuild(
        token,
        BUILD,
        { ifMatch: '"101"' },
        BASE,
      ),
    {
      method: 'POST',
      url: `${API}/environment-builds/${BUILD}/cancel`,
      headers: { 'If-Match': '"101"' },
    },
  ],
  [
    'retryEnvironmentBuild',
    () => environments.retryEnvironmentBuild(token, BUILD, {}, BASE),
    { method: 'POST', url: `${API}/environment-builds/${BUILD}/retry` },
  ],
];

/** The routes of section 9, as E1-01 serves them; the log's `follow` is `subscribeToBuildLogs`. */
const SECTION_9_ROUTES = [
  'POST /environments',
  'GET /environments',
  'GET /environments/{uid}',
  'PATCH /environments/{uid}',
  'DELETE /environments/{uid}',
  'POST /environments/{uid}/archive',
  'PUT /environments/{uid}/promoted-version',
  'POST /environments/{uid}/versions',
  'GET /environments/{uid}/versions',
  'GET /environment-versions/{uid}',
  'PATCH /environment-versions/{uid}',
  'POST /environment-versions/{uid}/validate',
  'POST /environment-versions/{uid}/resolve',
  'POST /environment-versions/{uid}/builds',
  'GET /environment-versions/{uid}/builds',
  'GET /environment-versions/{uid}/artifacts',
  'POST /environment-versions/{uid}/trial',
  'POST /environment-versions/{uid}/deprecate',
  'GET /environment-builds/{uid}',
  'GET /environment-builds/{uid}/logs',
  'POST /environment-builds/{uid}/cancel',
  'POST /environment-builds/{uid}/retry',
];

describe('Runtimes Environments API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requestDatalayerAPI).mockResolvedValue({});
  });

  it.each(CALLS)(
    '%s sends its method, URL, body and headers',
    async (_, call, sent) => {
      await call();
      expect(requestDatalayerAPI).toHaveBeenCalledTimes(1);
      const [options] = vi.mocked(requestDatalayerAPI).mock.calls[0];
      expect({
        method: options.method,
        url: options.url,
        body: options.body,
        headers: options.headers,
      }).toEqual({ body: undefined, headers: {}, ...sent });
      expect(options.token).toBe(token);
    },
  );

  it('has a call for every route of section 9', () => {
    const covered = new Set(
      CALLS.map(([, , sent]) => {
        const path = new URL(sent.url).pathname
          .replace('/api/runtimes/v1', '')
          .replace(/\/[0-9A-HJKMNP-TV-Z]{26}(?=\/|$)/g, '/{uid}');
        return `${sent.method} ${path}`;
      }),
    );
    expect([...covered].sort()).toEqual([...SECTION_9_ROUTES].sort());
  });

  it('answers what the service answered', async () => {
    const answer = { success: true, environments: [{ name: 'python-cpu' }] };
    vi.mocked(requestDatalayerAPI).mockResolvedValue(answer);
    expect(await environments.listEnvironments(token)).toEqual(answer);
  });

  it('refuses a required If-Match that is missing, before sending anything', async () => {
    await expect(
      environments.updateEnvironment(token, ENV, { title: 'x' }, '', {}, BASE),
    ).rejects.toThrow();
    await expect(
      environments.promoteEnvironmentVersion(
        token,
        ENV,
        { versionUid: VERSION },
        '',
      ),
    ).rejects.toThrow();
    expect(requestDatalayerAPI).not.toHaveBeenCalled();
  });

  it('reads the section 10 body of a refusal', async () => {
    const body = {
      code: 'DL_ENV_PRECONDITION_FAILED',
      message: 'The record changed since the version If-Match names',
      correlationId: '01M28PM3887AVCWS8XJH76AQ0W',
      detail: { etag: '"102"' },
    };
    expect(
      await environments.asEnvironmentsError({
        response: { json: async () => body },
      }),
    ).toEqual(body);
    expect(
      await environments.asEnvironmentsError({
        response: { json: async () => ({ detail: 'not built yet' }) },
      }),
    ).toBeUndefined();
    expect(
      await environments.asEnvironmentsError(new Error('network')),
    ).toBeUndefined();
  });
});

// -- Following a build's log --------------------------------------------------

const encoder = new TextEncoder();

/** What E1-16's routes answered for one build, recorded from Runtimes' in-memory app. */
const FIXTURES = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'agent_runtimes',
  'tests',
);
const RECORDED = JSON.parse(
  readFileSync(join(FIXTURES, 'environments_registry_recorded.json'), 'utf-8'),
).calls;
/** The bytes `logs?follow=true` sent, `event: end` included. */
const RECORDED_STREAM = Uint8Array.from(
  readFileSync(join(FIXTURES, RECORDED.follow_build_log.stream)),
);
/** The build's chunks, as the polling route answered them once it had ended. */
const STORED_CHUNKS: Array<{ sequence: number; text: string }> =
  RECORDED.read_followed_build_log.body.chunks;
const LOGGED_BUILD: string = RECORDED.get_followed_build.body.uid;

const framed = (sequence: number) =>
  `id: ${sequence}\nevent: chunk\ndata: ${JSON.stringify({
    sequence,
    text: `step ${sequence}\n`,
    size: 7,
    createdAt: '2026-09-11T17:00:41Z',
  })}\n\n`;

/** A response whose body sends these pieces, then ends or breaks. */
const answer = (
  pieces: Array<string | Uint8Array>,
  ending: 'end' | 'break',
) => {
  let index = 0;
  return {
    ok: true,
    status: 200,
    text: async () => '',
    body: new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index < pieces.length) {
          const piece = pieces[index++];
          controller.enqueue(
            typeof piece === 'string' ? encoder.encode(piece) : piece,
          );
          return;
        }
        if (ending === 'break') {
          controller.error(new TypeError('network error'));
        } else {
          controller.close();
        }
      },
    }),
  };
};

describe('subscribeToBuildLogs', () => {
  it.each([1, 3, 7, 64, RECORDED_STREAM.length])(
    'reads the stream the route sent, %i bytes at a time, and ends on its end event',
    async size => {
      const pieces: Uint8Array[] = [];
      for (let start = 0; start < RECORDED_STREAM.length; start += size) {
        pieces.push(RECORDED_STREAM.slice(start, start + size));
      }
      const fetcher = vi.fn(async () => answer(pieces, 'end'));
      const received: unknown[] = [];
      let ended = false;
      const subscription = environments.subscribeToBuildLogs(
        token,
        LOGGED_BUILD,
        {
          onChunk: chunk => received.push(chunk),
          onEnd: () => {
            ended = true;
          },
          reconnectDelayMs: 0,
          fetch: fetcher,
        },
        BASE,
      );
      await subscription.done;

      expect(received).toEqual(STORED_CHUNKS);
      expect(ended).toBe(true);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(subscription.lastEventId()).toBe(
        String(STORED_CHUNKS[STORED_CHUNKS.length - 1].sequence),
      );
      // The chunk that echoed credentials arrives as the route redacted it.
      const log = STORED_CHUNKS.map(chunk => chunk.text).join('');
      expect(log).toContain('+ export GITHUB_TOKEN=[REDACTED]\n');
      expect(log).toContain('https://build:[REDACTED]@pypi.example/simple');
    },
  );

  it('resumes the recorded stream after it breaks, from the last id received, with nothing repeated', async () => {
    const events = new TextDecoder()
      .decode(RECORDED_STREAM)
      .split('\n\n')
      .filter(block => block !== '')
      .map(block => `${block}\n\n`);
    const asked: Array<string | undefined> = [];
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const lastEventId = (init.headers as Record<string, string>)[
        'Last-Event-ID'
      ];
      asked.push(lastEventId);
      if (lastEventId === undefined) {
        // Three chunks and half of the fourth, then the connection breaks.
        const half = events[3].slice(0, Math.floor(events[3].length / 2));
        return answer([...events.slice(0, 3), half], 'break');
      }
      // The route resumes after the id it is sent.
      return answer(events.slice(Number(lastEventId) + 1), 'end');
    });
    const received: number[] = [];
    await environments.subscribeToBuildLogs(
      token,
      LOGGED_BUILD,
      {
        onChunk: chunk => received.push(chunk.sequence),
        reconnectDelayMs: 0,
        fetch: fetcher,
      },
      BASE,
    ).done;

    expect(received).toEqual(STORED_CHUNKS.map(chunk => chunk.sequence));
    expect(asked).toEqual([undefined, '2']);
  });

  it('streams with the bearer token, resumes a dropped connection after the last chunk, and receives each chunk once', async () => {
    const sequences = [0, 1, 2, 3, 4];
    const asked: Array<{ url: string; headers: Record<string, string> }> = [];
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      asked.push({ url, headers });
      const after = Number(headers['Last-Event-ID'] ?? -1);
      const pending = sequences.filter(one => one > after).map(framed);
      if (asked.length === 1) {
        // Two chunks, the second in two pieces, then a break mid-chunk.
        return answer(
          [
            pending[0],
            pending[1].slice(0, 12),
            pending[1].slice(12),
            pending[2].slice(0, 20),
          ],
          'break',
        );
      }
      return answer(
        [': keepalive\n\n', ...pending, 'event: end\ndata: {}\n\n'],
        'end',
      );
    });
    const received: number[] = [];
    let ended = false;
    const subscription = environments.subscribeToBuildLogs(
      token,
      BUILD,
      {
        onChunk: chunk => received.push(chunk.sequence),
        onEnd: () => {
          ended = true;
        },
        reconnectDelayMs: 0,
        fetch: fetcher,
      },
      BASE,
    );
    await subscription.done;

    expect(received).toEqual(sequences);
    expect(ended).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(asked[0].url).toBe(
      `${API}/environment-builds/${BUILD}/logs?follow=true`,
    );
    expect(asked[0].headers).toEqual({
      Accept: 'text/event-stream',
      Authorization: `Bearer ${token}`,
    });
    expect(asked[1].headers['Last-Event-ID']).toBe('1');
    expect(subscription.lastEventId()).toBe('4');
  });

  it('starts after the last event id it is given', async () => {
    const fetcher = vi.fn(async () =>
      answer([framed(3), 'event: end\ndata: {}\n\n'], 'end'),
    );
    const received: number[] = [];
    await environments.subscribeToBuildLogs(
      token,
      BUILD,
      {
        lastEventId: '2',
        onChunk: chunk => received.push(chunk.sequence),
        fetch: fetcher,
      },
      BASE,
    ).done;
    const init = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect((init[1].headers as Record<string, string>)['Last-Event-ID']).toBe(
      '2',
    );
    expect(received).toEqual([3]);
  });

  it('rejects with the refusal and does not retry, as the 404 of a build the caller may not read', async () => {
    const missing = RECORDED.follow_build_log_missing;
    const fetcher = vi.fn(async () => ({
      ok: false,
      status: missing.status,
      body: null,
      text: async () => JSON.stringify(missing.body),
    }));
    const done = environments.subscribeToBuildLogs(
      token,
      LOGGED_BUILD,
      { onChunk: () => undefined, reconnectDelayMs: 0, fetch: fetcher },
      BASE,
    ).done;
    const refusal = await done.catch(error => error);
    expect(refusal).toBeInstanceOf(environments.BuildLogSubscriptionRefused);
    expect(refusal.status).toBe(404);
    expect(JSON.parse(refusal.detail).code).toBe('DL_ENV_NOT_FOUND');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxReconnects drops in a row with no chunk between them', async () => {
    const fetcher = vi.fn(async () => answer([], 'break'));
    const done = environments.subscribeToBuildLogs(
      token,
      BUILD,
      {
        onChunk: () => undefined,
        maxReconnects: 2,
        reconnectDelayMs: 0,
        fetch: fetcher,
      },
      BASE,
    ).done;
    await expect(done).rejects.toThrow(/dropped 3 times/);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('ends quietly when the caller aborts', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<never>((_, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const subscription = environments.subscribeToBuildLogs(
      token,
      BUILD,
      {
        onChunk: () => undefined,
        signal: controller.signal,
        fetch: fetcher,
      },
      BASE,
    );
    controller.abort();
    await expect(subscription.done).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
