/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Agentic Commerce Protocol, `2026-04-17`, as a Reactor Plugin and a
 * client (AGENT_PROTOCOLS PR-40 to PR-42) — the twin of
 * `agent_runtimes.protocols.agentic_commerce`. Never `acp` in code: that is
 * the Agent Client Protocol (`../ACPAdapter`).
 *
 * Types are generated from the specification's JSON Schema (`./models`,
 * `scripts/codegen/generate_agentic_commerce.sh`). A purchase goes as every
 * purchase does (`../commerce`): an exact, revisioned proposal, approved by
 * the person through `agentic_commerce.approver`, paid with the host's
 * delegated token (`agentic_commerce.paymentData`), completed once.
 *
 * @module protocols/agentic-commerce
 */

import {
  contribution,
  defineContributionPoint,
  definePlugin,
  type ReactorPlatformView,
} from '@datalayer/reactor';
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
import type {
  CheckoutSessionBase,
  CheckoutSessionCreateRequest,
  DiscoveryResponse,
  PaymentData as PaymentDataModel,
} from './models';
import { AGENTIC_COMMERCE_VERSION } from './models';

export { AGENTIC_COMMERCE_VERSION };
export const DISCOVERY_PATH = '/.well-known/acp.json';
export const AGENTIC_COMMERCE_PLUGIN =
  'agent-runtimes.protocols.agentic-commerce';

/**
 * Each operation's action class (F-10), for Rules (R-05): agentspecs'
 * `protocol-tools/agentic-commerce.yaml` (AGENT_PROTOCOLS PR-54).
 */
export const AGENTIC_COMMERCE_ACTION_CLASSES =
  operationClasses('agentic-commerce');

export class AgenticCommerceError extends Error {}

type Json = Record<string, any>;

/** The agent's bearer credential with one seller, held by the host. */
export interface SellerCredentials {
  bearer(seller: string): Promise<string>;
}
/** The delegated payment data of an approved proposal, from the host's custody. */
export interface PaymentData {
  paymentData(
    proposal: CheckoutProposal,
    handlers: Json[],
  ): Promise<PaymentDataModel>;
}
/** An implementation of one extension of the protocol, by the name sellers declare. */
export interface AgenticCommerceExtension {
  name: string;
}

export const AgenticCommerceApprovers =
  defineContributionPoint<CheckoutApprover>('agentic_commerce.approver');
export const AgenticCommercePaymentData = defineContributionPoint<PaymentData>(
  'agentic_commerce.paymentData',
);
export const AgenticCommerceCredentials =
  defineContributionPoint<SellerCredentials>('agentic_commerce.credentials');
export const AgenticCommerceProposalStores =
  defineContributionPoint<ProposalStore>('agentic_commerce.proposalStore');
export const AgenticCommerceDiscountExtensions =
  defineContributionPoint<AgenticCommerceExtension>(
    'agentic_commerce.extension.discount',
  );
export const AgenticCommerceOtherExtensions =
  defineContributionPoint<AgenticCommerceExtension>(
    'agentic_commerce.extension.other',
  );
const POINTS = [
  AgenticCommerceApprovers,
  AgenticCommercePaymentData,
  AgenticCommerceCredentials,
  AgenticCommerceProposalStores,
  AgenticCommerceDiscountExtensions,
  AgenticCommerceOtherExtensions,
];

export const AgenticCommercePlugin = definePlugin({
  name: AGENTIC_COMMERCE_PLUGIN,
  version: '1.0.0',
  description: `Agentic Commerce Protocol ${AGENTIC_COMMERCE_VERSION}: buy once approved.`,
  contributionPoints: POINTS,
  contributes: [
    contribution(
      ProtocolDescriptions,
      {
        id: 'agentic_commerce',
        name: 'Agentic Commerce Protocol',
        layer: 'commerce',
        version: AGENTIC_COMMERCE_VERSION,
        roles: ['buyer'],
        status: 'partial',
        specification: `https://github.com/agentic-commerce-protocol/agentic-commerce-protocol/tree/main/spec/${AGENTIC_COMMERCE_VERSION}`,
        plugin: AGENTIC_COMMERCE_PLUGIN,
        catalogue: 'acp',
        points: POINTS.map(point => point.id),
      },
      { id: 'agentic_commerce', order: DEFAULT_ORDER },
    ),
  ],
  // One store per reactor, not one per module: a store is state.
  register: ctx => {
    ctx.contribute(AgenticCommerceProposalStores, new InMemoryProposalStore(), {
      id: 'memory',
      order: DEFAULT_ORDER,
    });
  },
});

/** The extensions an agent declares to a seller: those contributed here. */
export function declaredExtensions(reactor: ReactorPlatformView): string[] {
  const names: string[] = [];
  const [discount] = reactor.getContributions(
    AgenticCommerceDiscountExtensions,
  );
  if (discount) {
    names.push(discount.value.name);
  }
  names.push(
    ...reactor
      .getContributions(AgenticCommerceOtherExtensions)
      .map(c => c.value.name),
  );
  return [...new Set(names)];
}

/** `line_items` as the 2026-04-17 schema writes them: one `Item` per unit (it has no `quantity`). */
export function itemsOf(
  items: Array<{ id: string; quantity?: number }>,
): CheckoutSessionCreateRequest['line_items'] {
  return items.flatMap(item =>
    Array.from({ length: item.quantity ?? 1 }, () => ({ id: item.id })),
  ) as CheckoutSessionCreateRequest['line_items'];
}

/** The revision of what a session buys; the same digest as Python's `revision_of`. */
export function revisionOf(session: Json): Promise<string> {
  return digest({
    id: session.id,
    currency: session.currency,
    line_items: (session.line_items ?? []).map((line: Json) => ({
      item: line.item?.id ?? null,
      price: line.item?.unit_amount ?? null,
      quantity: line.quantity,
    })),
    totals: (session.totals ?? []).map((total: Json) => ({
      type: total.type,
      amount: total.amount,
    })),
  });
}

/** What an agent may see of a session: no payment token. */
export function sessionSummary(session: Json): Json {
  return {
    id: session.id,
    status: session.status,
    currency: session.currency,
    lines: (session.line_items ?? []).map((line: Json) => ({
      title: line.name ?? line.item?.name ?? line.item?.id,
      quantity: line.quantity,
      price: line.item?.unit_amount,
    })),
    totals: Object.fromEntries(
      (session.totals ?? []).map((t: Json) => [t.type, t.amount]),
    ),
    messages: (session.messages ?? []).map((m: Json) => m.content),
    extensions: (session.capabilities?.extensions ?? []).map(
      (e: Json) => e.name,
    ),
    ...(session.order
      ? {
          order: {
            id: session.order.id,
            permalink_url: session.order.permalink_url,
          },
        }
      : {}),
  };
}

/** An agent's client of one seller, over REST. */
export class AgenticCommerceClient {
  private apiBaseUrl?: string;
  private readonly domain: string;

  constructor(
    private readonly seller: string,
    private readonly reactor: ReactorPlatformView,
    private readonly fetchImpl: typeof fetch = (input, init) =>
      fetch(input, init),
  ) {
    this.domain = new URL(seller).hostname;
  }

  /** Read and check the seller's discovery document: the version, REST, checkout. */
  async discover(): Promise<DiscoveryResponse> {
    const answer = await this.fetchImpl(
      `${this.seller.replace(/\/$/, '')}${DISCOVERY_PATH}`,
    );
    if (answer.status !== 200) {
      throw new AgenticCommerceError(
        `${DISCOVERY_PATH} answered ${answer.status}`,
      );
    }
    const document = (await answer.json()) as DiscoveryResponse;
    if (
      document.protocol?.name !== 'acp' ||
      !document.protocol.supported_versions.includes(AGENTIC_COMMERCE_VERSION)
    ) {
      throw new AgenticCommerceError(
        `the seller does not support ${AGENTIC_COMMERCE_VERSION}`,
      );
    }
    if (!document.transports.includes('rest')) {
      throw new AgenticCommerceError('the seller offers no REST transport');
    }
    if (!document.capabilities.services.includes('checkout')) {
      throw new AgenticCommerceError('the seller offers no checkout');
    }
    this.apiBaseUrl = String(document.api_base_url).replace(/\/$/, '');
    return document;
  }

  private async call(
    method: string,
    path: string,
    body?: unknown,
    key?: string,
  ): Promise<Json> {
    if (!this.apiBaseUrl) {
      await this.discover();
    }
    const credentials = firstContribution(
      this.reactor,
      AgenticCommerceCredentials,
      'Agentic Commerce credentials',
    );
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await credentials.bearer(this.domain)}`,
      'API-Version': AGENTIC_COMMERCE_VERSION,
      'Content-Type': 'application/json',
      'Request-Id': crypto.randomUUID(),
    };
    if (method === 'POST') {
      headers['Idempotency-Key'] = key ?? crypto.randomUUID();
    }
    const answer = await this.fetchImpl(`${this.apiBaseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (answer.status === 409) {
      throw new AgenticCommerceError(
        'the idempotency key was reused with another request',
      );
    }
    if (answer.status >= 400) {
      throw new AgenticCommerceError(
        `${method} ${path} answered ${answer.status}`,
      );
    }
    return answer.json();
  }

  async createCheckout(
    items: Array<{ id: string; quantity?: number }>,
    currency: string,
    buyer?: Json,
  ): Promise<CheckoutSessionBase> {
    const extensions = declaredExtensions(this.reactor);
    const request = {
      line_items: itemsOf(items),
      currency,
      capabilities: extensions.length ? { extensions } : {},
      ...(buyer ? { buyer } : {}),
    } as CheckoutSessionCreateRequest;
    return (await this.call(
      'POST',
      '/checkout_sessions',
      request,
    )) as CheckoutSessionBase;
  }

  async updateCheckout(id: string, update: Json): Promise<CheckoutSessionBase> {
    const body = { ...update };
    if (body.line_items) {
      body.line_items = itemsOf(body.line_items);
    }
    return (await this.call(
      'POST',
      `/checkout_sessions/${id}`,
      body,
    )) as CheckoutSessionBase;
  }

  async getCheckout(id: string): Promise<CheckoutSessionBase> {
    return (await this.call(
      'GET',
      `/checkout_sessions/${id}`,
    )) as CheckoutSessionBase;
  }

  async cancelCheckout(id: string): Promise<CheckoutSessionBase> {
    return (await this.call(
      'POST',
      `/checkout_sessions/${id}/cancel`,
      {},
    )) as CheckoutSessionBase;
  }

  /** The exact purchase a `ready_for_payment` session would make. */
  async proposeCompletion(id: string): Promise<CheckoutProposal> {
    const session = (await this.getCheckout(id)) as Json;
    if (session.status !== 'ready_for_payment') {
      throw new AgenticCommerceError(
        `the session is ${session.status}, not ready_for_payment`,
      );
    }
    const total = (session.totals as Json[]).find(t => t.type === 'total');
    if (!total) {
      throw new AgenticCommerceError('the session says no total');
    }
    return {
      id: crypto.randomUUID(),
      merchant: this.domain,
      checkoutId: session.id,
      revision: await revisionOf(session),
      currency: String(session.currency).toUpperCase(),
      total: total.amount,
      lines: (session.line_items as Json[]).map(line => ({
        title: line.name ?? line.item?.name ?? line.item?.id,
        quantity: line.quantity,
        price: line.item?.unit_amount ?? 0,
      })),
      expiresAt: session.expires_at,
    };
  }

  /** Complete an approved proposal, once: refused if spent, declined, changed or expired. */
  async complete(proposal: CheckoutProposal): Promise<Json> {
    if (
      proposal.expiresAt &&
      new Date(proposal.expiresAt).getTime() <= Date.now()
    ) {
      throw new AgenticCommerceError('the proposal has expired');
    }
    const approver = firstContribution(
      this.reactor,
      AgenticCommerceApprovers,
      'Agentic Commerce approver',
    );
    const payment = firstContribution(
      this.reactor,
      AgenticCommercePaymentData,
      'Agentic Commerce payment data',
    );
    const store = firstContribution(
      this.reactor,
      AgenticCommerceProposalStores,
      'Agentic Commerce proposal store',
    );
    // Spent before the person is asked: a declined proposal is proposed again.
    if (!(await store.take(proposal.id))) {
      throw new AgenticCommerceError('this proposal was used already');
    }
    if (!(await approver.approve(proposal))) {
      throw new AgenticCommerceError(
        'the person did not approve this purchase',
      );
    }
    const session = (await this.getCheckout(proposal.checkoutId)) as Json;
    if (session.status !== 'ready_for_payment') {
      throw new AgenticCommerceError(
        `the session is ${session.status}, not ready_for_payment`,
      );
    }
    if ((await revisionOf(session)) !== proposal.revision) {
      throw new AgenticCommerceError(
        'the session changed since it was proposed: propose it again',
      );
    }
    const data = await payment.paymentData(
      proposal,
      session.capabilities?.payment?.handlers ?? [],
    );
    return this.call(
      'POST',
      `/checkout_sessions/${proposal.checkoutId}/complete`,
      { payment_data: data },
      proposal.id,
    );
  }
}
