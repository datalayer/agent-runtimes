/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Datalayer's deliveries to a chat host: the
 * signed webhook ai-agents pushes to, the outbox read when a push was
 * missed, and each delivery handled once then acknowledged. What a delivery
 * shows is the host's own (its `DeliveryHandler`); where its installations
 * and claims are kept is its store, seen here as a `DeliverySink` and a
 * `DeliveryClaimStore`. Moved from the Slack service (DC-004).
 *
 * @module portable/hosts/deliveries
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

import type { DatalayerHostClient } from './client';
import {
  DELIVERY_HEADER,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  verifyDelivery,
  type HostDelivery,
} from './contracts';

/** Where Datalayer pushes an installation's deliveries, under the service's public address. */
export const DELIVERY_PATH = '/datalayer/deliveries';
export const DELIVERY_ROUTE = `${DELIVERY_PATH}/:hostUid`;
const DELIVERY_BODY_LIMIT = 64 * 1024;

export type DeliveryJob = Readonly<{ delivery: HostDelivery; hostUid: string }>;

/** A host installation bound at Datalayer: its uid and key. */
export type BoundHostKey = Readonly<{ hostKey: string; hostUid: string }>;

/** Where a host keeps its installations, as deliveries read them. */
export interface DeliverySink {
  /** What Datalayer signs an installation's pushes with, or `undefined` for an unknown one. */
  deliverySecretOf(hostUid: string): Promise<string | undefined>;
  /** The installation's key, or `undefined` once it was removed (late work is dropped). */
  hostKeyOf(hostUid: string): Promise<string | undefined>;
  /** Every installation bound at Datalayer: whose outbox is read. */
  boundHosts(): Promise<readonly BoundHostKey[]>;
}

/** Where a host keeps what it handled once: a claim taken, or released when handling failed. */
export interface DeliveryClaimStore {
  claimEvent(id: string): Promise<boolean>;
  releaseEvent(id: string): Promise<void>;
}

/**
 * Handle one delivery of an installation once (claimed by its uid), then
 * acknowledge it at Datalayer. A removed installation's delivery is dropped;
 * a handling that fails releases its claim, so the queue tries again.
 */
export async function receiveDelivery(
  job: DeliveryJob,
  input: {
    sink: DeliverySink;
    claims: DeliveryClaimStore;
    client: Pick<DatalayerHostClient, 'acknowledge'>;
    handle: (delivery: HostDelivery) => Promise<void>;
  },
): Promise<void> {
  const hostKey = await input.sink.hostKeyOf(job.hostUid);
  if (!hostKey) {
    return;
  }
  const claim = `delivery:${job.hostUid}:${job.delivery.delivery}`;
  if (await input.claims.claimEvent(claim)) {
    try {
      await input.handle(job.delivery);
    } catch (error) {
      await input.claims.releaseEvent(claim);
      throw error;
    }
  }
  await input.client.acknowledge(hostKey, job.delivery.delivery);
}

async function rawBodyOf(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > DELIVERY_BODY_LIMIT) {
      throw new Error('The delivery is too large.');
    }
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/**
 * The signed webhook Datalayer pushes to (`POST /datalayer/deliveries/{host}`,
 * registered with `PUT …/self/delivery`): verified with that installation's
 * secret — HMAC over `<timestamp>.<body>`, five minutes at most — then queued
 * and acknowledged with 2xx at once; the work runs from the queue.
 */
export function deliveryRoute(
  sink: Pick<DeliverySink, 'deliverySecretOf'>,
  enqueue: (job: DeliveryJob) => Promise<void>,
  nowSeconds?: () => number,
) {
  return async (
    request: IncomingMessage & { params?: Record<string, string | string[]> },
    response: ServerResponse,
  ): Promise<void> => {
    const answer = (status: number, body: Record<string, unknown>) => {
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
    };
    try {
      const named = request.params?.hostUid;
      const hostUid = typeof named === 'string' ? named : '';
      const secret = hostUid ? await sink.deliverySecretOf(hostUid) : undefined;
      if (!secret) {
        return answer(404, { ok: false, error: 'unknown installation' });
      }
      const header = (name: string) => {
        const value = request.headers[name.toLowerCase()];
        return Array.isArray(value) ? value[0] : value;
      };
      const rawBody = await rawBodyOf(request);
      let delivery: HostDelivery;
      try {
        delivery = verifyDelivery({
          nowSeconds: nowSeconds?.(),
          rawBody,
          secret,
          signature: header(SIGNATURE_HEADER),
          timestamp: header(TIMESTAMP_HEADER),
        });
      } catch {
        return answer(401, { ok: false, error: 'not verified' });
      }
      if (
        header(DELIVERY_HEADER) &&
        header(DELIVERY_HEADER) !== delivery.delivery
      ) {
        return answer(400, { ok: false, error: 'delivery mismatch' });
      }
      await enqueue({ delivery, hostUid });
      return answer(200, { ok: true });
    } catch {
      return answer(500, { ok: false });
    }
  };
}

/**
 * The outbox, read when a push was missed or no address is registered
 * (`GET …/self/deliveries`): each delivery of every bound installation
 * queued, handled once, then acknowledged.
 */
export class DeliveryPoller {
  #timer?: ReturnType<typeof setInterval>;
  #running = false;

  constructor(
    readonly sink: Pick<DeliverySink, 'boundHosts'>,
    readonly client: Pick<DatalayerHostClient, 'outbox'>,
    readonly enqueue: (job: DeliveryJob) => Promise<void>,
    readonly logger: Pick<Console, 'warn'> = console,
  ) {}

  async pollOnce(): Promise<number> {
    let queued = 0;
    for (const { hostKey, hostUid } of await this.sink.boundHosts()) {
      try {
        for (const delivery of await this.client.outbox(hostKey)) {
          await this.enqueue({ delivery, hostUid });
          queued += 1;
        }
      } catch (error) {
        this.logger.warn(
          `The outbox of one installation was not read: ${(error as Error).message}`,
        );
      }
    }
    return queued;
  }

  start(intervalSeconds: number): void {
    if (intervalSeconds <= 0 || this.#timer) {
      return;
    }
    this.#timer = setInterval(() => {
      if (this.#running) {
        return;
      }
      this.#running = true;
      void this.pollOnce().finally(() => {
        this.#running = false;
      });
    }, intervalSeconds * 1000);
    (this.#timer as { unref?: () => void }).unref?.();
  }

  stop(): void {
    if (this.#timer) {
      clearInterval(this.#timer);
    }
    this.#timer = undefined;
  }
}
