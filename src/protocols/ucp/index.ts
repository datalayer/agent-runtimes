/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Universal Commerce Protocol, `2026-08-25`, as a Reactor Plugin and a
 * shopping client (AGENT_PROTOCOLS PR-30, PR-31) — the twin of
 * `agent_runtimes.protocols.ucp`.
 *
 * Checkouts are read through the protocol's own TypeScript SDK
 * (`@ucp-js/sdk` 0.5.1, zod schemas generated from the same JSON Schemas).
 * A purchase is an exact, revisioned proposal (`proposeCompletion`), approved
 * by the person through the host's `ucp.approver`, paid with the host's
 * `ucp.paymentInstruments`, completed once (`ucp.proposalStore`).
 *
 * @module protocols/ucp
 */

import {
  contribution,
  defineContributionPoint,
  definePlugin,
  type ReactorPlatformView,
} from '@datalayer/reactor';
import { ExtendedCheckoutResponseSchema } from '@ucp-js/sdk';
import {
  InMemoryProposalStore,
  digest,
  operationClasses,
  type CheckoutApprover,
  type CheckoutProposal,
  type ProposalStore,
} from '../commerce';
import {
  DEFAULT_ORDER,
  ProtocolDescriptions,
  firstContribution,
} from '../core';

export const UCP_VERSION = '2026-08-25';
export const SHOPPING_SERVICE = 'dev.ucp.shopping';
export const CHECKOUT_CAPABILITY = 'dev.ucp.shopping.checkout';
export const PROFILE_PATH = '/.well-known/ucp';
export const UCP_PLUGIN = 'agent-runtimes.protocols.ucp';

/**
 * Each operation's action class (F-10), for Rules (R-05): agentspecs'
 * `protocol-tools/ucp.yaml` (AGENT_PROTOCOLS PR-54).
 */
export const UCP_ACTION_CLASSES = operationClasses('ucp');

export {
  InMemoryProposalStore,
  proposalSummary,
  type CheckoutApprover,
  type CheckoutProposal,
  type ProposalStore,
} from '../commerce';

export class UcpError extends Error {}

type Json = Record<string, any>;

export interface PaymentInstruments {
  instrument(proposal: CheckoutProposal, handlers: Json): Promise<Json>;
}
export interface UcpExtension {
  capability: string;
  version: string;
}

export const UcpApprovers =
  defineContributionPoint<CheckoutApprover>('ucp.approver');
export const UcpPaymentInstruments =
  defineContributionPoint<PaymentInstruments>('ucp.paymentInstruments');
export const UcpProposalStores =
  defineContributionPoint<ProposalStore>('ucp.proposalStore');
export const UcpFulfillmentExtensions = defineContributionPoint<UcpExtension>(
  'ucp.extension.fulfillment',
);
export const UcpDiscountExtensions = defineContributionPoint<UcpExtension>(
  'ucp.extension.discount',
);
export const UcpBuyerConsentExtensions = defineContributionPoint<UcpExtension>(
  'ucp.extension.buyer_consent',
);
const EXTENSION_POINTS = [
  UcpFulfillmentExtensions,
  UcpDiscountExtensions,
  UcpBuyerConsentExtensions,
];
const UCP_POINTS = [
  UcpApprovers,
  UcpPaymentInstruments,
  UcpProposalStores,
  ...EXTENSION_POINTS,
];

export const UcpPlugin = definePlugin({
  name: UCP_PLUGIN,
  version: '1.0.0',
  description: `Universal Commerce Protocol ${UCP_VERSION}: shop, propose, buy once approved.`,
  contributionPoints: UCP_POINTS,
  contributes: [
    contribution(
      ProtocolDescriptions,
      {
        id: 'ucp',
        name: 'Universal Commerce Protocol',
        layer: 'commerce',
        version: UCP_VERSION,
        roles: ['shopper'],
        status: 'partial',
        specification: `https://ucp.dev/${UCP_VERSION}/specification/overview`,
        plugin: UCP_PLUGIN,
        points: UCP_POINTS.map(point => point.id),
      },
      { id: 'ucp', order: DEFAULT_ORDER },
    ),
  ],
  // One store per reactor, not one per module: a store is state.
  register: ctx => {
    ctx.contribute(UcpProposalStores, new InMemoryProposalStore(), {
      id: 'memory',
      order: DEFAULT_ORDER,
    });
  },
});

/** The capabilities in use with a business: checkout, and the extensions both support. */
export function negotiateCapabilities(
  profile: Json,
  reactor: ReactorPlatformView,
): string[] {
  const offered = new Set(Object.keys(profile?.ucp?.capabilities ?? {}));
  if (!offered.has(CHECKOUT_CAPABILITY)) {
    throw new UcpError('the business offers no checkout');
  }
  const active = [CHECKOUT_CAPABILITY];
  for (const point of EXTENSION_POINTS) {
    const [first] = reactor.getContributions(point);
    if (first && offered.has(first.value.capability)) {
      active.push(first.value.capability);
    }
  }
  return active;
}

/** The revision of what a checkout buys; the same digest as Python's `revision_of`. */
export function revisionOf(checkout: Json): Promise<string> {
  return digest({
    id: checkout.id,
    currency: checkout.currency,
    line_items: (checkout.line_items ?? []).map((line: Json) => ({
      item: line.item?.id ?? null,
      price: line.item?.price ?? null,
      quantity: line.quantity,
    })),
    totals: (checkout.totals ?? []).map((total: Json) => ({
      type: total.type,
      amount: total.amount,
    })),
  });
}

function readCheckout(body: Json): Json {
  if (body?.ucp?.status === 'error') {
    const said = (body.messages ?? []).map((m: Json) => m.content).join('; ');
    throw new UcpError(`the business refused: ${said}`);
  }
  ExtendedCheckoutResponseSchema.parse(body);
  return body;
}

/** What an agent may see of a checkout: no payment credential, no token. */
export function checkoutSummary(checkout: Json): Json {
  return {
    id: checkout.id,
    status: checkout.status,
    currency: checkout.currency,
    lines: (checkout.line_items ?? []).map((line: Json) => ({
      title: line.item?.title ?? line.item?.id,
      quantity: line.quantity,
      price: line.item?.price,
    })),
    totals: Object.fromEntries(
      (checkout.totals ?? []).map((t: Json) => [t.type, t.amount]),
    ),
    messages: (checkout.messages ?? []).map((m: Json) => m.content),
    ...(checkout.order ? { order: { id: checkout.order.id } } : {}),
  };
}

/** A platform's client of one business, over the REST binding. */
export class UcpClient {
  private endpoint?: string;
  private domain: string;

  constructor(
    private readonly business: string,
    private readonly agentProfile: string,
    private readonly fetchImpl: typeof fetch = (input, init) =>
      fetch(input, init),
  ) {
    this.domain = new URL(business).hostname;
  }

  private headers(idempotencyKey?: string): Record<string, string> {
    return {
      'UCP-Agent': `profile="${this.agentProfile}"`,
      'Request-Id': crypto.randomUUID(),
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    };
  }

  /** Read the business's profile: the version, shopping over REST, checkout. */
  async discover(): Promise<Json> {
    const answer = await this.fetchImpl(
      `${this.business.replace(/\/$/, '')}${PROFILE_PATH}`,
    );
    if (answer.status !== 200) {
      throw new UcpError(`${PROFILE_PATH} answered ${answer.status}`);
    }
    const profile = await answer.json();
    const ucp = profile.ucp ?? {};
    const versions = new Set([
      ucp.version,
      ...Object.keys(ucp.supported_versions ?? {}),
    ]);
    if (!versions.has(UCP_VERSION)) {
      throw new UcpError(`the business does not speak UCP ${UCP_VERSION}`);
    }
    const rest = (ucp.services?.[SHOPPING_SERVICE] ?? []).find(
      (service: Json) => service.transport === 'rest' && service.endpoint,
    );
    if (!rest) {
      throw new UcpError('the business offers no shopping service over REST');
    }
    if (!ucp.capabilities?.[CHECKOUT_CAPABILITY]) {
      throw new UcpError('the business offers no checkout');
    }
    this.endpoint = String(rest.endpoint).replace(/\/$/, '');
    return profile;
  }

  private async call(
    method: string,
    path: string,
    body?: unknown,
    key?: string,
  ): Promise<Json> {
    if (!this.endpoint) {
      await this.discover();
    }
    const answer = await this.fetchImpl(`${this.endpoint}${path}`, {
      method,
      headers: this.headers(key),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (answer.status === 409) {
      throw new UcpError('the idempotency key was reused with another request');
    }
    if (answer.status >= 400) {
      throw new UcpError(`${method} ${path} answered ${answer.status}`);
    }
    return answer.json();
  }

  async search(query: string, limit = 10): Promise<Json[]> {
    return (
      await this.call('POST', '/catalog/search', {
        query,
        pagination: { limit },
      })
    ).products;
  }

  async createCheckout(
    lines: Array<{ id: string; quantity?: number }>,
    buyer?: Json,
  ) {
    return readCheckout(
      await this.call(
        'POST',
        '/checkout-sessions',
        {
          line_items: lines.map(line => ({
            item: { id: line.id },
            quantity: line.quantity ?? 1,
          })),
          ...(buyer ? { buyer } : {}),
        },
        crypto.randomUUID(),
      ),
    );
  }

  async updateCheckout(id: string, update: Json) {
    return readCheckout(
      await this.call(
        'PUT',
        `/checkout-sessions/${id}`,
        update,
        crypto.randomUUID(),
      ),
    );
  }

  async getCheckout(id: string) {
    return readCheckout(await this.call('GET', `/checkout-sessions/${id}`));
  }

  async cancelCheckout(id: string) {
    return readCheckout(
      await this.call(
        'POST',
        `/checkout-sessions/${id}/cancel`,
        {},
        crypto.randomUUID(),
      ),
    );
  }

  /** The exact purchase a `ready_for_complete` checkout would make. */
  async proposeCompletion(id: string): Promise<CheckoutProposal> {
    const checkout = await this.getCheckout(id);
    if (checkout.status !== 'ready_for_complete') {
      throw new UcpError(
        `the checkout is ${checkout.status}, not ready_for_complete`,
      );
    }
    const total = (checkout.totals as Json[]).find(t => t.type === 'total');
    if (!total) {
      throw new UcpError('the checkout says no total');
    }
    return {
      id: crypto.randomUUID(),
      merchant: this.domain,
      checkoutId: checkout.id,
      revision: await revisionOf(checkout),
      currency: checkout.currency,
      total: total.amount,
      lines: (checkout.line_items as Json[]).map(line => ({
        title: line.item.title ?? line.item.id,
        quantity: line.quantity,
        price: line.item.price ?? 0,
      })),
      expiresAt: checkout.expires_at,
    };
  }

  /** Complete an approved proposal, once: refused if unapproved, spent, changed or expired. */
  async complete(
    proposal: CheckoutProposal,
    reactor: ReactorPlatformView,
  ): Promise<Json> {
    if (
      proposal.expiresAt &&
      new Date(proposal.expiresAt).getTime() <= Date.now()
    ) {
      throw new UcpError('the proposal has expired');
    }
    const approver = firstContribution(reactor, UcpApprovers, 'UCP approver');
    const instruments = firstContribution(
      reactor,
      UcpPaymentInstruments,
      'UCP payment instruments',
    );
    const store = firstContribution(
      reactor,
      UcpProposalStores,
      'UCP proposal store',
    );
    // Spent before the person is asked: a proposal is put to them once, and a
    // declined one is proposed again, never retried.
    if (!(await store.take(proposal.id))) {
      throw new UcpError('this proposal was used already');
    }
    if (!(await approver.approve(proposal))) {
      throw new UcpError('the person did not approve this purchase');
    }
    const checkout = await this.getCheckout(proposal.checkoutId);
    if (checkout.status !== 'ready_for_complete') {
      throw new UcpError(
        `the checkout is ${checkout.status}, not ready_for_complete`,
      );
    }
    if ((await revisionOf(checkout)) !== proposal.revision) {
      throw new UcpError(
        'the checkout changed since it was proposed: propose it again',
      );
    }
    const instrument = await instruments.instrument(
      proposal,
      checkout.ucp?.payment_handlers ?? {},
    );
    return readCheckout(
      await this.call(
        'POST',
        `/checkout-sessions/${proposal.checkoutId}/complete`,
        { payment: { instruments: [instrument] } },
        proposal.id,
      ),
    );
  }
}
