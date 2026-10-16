/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

/**
 * The generic Datalayer host contracts (plans/SLACK.md §4.3, plans/DISCORD.md
 * §4.3), as ai-agents answers them, for every chat host (Slack, Discord).
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
 * no secret field. Anything else gets *Review in Datalayer* (SLACK §2 rule 6,
 * DISCORD §2 rule 6). Each host also checks the card fits its own limits.
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
 * replayed later.
 */
export function verifyDelivery(input: {
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
  const expected = Buffer.from(
    deliverySignature(input.secret, stamp, input.rawBody),
  );
  const given = Buffer.from(input.signature ?? '');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    throw new Error("The delivery's signature does not match.");
  }
  return deliverySchema.parse(JSON.parse(input.rawBody.toString()));
}
