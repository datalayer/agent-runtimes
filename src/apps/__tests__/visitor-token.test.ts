/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A visitor's token for the visitors' runtime (R-30): asked of
 * ai-inference for one application, the tab's visitor kept so that a new
 * token is the same visitor, and a refusal said in ai-inference's sentence.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ensureVisitorAgent,
  fetchBattleToken,
  fetchVisitorAgent,
  VisitorRuntimeUnreachable,
  visitorRetrySeconds,
  fetchVisitorToken,
  isVisitorId,
  keptVisitorId,
  visitorAgentOf,
  visitorTokenRequest,
} from '../apps/visitorToken';

function answer(status: number, body: unknown): typeof fetch {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  ) as unknown as typeof fetch;
}

afterEach(() => {
  window.sessionStorage.clear();
});

describe('a visitor token', () => {
  it('names the application, and the visitor once there is one', () => {
    expect(visitorTokenRequest('web-research', '')).toEqual({
      app: 'web-research',
    });
    expect(visitorTokenRequest('at:desk', 'tab-0001-visitor')).toEqual({
      app: 'at:desk',
      visitor: 'tab-0001-visitor',
    });
    expect(isVisitorId('short')).toBe(false);
  });

  it('keeps the visitor ai-inference made, for the next token', async () => {
    const fetcher = answer(200, {
      token: 'visitor-token',
      visitor: 'made-by-ai-inference-01',
      expires_in: 300,
    });
    const minted = await fetchVisitorToken(
      'https://prod1.datalayer.run/',
      'web-research',
      '',
      fetcher,
    );
    expect(minted.token).toBe('visitor-token');
    expect(keptVisitorId()).toBe('made-by-ai-inference-01');
    const [url, init] = (fetcher as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://prod1.datalayer.run/api/ai-inference/v1/anonymous/token',
    );
    expect(JSON.parse(String(init.body))).toEqual({ app: 'web-research' });
    // Renewed before it runs out.
    expect(minted.renewAt - Date.now()).toBeLessThan(300_000);
  });

  it("says ai-inference's sentence when it refuses", async () => {
    await expect(
      fetchVisitorToken(
        'https://prod1.datalayer.run',
        'web-research',
        'no',
        answer(422, {
          detail: "A visitor's id is 8 to 64 letters, digits or dashes.",
        }),
      ),
    ).rejects.toThrow("A visitor's id is 8 to 64 letters, digits or dashes.");
  });
});

describe("a Battle's token (B4-01)", () => {
  const bodyOf = (fetcher: typeof fetch) =>
    JSON.parse(
      String(
        (
          (fetcher as unknown as { mock: { calls: unknown[][] } }).mock
            .calls[0] as [string, RequestInit]
        )[1].body,
      ),
    );

  it('names the Battle beside the application and the visitor', () => {
    expect(
      visitorTokenRequest('accounting', 'tab-0001-visitor', 'invoice-race'),
    ).toEqual({
      app: 'accounting',
      visitor: 'tab-0001-visitor',
      battle: 'invoice-race',
    });
    expect(visitorTokenRequest('', '', 'pong')).toEqual({ battle: 'pong' });
  });

  it("mints one play's token, its life read off the token", async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = btoa(JSON.stringify({ iat: now, exp: now + 300 }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const fetcher = answer(200, {
      token: `h.${payload}.s`,
      visitor: 'made-by-ai-inference-02',
      battle: 'pong',
      budget: 200,
      expires_in: 299,
    });
    const minted = await fetchBattleToken(
      'https://r1.test',
      'pong',
      '',
      fetcher,
    );
    expect(bodyOf(fetcher)).toEqual({ battle: 'pong' });
    expect(minted.visitor).toBe('made-by-ai-inference-02');
    expect(minted.lifetimeMs).toBe(300_000);
    expect(minted.expiresAt - Date.now()).toBeGreaterThan(290_000);
  });

  it('a member keeps renewing its token for the Battle', async () => {
    const fetcher = answer(200, {
      token: 't',
      visitor: 'tab-0002-visitor',
      expires_in: 300,
    });
    await fetchVisitorToken(
      'https://r1.test',
      'accounting',
      'tab-0002-visitor',
      fetcher,
      'invoice-race',
    );
    expect(bodyOf(fetcher)).toEqual({
      app: 'accounting',
      visitor: 'tab-0002-visitor',
      battle: 'invoice-race',
    });
  });

  it("refuses a mint for no Battle, and says ai-inference's refusal", async () => {
    await expect(
      fetchBattleToken('https://r1.test', '', '', answer(200, {})),
    ).rejects.toThrow('for a Battle');
    await expect(
      fetchBattleToken(
        'https://r1.test',
        'Pong',
        '',
        answer(422, {
          detail: 'A token is played for a Battle of the catalogue, by its id.',
        }),
      ),
    ).rejects.toThrow('by its id');
  });
});

/** Answers each URL its own way, in the order asked. */
function answers(
  byUrl: Record<string, [number, unknown]>,
): typeof fetch & { mock: { calls: unknown[][] } } {
  return vi.fn(async (url: string) => {
    const [status, body] = byUrl[url] ?? [404, { detail: `no ${url}` }];
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch & { mock: { calls: unknown[][] } };
}

const VISITORS = {
  url: 'https://r1.datalayer.run/api/runtime-visitors/',
  app: 'at:desk',
  inferenceUrl: 'https://r1.datalayer.run',
};
const TOKEN_URL =
  'https://r1.datalayer.run/api/ai-inference/v1/anonymous/token';
const AGENT_URL =
  'https://r1.datalayer.run/api/runtime-visitors/api/v1/apps/visitors/agent';

describe("a visitor's agent (D-15)", () => {
  it('is the one the runtime names: an example by its id, an address by at-<slug>', () => {
    expect(visitorAgentOf('web-research')).toBe('web-research');
    expect(visitorAgentOf('at:d15-visitors')).toBe('at-d15-visitors');
    expect(() => visitorAgentOf('at:')).toThrow('is no application’s address');
  });

  it('is asked of the visitors’ runtime with the visitor’s token', async () => {
    const fetcher = answers({
      [AGENT_URL]: [200, { agent: 'at-desk', app_id: 'helpdesk' }],
    });
    expect(
      await fetchVisitorAgent(VISITORS.url, 'visitor-token', fetcher),
    ).toEqual({ agent: 'at-desk', appId: 'helpdesk' });
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(AGENT_URL);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ Authorization: 'Bearer visitor-token' });
  });

  it("says the runtime's sentence when it refuses", async () => {
    await expect(
      fetchVisitorAgent(
        VISITORS.url,
        'visitor-token',
        answers({
          [AGENT_URL]: [401, { detail: 'Without an account it is not run.' }],
        }),
      ),
    ).rejects.toThrow('Without an account it is not run.');
  });

  it('says a network failure or a 5xx as unreachable, to be tried again, and a refusal not', async () => {
    const failed = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    const network = fetchVisitorAgent(VISITORS.url, 'visitor-token', failed);
    await expect(network).rejects.toBeInstanceOf(VisitorRuntimeUnreachable);
    await expect(network).rejects.toThrow(
      'The visitors’ runtime could not be reached (Failed to fetch).',
    );
    await expect(
      fetchVisitorAgent(
        VISITORS.url,
        'visitor-token',
        answers({ [AGENT_URL]: [502, {}] }),
      ),
    ).rejects.toBeInstanceOf(VisitorRuntimeUnreachable);
    await expect(
      ensureVisitorAgent(VISITORS, 'helpdesk', failed),
    ).rejects.toBeInstanceOf(VisitorRuntimeUnreachable);
    await expect(
      fetchVisitorAgent(
        VISITORS.url,
        'visitor-token',
        answers({ [AGENT_URL]: [401, { detail: 'Not run.' }] }),
      ),
    ).rejects.not.toBeInstanceOf(VisitorRuntimeUnreachable);
    expect([1, 2, 3, 4, 5, 9].map(visitorRetrySeconds)).toEqual([
      2, 4, 8, 16, 30, 30,
    ]);
  });

  it('is made before the page follows it, and checked to run the application drawn', async () => {
    const fetcher = answers({
      [TOKEN_URL]: [200, { token: 'visitor-token', expires_in: 300 }],
      [AGENT_URL]: [200, { agent: 'at-desk', app_id: 'helpdesk' }],
    });
    expect(await ensureVisitorAgent(VISITORS, 'helpdesk', fetcher)).toEqual({
      agent: 'at-desk',
      appId: 'helpdesk',
    });
    expect(fetcher.mock.calls.map(call => call[0])).toEqual([
      TOKEN_URL,
      AGENT_URL,
    ]);
    await expect(
      ensureVisitorAgent(VISITORS, 'another-app', fetcher),
    ).rejects.toThrow('not another-app as at-desk');
  });
});
