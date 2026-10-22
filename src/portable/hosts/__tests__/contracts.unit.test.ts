/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 *
 * @vitest-environment node
 */

/**
 * The host contracts, against the same file ai-agents tests its half with
 * (services/ai-agents/tests/fixtures/hosts/contracts.json): a change on
 * either side that breaks the other fails here or there. Ported from the
 * Slack service (DC-004).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  deliveryOfOutbox,
  deliverySignature,
  DELIVERY_HEADER,
  HOST_KEY_HEADER,
  hostMayDecide,
  IDEMPOTENCY_HEADER,
  presentationSchema,
  PRESENTATION_VERSION,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  verifyDelivery,
} from '../contracts';

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
  headers: Record<string, string>;
  presentation: { example: unknown; version: number };
  exchange: { place_kinds: string[] };
  external_turn: { provenance_limit_bytes: number };
  whatsapp: {
    waba_id: string;
    phone_number_id: string;
    bind_request: { external_id: string };
    external_user_id: string;
    direct: { place: { kind: string; id: string } };
    group: { id: string; place: { kind: string; id: string } };
    provenance: {
      host_kind: string;
      place: { kind: string; id: string };
      message_id: string;
    };
    target: Record<string, string>;
  };
};

describe('Datalayer host contracts', () => {
  it('names the headers ai-agents and the session API read', () => {
    expect(contracts.headers).toMatchObject({
      delivery: DELIVERY_HEADER,
      host_key: HOST_KEY_HEADER,
      idempotency_key: IDEMPOTENCY_HEADER,
      signature: SIGNATURE_HEADER,
      timestamp: TIMESTAMP_HEADER,
    });
  });

  it('signs and verifies a delivery as ai-agents does, its target opaque', () => {
    const { body, secret, signature, timestamp } = contracts.delivery.signing;
    expect(deliverySignature(secret, timestamp, body)).toBe(signature);
    const delivery = verifyDelivery({
      nowSeconds: timestamp + 10,
      rawBody: body,
      secret,
      signature,
      timestamp: String(timestamp),
    });
    expect(delivery.event).toBe('approval.requested');
    expect(delivery.payload.target).toEqual({
      channel: 'C0',
      thread_ts: '1700000000.000001',
    });
  });

  it('refuses a tampered, foreign, replayed or future delivery', () => {
    const { body, secret, signature, timestamp } = contracts.delivery.signing;
    const base = {
      nowSeconds: timestamp,
      rawBody: body,
      secret,
      signature,
      timestamp: String(timestamp),
    };
    expect(() =>
      verifyDelivery({ ...base, rawBody: body.replace('ap-1', 'ap-2') }),
    ).toThrow(/signature/);
    expect(() => verifyDelivery({ ...base, secret: 'another' })).toThrow(
      /signature/,
    );
    expect(() =>
      verifyDelivery({ ...base, nowSeconds: timestamp + 3600 }),
    ).toThrow(/too old/);
    expect(() =>
      verifyDelivery({ ...base, nowSeconds: timestamp - 3600 }),
    ).toThrow(/too old/);
    expect(() => verifyDelivery({ ...base, timestamp: undefined })).toThrow(
      /missing/,
    );
  });

  it('offers a decision only when the server says a host may', () => {
    expect(contracts.presentation.version).toBe(PRESENTATION_VERSION);
    const shown = presentationSchema.parse(contracts.presentation.example);
    expect(hostMayDecide(shown)).toBe(true);
    expect(hostMayDecide({ ...shown, host_may_decide: false })).toBe(false);
    expect(hostMayDecide({ ...shown, complete: false })).toBe(false);
    expect(hostMayDecide({ ...shown, secret_fields: ['/token'] })).toBe(false);
    expect(hostMayDecide({ ...shown, version: 2 })).toBe(false);
    expect(hostMayDecide({ ...shown, status: 'approved' })).toBe(false);
  });

  it('reads an outbox item as the delivery a push would carry, and refuses an unknown event', () => {
    const delivery = deliveryOfOutbox({
      uid: 'dl-1',
      event: 'turn.completed',
      payload: {
        record_entry: 'r1',
        session_uid: 'S1',
        deployment_uid: 'dep-1',
        target: { anything: 'the host gave' },
      },
      state: 'pending',
    });
    expect(delivery).toMatchObject({
      delivery: 'dl-1',
      event: 'turn.completed',
    });
    expect(() =>
      deliveryOfOutbox({
        uid: 'dl-2',
        event: 'turn.started',
        payload: {},
        state: 'pending',
      }),
    ).toThrow();
  });

  it("holds WhatsApp's forms: one number, a BSUID never a phone number, a chat direct and a group a channel", () => {
    const whatsapp = contracts.whatsapp;
    expect(whatsapp.bind_request.external_id).toBe(
      `${whatsapp.waba_id}:${whatsapp.phone_number_id}`,
    );
    expect(whatsapp.external_user_id).toMatch(/^[A-Z]{2}\.[\x21-\x7e]+$/);
    expect(contracts.exchange.place_kinds).toContain(
      whatsapp.direct.place.kind,
    );
    expect(whatsapp.direct.place).toEqual({
      kind: 'direct',
      id: whatsapp.external_user_id,
    });
    expect(whatsapp.group.place).toEqual({
      kind: 'channel',
      id: whatsapp.group.id,
    });
    expect(whatsapp.provenance.host_kind).toBe('whatsapp');
    expect(whatsapp.provenance.message_id).toMatch(/^wamid\./);
    expect(
      Buffer.byteLength(JSON.stringify(whatsapp.provenance)),
    ).toBeLessThanOrEqual(contracts.external_turn.provenance_limit_bytes);
    expect(whatsapp.target).toEqual({
      phoneNumberId: whatsapp.phone_number_id,
      userId: whatsapp.external_user_id,
    });
  });
});
