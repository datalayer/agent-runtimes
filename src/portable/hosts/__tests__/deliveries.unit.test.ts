/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 *
 * @vitest-environment node
 */

/**
 * Deliveries to a host (DC-004): the signed webhook,
 * the outbox poller, and a delivery handled once then acknowledged.
 */

import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deliveryOfOutbox,
  deliverySignature,
  SHARED_SECRET_DELIVERIES_UNTIL,
} from '../contracts';
import {
  DeliveryPoller,
  DeliveryRenewal,
  deliveryRoute,
  receiveDelivery,
  type DeliveryJob,
  type DeliverySecret,
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
  secrets: Record<string, string | DeliverySecret>,
  enqueue: (job: DeliveryJob) => Promise<void>,
  now = timestamp,
): Promise<string> {
  const route = deliveryRoute(
    {
      deliverySecretOf: async hostUid => {
        const kept = secrets[hostUid];
        return typeof kept === 'string' ? { secret: kept } : kept;
      },
    },
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

  it("verifies a push under ai-agents' own key only when it names the key kept", async () => {
    const key = 'ai-agents-host-deliveries-v1';
    const enqueue = vi.fn(async () => undefined);
    // After the window: a keyed registration knows no date.
    const late = SHARED_SECRET_DELIVERIES_UNTIL + 86400;
    const url = await serve({ 'inst-1': { key, secret } }, enqueue, late);
    const keyed = {
      'X-Datalayer-Delivery-Key': key,
      'X-Datalayer-Signature': deliverySignature(secret, late, body),
      'X-Datalayer-Timestamp': String(late),
    };
    expect((await post(`${url}/inst-1`, keyed)).status).toBe(200);
    const { 'X-Datalayer-Delivery-Key': _named, ...unnamed } = keyed;
    expect((await post(`${url}/inst-1`, unnamed)).status).toBe(401);
    expect(
      (
        await post(`${url}/inst-1`, {
          ...keyed,
          'X-Datalayer-Delivery-Key': 'ai-agents-host-deliveries-v2',
        })
      ).status,
    ).toBe(401);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it("accepts a secret of the platform's shared secret until the window ends, never after", async () => {
    const enqueue = vi.fn(async () => undefined);
    const before = SHARED_SECRET_DELIVERIES_UNTIL - 60;
    const sign = (at: number) => ({
      'X-Datalayer-Signature': deliverySignature(secret, at, body),
      'X-Datalayer-Timestamp': String(at),
    });
    let url = await serve({ 'inst-1': secret }, enqueue, before);
    expect((await post(`${url}/inst-1`, sign(before))).status).toBe(200);
    // A keyless registration's push never names a key.
    expect(
      (
        await post(`${url}/inst-1`, {
          ...sign(before),
          'X-Datalayer-Delivery-Key': 'ai-agents-host-deliveries-v1',
        })
      ).status,
    ).toBe(401);
    await new Promise(resolve => server?.close(resolve));
    server = undefined;
    const at = SHARED_SECRET_DELIVERIES_UNTIL;
    url = await serve({ 'inst-1': secret }, enqueue, at);
    expect((await post(`${url}/inst-1`, sign(at))).status).toBe(401);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});

describe('DeliveryRenewal', () => {
  const KEY = 'ai-agents-host-deliveries-v1';
  type Registered = {
    key?: string;
    renew: boolean;
    url: string;
    version: number;
  };
  const setup = (
    delivery: Registered | undefined,
    kept: DeliverySecret | undefined,
  ) => {
    const keep = vi.fn(async () => undefined);
    const setWebhook = vi.fn(async () => ({
      key: KEY,
      signingSecret: 'n'.repeat(64),
      version: 4,
    }));
    const renewal = new DeliveryRenewal(
      {
        boundHosts: async () => [{ hostKey: 'k1', hostUid: 'h1' }],
        deliverySecretOf: async () => kept,
      },
      {
        self: async () =>
          ({ delivery, uid: 'h1' }) as unknown as Awaited<
            ReturnType<DeliveryRenewal['client']['self']>
          >,
        setWebhook,
      },
      keep,
      { warn: vi.fn() },
    );
    return { keep, renewal, setWebhook };
  };
  const URL_ = 'https://slack.example/datalayer/deliveries/h1';

  it('registers again when ai-agents asks, at the address it holds, and keeps the new secret, key and version', async () => {
    const { keep, renewal, setWebhook } = setup(
      { renew: true, url: URL_, version: 1 },
      { secret: 'o'.repeat(64) },
    );
    expect(await renewal.renewOnce()).toBe(1);
    expect(setWebhook).toHaveBeenCalledWith('k1', URL_);
    expect(keep).toHaveBeenCalledWith('h1', {
      key: KEY,
      secret: 'n'.repeat(64),
      version: 4,
    });
  });

  it('registers again when the key or the version kept is not what ai-agents registered', async () => {
    for (const kept of [
      { secret: 'o'.repeat(64) },
      // Two replicas renewed at once and the earlier answer was kept last.
      { key: KEY, secret: 'o'.repeat(64), version: 2 },
    ]) {
      const { keep, renewal } = setup(
        { key: KEY, renew: false, url: URL_, version: 3 },
        kept,
      );
      expect(await renewal.renewOnce()).toBe(1);
      expect(keep).toHaveBeenCalledTimes(1);
    }
  });

  it('leaves alone a current registration, one ai-agents does not ask for, and an installation without a webhook', async () => {
    const cases: Array<[Registered | undefined, DeliverySecret | undefined]> = [
      [
        { key: KEY, renew: false, url: URL_, version: 3 },
        { key: KEY, secret: 's', version: 3 },
      ],
      // ai-agents still signs under the shared secret: nothing to gain.
      [{ renew: false, url: URL_, version: 1 }, { secret: 's' }],
      [undefined, undefined],
    ];
    for (const [delivery, kept] of cases) {
      const { renewal, setWebhook } = setup(delivery, kept);
      expect(await renewal.renewOnce()).toBe(0);
      expect(setWebhook).not.toHaveBeenCalled();
    }
  });

  it('goes on past an installation that fails, and says so', async () => {
    const warn = vi.fn();
    const keep = vi.fn(async () => undefined);
    const renewal = new DeliveryRenewal(
      {
        boundHosts: async () => [
          { hostKey: 'k1', hostUid: 'h1' },
          { hostKey: 'k2', hostUid: 'h2' },
        ],
        deliverySecretOf: async () => ({ secret: 's' }),
      },
      {
        self: async (hostKey: string) => {
          if (hostKey === 'k1') throw new Error('down');
          return {
            delivery: { renew: true, url: URL_, version: 2 },
            uid: 'h2',
          } as never;
        },
        setWebhook: async () => ({ key: KEY, signingSecret: 'n', version: 3 }),
      },
      keep,
      { warn },
    );
    expect(await renewal.renewOnce()).toBe(1);
    expect(keep).toHaveBeenCalledWith('h2', {
      key: KEY,
      secret: 'n',
      version: 3,
    });
    expect(warn).toHaveBeenCalledTimes(1);
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
