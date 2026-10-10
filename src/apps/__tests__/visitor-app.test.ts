/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A public application in the element, for a visitor without an account
 * (STUDIO D-07, R-30): an example kept warm or an address open to visitors
 * run on the visitors' runtime with a visitor's token for it; a decision
 * framed; a private address, one that reaches its owner's connections, or
 * an example not kept, said in one sentence naming the embed token.
 */

import { describe, expect, it, vi } from 'vitest';
import { emptyAppspec } from '../apps/appspec';
import {
  AT_PREFIX,
  DEFAULT_API,
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
    ...extra,
  };
}

describe('a visitor’s application', () => {
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
