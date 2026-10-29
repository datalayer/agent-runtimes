/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A public application in the element, for a visitor without an account
 * (D-07, R-30): an example kept warm or an address open to visitors
 * run on the visitors' runtime with a visitor's token for it; a decision
 * framed; a private address, one that reaches its owner's connections, or
 * an example not kept, said in one sentence naming the embed token.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  CONTROL_PLANE_URL,
  RUNTIMES_PLANE_URL,
} from '@datalayer/core/lib/config/planes';
import { emptyAppspec } from '../apps/appspec';
import {
  AT_PREFIX,
  DEFAULT_API,
  DEFAULT_INFERENCE,
  TOKEN_HINT,
  VISITORS_PATH,
  VISITOR_EXAMPLES,
  isAppUid,
  readVisitorApp,
  visitorsAt,
} from '../embed/visitorApp';

const ULID = '01M4DF584YAF36ACJRTYG341E5';

function answer(status: number, body: unknown): typeof fetch {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  ) as unknown as typeof fetch;
}

const calledWith = (fetcher: typeof fetch): string =>
  String(
    (fetcher as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0],
  );

/** ai-agents' answer for an address a visitor may talk to. */
function opened(
  spec: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) {
  return {
    success: true,
    visitor: true,
    deployment: {
      uid: 'dep-1',
      app_uid: ULID,
      app_name: 'Research desk',
      slug: 'research',
    },
    spec,
    session: { opens: true, reason: '' },
    runs_code: false,
    ...extra,
  };
}

describe('a visitor’s application', () => {
  it('asks the AI plane for ai-agents and for the visitor’s token, as core’s plane table says it, unless api names where', async () => {
    // core's table, never a literal of this bundle's own: the one it carried
    // said prod1, where no ai-inference answers, and a bare element could
    // not mint a visitor's token (28 October 2026).
    expect(DEFAULT_API).toBe(RUNTIMES_PLANE_URL);
    expect(DEFAULT_INFERENCE).toBe(RUNTIMES_PLANE_URL);
    expect(DEFAULT_API).not.toBe(CONTROL_PLANE_URL);
    expect(visitorsAt(DEFAULT_API, 'web-research')).toEqual({
      url: `${RUNTIMES_PLANE_URL}${VISITORS_PATH}`,
      app: 'web-research',
      inferenceUrl: RUNTIMES_PLANE_URL,
    });
    // `api` names both; `inference` names the minting alone.
    const own = await readVisitorApp({
      app: 'web-research',
      api: 'https://own.example/',
    });
    expect(own.kind === 'visitors' && own.visitors).toEqual({
      url: 'https://own.example/api/runtime-visitors',
      app: 'web-research',
      inferenceUrl: 'https://own.example',
    });
    const minted = await readVisitorApp({
      app: 'web-research',
      inference: 'https://mint.example/',
    });
    expect(minted.kind === 'visitors' && minted.visitors).toEqual({
      url: `${DEFAULT_API}${VISITORS_PATH}`,
      app: 'web-research',
      inferenceUrl: 'https://mint.example',
    });
  });

  it('runs an example the visitors’ runtime keeps warm, with a token for its id', async () => {
    const read = await readVisitorApp({ app: 'web-research' });
    expect(read.kind).toBe('visitors');
    if (read.kind !== 'visitors') return;
    expect(read.app.id).toBe('web-research');
    expect(read.app.agent).toBeTruthy();
    expect(read.visitors).toEqual({
      url: `${DEFAULT_API}${VISITORS_PATH}`,
      app: 'web-research',
      inferenceUrl: DEFAULT_API,
    });
  });

  it('says an example the visitors’ runtime does not keep, naming the ones it does', async () => {
    const read = await readVisitorApp({
      app: 'accounting',
      catalogue: id => (id === 'accounting' ? emptyAppspec('chat') : undefined),
    });
    expect(read.kind).toBe('said');
    if (read.kind !== 'said') return;
    expect(read.text).toContain(
      '"accounting" is an example Datalayer does not keep ready for visitors',
    );
    for (const kept of VISITOR_EXAMPLES) {
      expect(read.text).toContain(kept);
    }
    expect(read.text).toContain(TOKEN_HINT);
  });

  it('frames a decision, named by its id or as an example', async () => {
    expect(isAppUid(ULID)).toBe(true);
    expect(isAppUid('01M')).toBe(false);
    expect(await readVisitorApp({ app: ULID })).toEqual({
      kind: 'decision',
      app: ULID,
    });
    const decision = emptyAppspec('decision');
    decision.id = 'pick-a-laptop';
    expect(
      await readVisitorApp({
        app: 'pick-a-laptop',
        catalogue: id => (id === 'pick-a-laptop' ? decision : undefined),
      }),
    ).toEqual({ kind: 'decision', app: 'pick-a-laptop' });
  });

  it('reads an address from ai-agents without a token, and runs it on the visitors’ runtime as at:<slug>', async () => {
    const spec = {
      schema: 'loop.app/v1',
      id: 'research',
      name: 'Research',
      kind: 'chat',
      agent: 'research-agent',
    };
    const fetcher = answer(200, opened(spec));
    const read = await readVisitorApp({
      api: 'https://r1.datalayer.run/',
      app: 'research',
      fetcher,
      catalogue: () => undefined,
    });
    expect(calledWith(fetcher)).toBe(
      'https://r1.datalayer.run/api/ai-agents/v1/apps/deployments/at/research',
    );
    // No credentials: a visitor nobody knows.
    const init = (fetcher as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0][1];
    expect(init).toBeUndefined();
    expect(read.kind).toBe('visitors');
    if (read.kind !== 'visitors') return;
    // The deployment's name, as the hosted page shows it.
    expect(read.app.name).toBe('Research desk');
    expect(read.app.agent).toBe('research-agent');
    expect(read.visitors).toEqual(
      visitorsAt('https://r1.datalayer.run', `${AT_PREFIX}research`),
    );
    expect(read.visitors.app).toBe('at:research');
  });

  it('runs an address with code of its own on the runtime it is kept on, never the visitors’ (R-30)', async () => {
    const spec = {
      schema: 'loop.app/v1',
      id: 'research',
      name: 'Research',
      kind: 'chat',
      agent: 'research-agent',
    };
    const read = await readVisitorApp({
      api: 'https://r1.datalayer.run/',
      app: 'research',
      fetcher: answer(
        200,
        opened(spec, {
          runs_code: true,
          kept: { url: 'https://r1.datalayer.run/jupyter/server/pool/kept-1/' },
        }),
      ),
      catalogue: () => undefined,
    });
    expect(read.kind).toBe('visitors');
    if (read.kind !== 'visitors') return;
    expect(read.visitors).toEqual({
      url: 'https://r1.datalayer.run/jupyter/server/pool/kept-1',
      app: 'at:research',
      inferenceUrl: 'https://r1.datalayer.run',
    });
    expect(read.visitors.url).not.toContain(VISITORS_PATH);
  });

  it('does not run an address with code and no runtime, or one that does not say (fail fast)', async () => {
    const spec = { schema: 'loop.app/v1', id: 'r', kind: 'chat', agent: 'a' };
    const none = await readVisitorApp({
      app: 'research',
      fetcher: answer(200, opened(spec, { runs_code: true })),
      catalogue: () => undefined,
    });
    expect(none.kind).toBe('said');
    if (none.kind !== 'said') return;
    expect(none.text).toContain('none is running now');
    const unsaid = opened(spec) as Record<string, unknown>;
    delete unsaid.runs_code;
    const silent = await readVisitorApp({
      app: 'research',
      fetcher: answer(200, unsaid),
      catalogue: () => undefined,
    });
    expect(silent.kind).toBe('said');
    if (silent.kind !== 'said') return;
    expect(silent.text).toContain('code of its own');
  });

  it('says, in ai-agents’ words, an address a visitor may not talk to, and the token it takes', async () => {
    const read = await readVisitorApp({
      app: 'demo-accounting',
      fetcher: answer(
        200,
        opened(
          { schema: 'loop.app/v1', id: 'accounting', kind: 'chat', agent: 'a' },
          {
            session: {
              opens: false,
              reason:
                "Without an account it is not run: it acts through its owner's connections, which only somebody signed in may use through it. Sign in to use it.",
            },
          },
        ),
      ),
      catalogue: () => undefined,
    });
    expect(read).toEqual({
      kind: 'said',
      text: `datalayer-app: Without an account it is not run: it acts through its owner's connections, which only somebody signed in may use through it. ${TOKEN_HINT}`,
    });
  });

  it('says a private address as ai-agents refuses it: nothing is there without a token (fail fast)', async () => {
    const read = await readVisitorApp({
      app: 'private-desk',
      fetcher: answer(404, { detail: 'No application is at this address.' }),
      catalogue: () => undefined,
    });
    expect(read).toEqual({
      kind: 'said',
      text: `datalayer-app: No application is at this address. ${TOKEN_HINT}`,
    });
  });

  it('frames a decision at its address, and refuses what is no id, example or address', async () => {
    const framed = await readVisitorApp({
      app: 'laptops',
      fetcher: answer(
        200,
        opened({ schema: 'loop.app/v1', id: 'laptops', kind: 'decision' }),
      ),
      catalogue: () => undefined,
    });
    expect(framed).toEqual({ kind: 'decision', app: 'laptops' });
    const nothing = await readVisitorApp({
      app: 'Not An Address!',
      fetcher: answer(200, {}),
      catalogue: () => undefined,
    });
    expect(nothing.kind).toBe('said');
    if (nothing.kind !== 'said') return;
    expect(nothing.text).toContain('is neither an application');
  });

  it('says when Datalayer cannot be reached', async () => {
    const read = await readVisitorApp({
      app: 'research',
      fetcher: vi.fn(async () => {
        throw new Error('Failed to fetch');
      }) as unknown as typeof fetch,
      catalogue: () => undefined,
    });
    expect(read).toEqual({
      kind: 'said',
      text: 'datalayer-app: Datalayer could not be reached to read "research" (Failed to fetch).',
    });
  });
});
