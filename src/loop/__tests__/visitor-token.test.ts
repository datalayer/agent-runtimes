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
  fetchVisitorToken,
  isVisitorId,
  keptVisitorId,
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
