/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A mediated sign-in's form (M-039): read with the page's one-use
 * ticket, sent once, nothing typed in an error.
 *
 * @module portable/__tests__/protectedInput
 */

import { describe, expect, it, vi } from 'vitest';
import { protectedInputClient, ProtectedRequestGone, ticketOfPage } from '..';

const ASKED = {
  company_name: 'Manzanita',
  company_domain: 'shop.example',
  purpose: 'credentials',
  expires_at: '2026-10-15T10:00:00Z',
  fields: [
    { name: 'username', label: 'Name', secret: false },
    { name: 'password', label: 'Password', secret: true },
  ],
};

describe('a mediated sign-in (M-039)', () => {
  it('reads the request by the page’s ticket and sends what was typed once', async () => {
    const ticket = ticketOfPage(
      'https://datalayer.ai/pap/sign-in?ticket=Abc_def-0123456789xyz',
    );
    expect(ticket).toBe('Abc_def-0123456789xyz');
    expect(ticketOfPage('https://datalayer.ai/pap/sign-in')).toBe('');
    const fetcher = vi.fn(
      async (_url: string, init?: RequestInit) =>
        new Response(
          JSON.stringify(init?.method === 'POST' ? { kept: true } : ASKED),
        ),
    );
    const client = protectedInputClient({
      iamUrl: 'https://run.test/',
      getAccessToken: () => 'tok',
      fetch: fetcher as never,
    });
    const request = await client.read(ticket);
    expect(request.fields.map(field => field.secret)).toEqual([false, true]);
    await client.send(ticket, request, { username: 'ada', password: 'p w' });
    expect((fetcher.mock.calls[1] as unknown[])[0]).toBe(
      'https://run.test/api/iam/v1/pap/my/protected/Abc_def-0123456789xyz',
    );
    expect(
      JSON.parse(String((fetcher.mock.calls[1][1] as RequestInit).body)),
    ).toEqual({ values: { username: 'ada', password: 'p w' } });
    await expect(
      client.send(ticket, request, { username: 'ada', password: '' }),
    ).rejects.toThrow('Fill in every field.');
    const gone = protectedInputClient({
      iamUrl: 'https://run.test',
      getAccessToken: () => 'tok',
      fetch: vi.fn(async () => new Response('{}', { status: 404 })) as never,
    });
    await expect(gone.read(ticket)).rejects.toBeInstanceOf(
      ProtectedRequestGone,
    );
  });
});
