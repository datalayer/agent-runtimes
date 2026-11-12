/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

/**
 * The generic Datalayer host contracts, as ai-agents answers them, for every chat host (Slack, Discord, WhatsApp).
 * These shapes are shared with ai-agents through `contracts.json`, beside
 * this file and byte-identical to ai-agents' `tests/fixtures/hosts/`, which
 * both sides test. A delivery's `target` stays opaque here: each host
 * validates its own.
 *
 * @module portable/hosts/contracts
 */

export const HOST_KEY_HEADER = 'X-Datalayer-Host-Key';
export const SIGNATURE_HEADER = 'X-Datalayer-Signature';
export const TIMESTAMP_HEADER = 'X-Datalayer-Timestamp';
export const DELIVERY_HEADER = 'X-Datalayer-Delivery';
/**
 * The version of ai-agents' own key a push was signed under
 * (`ai-agents-host-deliveries-v<N>`), the `key` its registration was
 * answered. Absent on a webhook registered under the platform's shared
 * secret, which is refused after {@link SHARED_SECRET_DELIVERIES_UNTIL}.
 */
export const DELIVERY_KEY_HEADER = 'X-Datalayer-Delivery-Key';
export const DELIVERY_KEY_PATTERN = /^ai-agents-host-deliveries-v\d+$/;
/**
 * The end of the platform's HS256 window (31 December 2026, 00:00 UTC):
 * from then on a push without a `key` is refused, and ai-agents holds such a
 * registration's pushes in the outbox until its host registers again.
 */
export const SHARED_SECRET_DELIVERIES_UNTIL =
  Date.parse('2026-12-31T00:00:00Z') / 1000;
export const IDEMPOTENCY_HEADER = 'Idempotency-Key';

/** The presentation version the hosts render; another is reviewed in Datalayer. */
export const PRESENTATION_VERSION = 1;

export const bindSchema = z.object({
  host: z
    .object({
      uid: z.string().min(1),
      state: z.string(),
      name: z.string().optional(),
      default_deployment: z.string().optional(),
    })
    .loose(),
  host_key: z.string().startsWith('dlhk_'),
});

/** What a link code is redeemed at: the landing's confirm page. */
export const LINK_PAGE_PATH = '/hosts/link';

/**
 * `GET /apps/hosts/self`: the installation with its allowed deployments.
 * `channels`, `direct_only` and `paused` are the installation's channel
 * policy and pause (S-104, S-105, S-403).
 */
export const selfSchema = z.object({
  host: z
    .object({
      uid: z.string().min(1),
      account_uid: z.string().optional(),
      default_deployment: z.string().optional(),
      deployments: z.array(
        z
          .object({
            uid: z.string().min(1),
            app_name: z.string().optional(),
            kept: z.boolean().optional(),
          })
          .loose(),
      ),
      channels: z
        .array(
          z.object({
            id: z.string().min(1),
            state: z.enum(['allow', 'deny']),
            deployment: z.string().optional(),
          }),
        )
        .optional(),
      direct_only: z.array(z.string()).optional(),
      paused: z.boolean().optional(),
      /**
       * The registered webhook: `renew` when ai-agents asks it registered
       * again (its secret rests on a key ai-agents no longer signs with).
       */
      delivery: z
        .object({
          url: z.string().optional(),
          version: z.number().int().optional(),
          key: z.string().optional(),
          renew: z.boolean().optional(),
        })
        .loose()
        .optional(),
    })
    .loose(),
});

/** `POST /apps/hosts/handoffs`: a one-use code that opens one session or approval (S-305). */
export const handoffSchema = z.object({
  code: z.string().startsWith('dlho_'),
  expires_in: z.number().int().nonnegative(),
  path: z.string().startsWith('/hosts/open?code='),
});

export const linkStateSchema = z.object({
  linked: z.boolean(),
  principal_uid: z.string().optional(),
});

export const webhookSchema = z.object({
  url: z.url(),
  events: z.array(z.string()),
  version: z.number().int(),
  signing_secret: z.string().min(32),
  /** The version of ai-agents' key the secret is derived under; absent: the shared secret. */
  key: z.string().regex(DELIVERY_KEY_PATTERN).optional(),
});

/** One delivery of the outbox, as `GET …/self/deliveries` lists it. */
export const outboxItemSchema = z
  .object({
    uid: z.string().min(1),
    event: z.string(),
    payload: z.record(z.string(), z.unknown()),
    state: z.string(),
  })
  .loose();

export const decisionSchema = z.object({
  approval: z
    .object({ id: z.string().nullable().optional(), status: z.string() })
    .loose(),
});

export const linkCodeSchema = z.object({
  code: z.string().startsWith('dlhc_'),
  expires_in: z.number().int().nonnegative(),
  confirm: z.string(),
});

export const exchangeSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.literal('Bearer'),
  expires_in: z.number().int().nonnegative(),
  exp: z.number().int(),
  principal_uid: z.string().min(1),
  /** A person who never linked, answered as a visitor (WHATSAPP WA-03): `principal_uid` is `visitor:<hash>`. */
  visitor: z.boolean().optional(),
  host_uid: z.string().min(1),
  deployment: z.object({
    uid: z.string().min(1),
    app_uid: z.string(),
    app_name: z.string(),
    version: z.number().int(),
  }),
  session_api: z.object({ url: z.url(), agent: z.string() }),
  user_token: z.string().optional(),
});
export type HostExchange = z.infer<typeof exchangeSchema>;

const fieldSchema = z.object({
  name: z.string(),
  label: z.string(),
  value: z.string(),
});

export const presentationSchema = z.object({
  version: z.number().int(),
  approval_id: z.string().min(1),
  status: z.string(),
  owner_uid: z.string(),
  tool_name: z.string(),
  action_class: z.enum([
    'read',
    'send',
    'write',
    'execute',
    'publish',
    'delete',
    'financial',
    'unknown',
  ]),
  session_uid: z.string(),
  created_at: z.string().nullable().optional(),
  expires_at: z.string().nullable().optional(),
  fields: z.array(fieldSchema),
  arguments: z.record(z.string(), z.unknown()),
  secret_fields: z.array(z.string()),
  complete: z.boolean(),
  host_may_decide: z.boolean(),
  reasons: z.array(z.string()),
  digest: z.string().regex(/^[0-9a-f]{64}$/),
});
export type ApprovalPresentation = z.infer<typeof presentationSchema>;

export const deliverySchema = z.discriminatedUnion('event', [
  z.object({
    delivery: z.string().min(1),
    event: z.literal('approval.requested'),
    payload: z
      .object({
        approval_id: z.string().min(1),
        tool_name: z.string(),
        presentation: z.string(),
        session_uid: z.string(),
        deployment_uid: z.string(),
        target: z.record(z.string(), z.unknown()),
      })
      .loose(),
  }),
  z.object({
    delivery: z.string().min(1),
    event: z.literal('approval.decided'),
    payload: z
      .object({
        approval_id: z.string().min(1),
        status: z.string(),
        decided_by: z.string(),
        session_uid: z.string(),
        deployment_uid: z.string(),
        target: z.record(z.string(), z.unknown()),
      })
      .loose(),
  }),
  z.object({
    delivery: z.string().min(1),
    event: z.literal('turn.completed'),
    payload: z
      .object({
        record_entry: z.string(),
        session_uid: z.string(),
        deployment_uid: z.string(),
        target: z.record(z.string(), z.unknown()),
      })
      .loose(),
  }),
]);
export type HostDelivery = z.infer<typeof deliverySchema>;

/** An outbox item read as the delivery a push would have carried. */
export function deliveryOfOutbox(item: unknown): HostDelivery {
  const { uid, event, payload } = outboxItemSchema.parse(item);
  return deliverySchema.parse({ delivery: uid, event, payload });
}

/**
 * Whether a host may offer Approve and Reject: only what the server says a
 * host may decide, in a version the hosts render, shown whole, pending, with
 * no secret field. Anything else gets *Review in Datalayer*. Each host also checks the card fits its own limits.
 */
export function hostMayDecide(presentation: ApprovalPresentation): boolean {
  return (
    presentation.version === PRESENTATION_VERSION &&
    presentation.host_may_decide &&
    presentation.complete &&
    presentation.secret_fields.length === 0 &&
    presentation.status === 'pending'
  );
}

/** `v1=` HMAC-SHA256 of `"<timestamp>.<raw body>"`, as ai-agents signs a push. */
export function deliverySignature(
  secret: string,
  timestamp: number,
  rawBody: string | Buffer,
): string {
  const mac = createHmac('sha256', secret);
  mac.update(`${timestamp}.`);
  mac.update(rawBody);
  return `v1=${mac.digest('hex')}`;
}

/**
 * Verify a pushed delivery before trusting it: its signature in constant
 * time, and a timestamp within five minutes, so a captured push cannot be
 * replayed later. `key` is what the registration was answered with the
 * secret: the push must name it (`keyHeader`, {@link DELIVERY_KEY_HEADER}).
 * A secret kept without one was derived from the platform's shared secret:
 * accepted until {@link SHARED_SECRET_DELIVERIES_UNTIL} only, then refused
 * until the host registers again.
 */
export function verifyDelivery(input: {
  key?: string;
  keyHeader?: string;
  nowSeconds?: number;
  rawBody: string | Buffer;
  secret: string;
  signature: string | undefined;
  timestamp: string | undefined;
  toleranceSeconds?: number;
}): HostDelivery {
  const stamp = Number(input.timestamp);
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (
    !Number.isInteger(stamp) ||
    Math.abs(now - stamp) > (input.toleranceSeconds ?? 300)
  ) {
    throw new Error("The delivery's timestamp is missing or too old.");
  }
  if (input.key) {
    if (input.keyHeader !== input.key) {
      throw new Error('The delivery names another signing key.');
    }
  } else if (input.keyHeader) {
    throw new Error(
      'The delivery names a key this registration was not answered.',
    );
  } else if (now >= SHARED_SECRET_DELIVERIES_UNTIL) {
    throw new Error(
      "The delivery's secret was derived from the platform's shared secret, refused since 31 December 2026: register again.",
    );
  }
  const expected = Buffer.from(
    deliverySignature(input.secret, stamp, input.rawBody),
  );
  const given = Buffer.from(input.signature ?? '');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    throw new Error("The delivery's signature does not match.");
  }
  return deliverySchema.parse(JSON.parse(input.rawBody.toString()));
}
