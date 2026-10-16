/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 *
 * @vitest-environment node
 */

/**
 * Deliveries to a host (plans/DISCORD.md DC-004, §3.8): the signed webhook,
 * the outbox poller, and a delivery handled once then acknowledged.
 */

import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deliveryOfOutbox } from '../contracts';
import {
  DeliveryPoller,
  deliveryRoute,
  receiveDelivery,
  type DeliveryJob,
} from '../deliveries';

const contracts = JSON.parse(
  readFileSync(join(__dirname, '..', 'contracts.json'), 'utf8'),
) as {
  delivery: {
    signing: {
      body: string;
      secret: string;
      signature: string;
      timestamp: number;
    };
  };
};
const { body, secret, signature, timestamp } = contracts.delivery.signing;

let server: Server | undefined;
afterEach(async () => {
  const running = server;
  server = undefined;
  if (running) await new Promise(resolve => running.close(resolve));
});

async function serve(
  secrets: Record<string, string>,
  enqueue: (job: DeliveryJob) => Promise<void>,
  now = timestamp,
): Promise<string> {
  const route = deliveryRoute(
    { deliverySecretOf: async hostUid => secrets[hostUid] },
    enqueue,
    () => now,
  );
  server = createServer((request, response) => {
    const hostUid = (request.url ?? '').split('/').pop() ?? '';
    void route(Object.assign(request, { params: { hostUid } }), response);
  });
  await new Promise<void>(resolve => server?.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server?.address() as AddressInfo).port}/datalayer/deliveries`;
}

const post = (url: string, headers: Record<string, string>, raw = body) =>
  fetch(url, { body: raw, headers, method: 'POST' });

describe('deliveryRoute', () => {
  const signed = {
    'X-Datalayer-Signature': signature,
    'X-Datalayer-Timestamp': String(timestamp),
  };

  it('queues a verified delivery and answers 200 at once', async () => {
    const enqueue = vi.fn(async () => undefined);
    const url = await serve({ 'inst-1': secret }, enqueue);
    const answer = await post(`${url}/inst-1`, signed);
    expect(answer.status).toBe(200);
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ hostUid: 'inst-1' }),
    );
  });

  it('refuses an unknown installation, a forged or stale push, and a mismatched delivery id', async () => {
    const enqueue = vi.fn(async () => undefined);
    const url = await serve({ 'inst-1': secret }, enqueue);
    expect((await post(`${url}/inst-2`, signed)).status).toBe(404);
    expect(
      (await post(`${url}/inst-1`, signed, body.replace('ap-1', 'ap-2')))
        .status,
    ).toBe(401);
    expect(
      (
        await post(`${url}/inst-1`, {
          ...signed,
          'X-Datalayer-Timestamp': String(timestamp - 3600),
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await post(`${url}/inst-1`, {
          ...signed,
          'X-Datalayer-Delivery': 'another',
        })
      ).status,
    ).toBe(400);
    expect(enqueue).not.toHaveBeenCalled();
  });
});

const delivery = deliveryOfOutbox({
  uid: 'dl-1',
  event: 'turn.completed',
  payload: {
    record_entry: 'r1',
    session_uid: 'S1',
    deployment_uid: 'dep-1',
    target: {},
  },
  state: 'pending',
});

describe('receiveDelivery', () => {
  const claims = () => {
    const taken = new Set<string>();
    return {
      claimEvent: vi.fn(
        async (id: string) => !taken.has(id) && !!taken.add(id),
      ),
      releaseEvent: vi.fn(async (id: string) => void taken.delete(id)),
    };
  };
  const sink = (hostKey?: string) => ({
    boundHosts: async () => [],
    deliverySecretOf: async () => undefined,
    hostKeyOf: async () => hostKey,
  });

  it('handles a delivery once, acknowledging it every time', async () => {
    const handle = vi.fn(async () => undefined);
    const acknowledge = vi.fn(async () => undefined);
    const input = {
      claims: claims(),
      client: { acknowledge },
      handle,
      sink: sink('dlhk_k'),
    };
    await receiveDelivery({ delivery, hostUid: 'inst-1' }, input);
    await receiveDelivery({ delivery, hostUid: 'inst-1' }, input);
    expect(handle).toHaveBeenCalledTimes(1);
    expect(acknowledge).toHaveBeenCalledTimes(2);
    expect(acknowledge).toHaveBeenCalledWith('dlhk_k', 'dl-1');
  });

  it('releases the claim when handling fails, and drops a removed installation', async () => {
    const input = {
      claims: claims(),
      client: { acknowledge: vi.fn(async () => undefined) },
      handle: vi.fn(async () => {
        throw new Error('the host refused');
      }),
      sink: sink('dlhk_k'),
    };
    await expect(
      receiveDelivery({ delivery, hostUid: 'inst-1' }, input),
    ).rejects.toThrow('the host refused');
    expect(input.claims.releaseEvent).toHaveBeenCalledWith(
      'delivery:inst-1:dl-1',
    );
    expect(input.client.acknowledge).not.toHaveBeenCalled();
    const removed = {
      ...input,
      handle: vi.fn(async () => undefined),
      sink: sink(),
    };
    await receiveDelivery({ delivery, hostUid: 'inst-1' }, removed);
    expect(removed.handle).not.toHaveBeenCalled();
  });
});

describe('DeliveryPoller', () => {
  it("queues every bound installation's outbox, and goes on past one that fails", async () => {
    const enqueue = vi.fn(async () => undefined);
    const warn = vi.fn();
    const poller = new DeliveryPoller(
      {
        boundHosts: async () => [
          { hostKey: 'k1', hostUid: 'h1' },
          { hostKey: 'k2', hostUid: 'h2' },
        ],
      },
      {
        outbox: async (hostKey: string) => {
          if (hostKey === 'k1') throw new Error('down');
          return [delivery];
        },
      },
      enqueue,
      { warn },
    );
    expect(await poller.pollOnce()).toBe(1);
    expect(enqueue).toHaveBeenCalledWith({ delivery, hostUid: 'h2' });
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
