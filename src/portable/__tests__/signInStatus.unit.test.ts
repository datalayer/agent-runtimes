/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * How a sign-in stands, for the person's own client (MOBILE M-039): accepted
 * only bound to the application, the company and a verified issuer.
 *
 * @module portable/__tests__/signInStatus
 */

import { describe, expect, it, vi } from 'vitest';
import { signInStandsOf, signInStatusClient } from '..';

const SAID = {
  app_uid: 'app-1',
  company: 'shop.example',
  issuer: 'https://shop.example',
  status: 'signed_in',
};

describe('how a sign-in stands (M-039)', () => {
  it('binds the answer to the application, the company and a verified issuer', () => {
    const expected = { appUid: 'app-1', company: 'Shop.Example' };
    expect(signInStandsOf(SAID, expected)).toMatchObject({
      status: 'signed_in',
      issuer: 'https://shop.example',
    });
    expect(signInStandsOf({ ...SAID, app_uid: 'app-2' }, expected)).toBeNull();
    expect(
      signInStandsOf({ ...SAID, company: 'other.example' }, expected),
    ).toBeNull();
    expect(
      signInStandsOf({ ...SAID, issuer: 'http://shop.example' }, expected),
    ).toBeNull();
    expect(
      signInStandsOf({ ...SAID, status: 'teleported' }, expected)!.status,
    ).toBe('other');
  });

  it('asks the gateway with the person’s own sign-in, and says none under way as null', async () => {
    const fetcher = vi.fn(async (url: string) =>
      url.includes('app-1')
        ? new Response(JSON.stringify(SAID))
        : new Response('{}', { status: 404 }),
    );
    const ask = signInStatusClient({
      baseUrl: 'https://run.test/',
      getAccessToken: () => 'tok',
      fetch: fetcher as never,
    });
    expect(await ask('app-1', 'shop.example')).toMatchObject({
      status: 'signed_in',
    });
    expect((fetcher.mock.calls[0] as unknown[])[0]).toBe(
      'https://run.test/api/mcp/v1/pap/sign-in?app_uid=app-1&company=shop.example',
    );
    expect(await ask('app-9', 'shop.example')).toBeNull();
    const signedOut = signInStatusClient({
      baseUrl: 'https://run.test',
      getAccessToken: () => undefined,
      fetch: fetcher as never,
    });
    expect(await signedOut('app-1', 'shop.example')).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
