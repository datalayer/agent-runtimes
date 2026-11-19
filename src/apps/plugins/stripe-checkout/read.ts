/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A Stripe Checkout Session, read from Stripe's MCP server's
 * `stripe_api_write` (`POST /v1/checkout/sessions`) or `stripe_api_read`
 * (`GET /v1/checkout/sessions/{id}`), and the A2UI surface that draws it.
 * Pure.
 *
 * Test mode only (the user, 15 November 2026): a live session
 * (`livemode: true`, an id not `cs_test_`) is read as refused, and its card
 * offers no Checkout.
 *
 * @module apps/plugins/stripe-checkout/read
 */

import type { A2uiMessage } from '@a2ui/web_core/v0_9';
import { amount, record, records, words, type Data } from '../../toolCards/kit';

/** Currencies Stripe counts in whole units (no cents). */
const ZERO_DECIMAL = new Set([
  'bif',
  'clp',
  'djf',
  'gnf',
  'jpy',
  'kmf',
  'krw',
  'mga',
  'pyg',
  'rwf',
  'ugx',
  'vnd',
  'vuv',
  'xaf',
  'xof',
  'xpf',
]);

/** An amount in Stripe's minor units, in major ones. */
export function majorUnits(minor: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toLowerCase()) ? minor : minor / 100;
}

export type CheckoutLine = {
  name: string;
  quantity: number;
  /** The line's total, in major units. */
  total?: number;
};

export type CheckoutStatus =
  'paid' | 'open' | 'expired' | 'complete' | 'unknown';

export type CheckoutSession = {
  id: string;
  /** Stripe's hosted page: `https://checkout.stripe.com/…` only. */
  url: string;
  currency: string;
  /** In major units. */
  total?: number;
  lines: CheckoutLine[];
  status: CheckoutStatus;
  testMode: boolean;
  expiresAt?: number;
};

/** The Stripe object a tool answered: an object, its JSON, or MCP text content. */
export function stripeObjectOf(result: unknown): Data | null {
  const direct = record(result);
  if (direct && typeof direct.object === 'string') {
    return direct;
  }
  for (const item of records(
    direct?.content ?? (Array.isArray(result) ? result : []),
  )) {
    const inner = record(item.text);
    if (inner && typeof inner.object === 'string') {
      return inner;
    }
  }
  const data = record(direct?.data);
  return data && typeof data.object === 'string' ? data : null;
}

/** The line items the agent asked for, wherever its call put them. */
function linesAsked(args: Data, currency: string): CheckoutLine[] {
  const params =
    record(args.params) ?? record(args.body) ?? record(args.data) ?? args;
  return records(params.line_items)
    .map(line => {
      const price = record(line.price_data) ?? {};
      const product = record(price.product_data) ?? {};
      const quantity = amount(line.quantity) ?? 1;
      const unit = amount(price.unit_amount);
      const lineCurrency = words(price.currency) || currency;
      return {
        name:
          words(product.name) || words(line.description) || words(line.price),
        quantity,
        total:
          unit === undefined
            ? undefined
            : majorUnits(unit * quantity, lineCurrency),
      };
    })
    .filter(line => line.name);
}

/** The line items Stripe answered, when the session was expanded with them. */
function linesAnswered(session: Data, currency: string): CheckoutLine[] {
  return records(record(session.line_items)?.data)
    .map(line => {
      const total = amount(line.amount_total);
      return {
        name: words(line.description),
        quantity: amount(line.quantity) ?? 1,
        total: total === undefined ? undefined : majorUnits(total, currency),
      };
    })
    .filter(line => line.name);
}

function statusOf(session: Data): CheckoutStatus {
  if (words(session.payment_status) === 'paid') {
    return 'paid';
  }
  const status = words(session.status);
  if (status === 'open' || status === 'expired' || status === 'complete') {
    return status;
  }
  return 'unknown';
}

/** The session a call created or read; null for any other Stripe call. */
export function readCheckoutSession(
  args: unknown,
  result: unknown,
): CheckoutSession | null {
  const session = stripeObjectOf(result);
  if (!session || session.object !== 'checkout.session') {
    return null;
  }
  const id = words(session.id);
  const currency = words(session.currency).toUpperCase();
  const url = words(session.url);
  const totalMinor = amount(session.amount_total);
  const answered = linesAnswered(session, currency);
  return {
    id,
    url: /^https:\/\/checkout\.stripe\.com\/\S+$/.test(url) ? url : '',
    currency,
    total:
      totalMinor === undefined ? undefined : majorUnits(totalMinor, currency),
    lines:
      answered.length > 0 ? answered : linesAsked(record(args) ?? {}, currency),
    status: statusOf(session),
    testMode: session.livemode === false && id.startsWith('cs_test_'),
    expiresAt: amount(session.expires_at),
  };
}

/** Whether a call is one that creates or reads a Checkout Session, from what it asked. */
export function asksForCheckoutSession(args: unknown): boolean {
  const asked = JSON.stringify(record(args) ?? {});
  return /checkout\/sessions|checkout\.session/.test(asked);
}

export const STRIPE_CHECKOUT_WORDS = {
  title: 'Checkout',
  testMode:
    'Test mode: no real charge. Pay on Stripe’s page with a test card (4242 4242 4242 4242).',
  live: 'This is a live Stripe session: Datalayer uses Stripe in test mode only, so it offers no Checkout.',
  total: (total: string) => `Total: ${total}`,
  checkout: 'Checkout',
  check: 'Check the payment',
  noCard: 'You pay on Stripe’s own page: no card number is ever typed here.',
  status: {
    paid: 'Paid',
    open: 'Waiting for payment',
    expired: 'Expired',
    complete: 'Complete',
    unknown: 'Status unknown',
  } satisfies Record<CheckoutStatus, string>,
  checkMessage: (id: string) =>
    `I am back from Stripe's Checkout. Read Checkout Session ${id} with stripe_api_read and tell me whether it is paid, open or expired.`,
} as const;

/** The A2UI action names the card's buttons send. */
export const STRIPE_CHECKOUT_ACTION = 'stripe_checkout';
export const STRIPE_CHECK_ACTION = 'stripe_check_payment';

const formatted = (value: number | undefined, currency: string): string =>
  value === undefined
    ? ''
    : `${currency} ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * The card as A2UI v0.9 messages, in the catalogue the chat's A2UI renderer
 * reads (`catalogId`): the lines, the total, test mode said, its status, and
 * Checkout (an open, test-mode session with Stripe's page) or *Check the
 * payment* (once the person went to pay).
 */
export function checkoutSurface(
  session: CheckoutSession,
  catalogId: string,
  options: { returned?: boolean } = {},
): A2uiMessage[] {
  const surfaceId = `stripe-checkout-${session.id || 'session'}`;
  const nodes: Record<string, unknown>[] = [
    {
      id: 'title',
      component: 'Text',
      variant: 'h3',
      text: STRIPE_CHECKOUT_WORDS.title,
    },
    {
      id: 'mode',
      component: 'Text',
      variant: 'caption',
      text: session.testMode
        ? STRIPE_CHECKOUT_WORDS.testMode
        : STRIPE_CHECKOUT_WORDS.live,
    },
  ];
  const body = ['title', 'mode'];
  session.lines.forEach((line, index) => {
    nodes.push(
      {
        id: `line-${index}-name`,
        component: 'Text',
        text: line.quantity > 1 ? `${line.name} × ${line.quantity}` : line.name,
      },
      {
        id: `line-${index}-total`,
        component: 'Text',
        text: formatted(line.total, session.currency),
      },
      {
        id: `line-${index}`,
        component: 'Row',
        children: [`line-${index}-name`, `line-${index}-total`],
      },
    );
    body.push(`line-${index}`);
  });
  if (session.total !== undefined) {
    nodes.push({
      id: 'total',
      component: 'Text',
      variant: 'h4',
      text: STRIPE_CHECKOUT_WORDS.total(
        formatted(session.total, session.currency),
      ),
    });
    body.push('total');
  }
  nodes.push({
    id: 'status',
    component: 'Text',
    variant: 'caption',
    text: STRIPE_CHECKOUT_WORDS.status[session.status],
  });
  body.push('status');
  const canPay =
    session.testMode && session.status === 'open' && Boolean(session.url);
  if (canPay) {
    const [action, label] = options.returned
      ? [STRIPE_CHECK_ACTION, STRIPE_CHECKOUT_WORDS.check]
      : [STRIPE_CHECKOUT_ACTION, STRIPE_CHECKOUT_WORDS.checkout];
    nodes.push(
      { id: 'pay-label', component: 'Text', text: label },
      {
        id: 'pay',
        component: 'Button',
        variant: 'primary',
        child: 'pay-label',
        action: { event: { name: action, context: { session: session.id } } },
      },
      {
        id: 'no-card',
        component: 'Text',
        variant: 'caption',
        text: STRIPE_CHECKOUT_WORDS.noCard,
      },
    );
    body.push('pay', 'no-card');
  }
  nodes.push({ id: 'body', component: 'Column', children: body });
  nodes.unshift({ id: 'root', component: 'Card', child: 'body' });
  return [
    { version: 'v0.9', createSurface: { surfaceId, catalogId } },
    { version: 'v0.9', updateComponents: { surfaceId, components: nodes } },
  ] as unknown as A2uiMessage[];
}
