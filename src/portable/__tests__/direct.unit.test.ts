/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A Direct Conversation (M-038, P-08): one-use ticket,
 * then the words; replies read from the cursor, never by sending again; lines
 * said apart by who wrote them; closed by the company, nothing more sent.
 *
 * @module portable/__tests__/direct
 */

import { describe, expect, it, vi } from 'vitest';
import {
  DIRECT_WORDS,
  directAuthor,
  directClient,
  openDirect,
  withDirectAnswer,
} from '..';

const TARGET = {
  appUid: 'app-1',
  company: 'shop.example',
  conversationId: 'conv_1',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe('a Direct Conversation (M-038)', () => {
  it('asks a one-use ticket, sends the words with it, and reads replies from the cursor', async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/iam/v1/pap/my/direct'))
        return json({ ticket: 'tk-1' });
      if (init?.method === 'POST') {
        return json({
          direct_conversation: 'dc_1',
          replies: [{ text: 'Sam here.', from: 'human', name: 'Sam' }],
          status: 'working',
          responder: 'human',
          cursor: 'c1',
        });
      }
      return json({
        direct_conversation: 'dc_1',
        replies: [],
        status: 'closed',
        cursor: 'c2',
      });
    });
    const client = directClient({
      iamUrl: 'https://iam.test/',
      gatewayUrl: 'https://gw.test',
      getAccessToken: () => 'tok',
      fetch: fetcher as never,
    });
    let open = openDirect(TARGET);
    open = withDirectAnswer(
      open,
      await client.send(open.target, '  Where is my parcel?  '),
      '  Where is my parcel?  ',
    );
    expect(open.lines.map(line => [directAuthor(line), line.text])).toEqual([
      ['You', 'Where is my parcel?'],
      // Who wrote it at the company, by name (`author.name`, PAP draft 0.3).
      ['One of its people (Sam)', 'Sam here.'],
    ]);
    expect((fetcher.mock.calls[1] as unknown[])[0]).toBe(
      'https://gw.test/api/mcp/v1/pap/direct',
    );
    expect(
      JSON.parse(String((fetcher.mock.calls[1][1] as RequestInit).body)),
    ).toEqual({ ticket: 'tk-1', text: 'Where is my parcel?' });
    // Read from the cursor: nothing sent again; closed by the company.
    open = withDirectAnswer(open, await client.read(open.target, open.cursor));
    expect(String((fetcher.mock.calls[2] as unknown[])[0])).toBe(
      'https://gw.test/api/mcp/v1/pap/direct?app_uid=app-1&company=shop.example&conversation_id=dc_1&cursor=c1',
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(open.closed).toBe(true);
  });

  it('refuses before anything is sent, and says a refusal in the gateway’s sentence', async () => {
    const none = directClient({
      iamUrl: 'https://iam.test',
      gatewayUrl: 'https://gw.test',
      getAccessToken: () => undefined,
      fetch: vi.fn() as never,
    });
    await expect(none.send(TARGET, 'x')).rejects.toThrow(DIRECT_WORDS.signIn);
    await expect(none.send(TARGET, '   ')).rejects.toThrow(DIRECT_WORDS.empty);
    await expect(none.send(TARGET, 'x'.repeat(4001))).rejects.toThrow(
      DIRECT_WORDS.tooLong,
    );
    const closed = directClient({
      iamUrl: 'https://iam.test',
      gatewayUrl: 'https://gw.test',
      getAccessToken: () => 'tok',
      fetch: vi.fn(async (url: string) =>
        url.includes('/iam/')
          ? json({ ticket: 't' })
          : json({ note: 'The company closed this conversation.' }, 409),
      ) as never,
    });
    await expect(closed.send(TARGET, 'Hello')).rejects.toThrow(
      'The company closed this conversation.',
    );
    const unread = directClient({
      iamUrl: 'https://iam.test',
      gatewayUrl: 'https://gw.test',
      getAccessToken: () => 'tok',
      fetch: vi.fn(async () => json({ replies: 'x' })) as never,
    });
    await expect(unread.read(TARGET)).rejects.toThrow(
      "shop.example's answer could not be read.",
    );
  });
});
