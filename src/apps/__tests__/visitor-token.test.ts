/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A visitor's token for the visitors' runtime (LOOP R-30): asked of
 * ai-inference for one application, the tab's visitor kept so that a new
 * token is the same visitor, and a refusal said in ai-inference's sentence.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ensureVisitorAgent,
  fetchVisitorAgent,
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
  url: 'https://r1.datalayer.run/api/loop-visitors/',
  app: 'at:desk',
  inferenceUrl: 'https://r1.datalayer.run',
};
const TOKEN_URL =
  'https://r1.datalayer.run/api/ai-inference/v1/anonymous/token';
const AGENT_URL =
  'https://r1.datalayer.run/api/loop-visitors/api/v1/apps/visitors/agent';

describe("a visitor's agent (STUDIO D-15)", () => {
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
