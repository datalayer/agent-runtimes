/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The cards the agents' UI plugins draw where their tools land (15 November
 * 2026): from what the agent passed while the call runs, from the tool's
 * answer once done, the chat's own row for a refusal; the person's answer
 * sent back through the chat; the X budget and Link LinkedIn read back.
 */

// @vitest-environment jsdom
import * as React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ToolCallRenderContext } from '../../types/chat';
import { ToolCardSendContext } from '../toolCards/kit';
import { readPostPreview } from '../toolCards/postPreview';
import { ShoppingBasketCard } from '../plugins/shopping-basket';
import {
  APPROVE_MATCH_ACTION,
  readReconciliation,
  reconciliationCard,
} from '../plugins/bank-reconciliation';
import { readTripOptions, tripOptionsCard } from '../plugins/trip-options';
import { cardMessages } from '../toolCards/a2uiCard';
import { readItinerary } from '../plugins/trip-itinerary';
import { readTripBudget } from '../plugins/trip-budget';
import { readVatSummary } from '../plugins/vat-summary';
import { readTrialBalance } from '../plugins/trial-balance';
import { readEarthScenes } from '../plugins/earth-scenes';
import { readIndexResult } from '../plugins/earth-index';
import { readSavings } from '../plugins/aws-savings';
import { readSocialAccounts } from '../plugins/social-accounts';
import { readPapPurchase } from '../plugins/pap-purchase';
import { linkedInAsks } from '../plugins/linkedin-link';
import { xBudgetLeft } from '../plugins/x-budget/xBudget';
import {
  STRIPE_CHECKOUT_ACTION,
  checkoutSurface,
  readCheckoutSession,
} from '../plugins/stripe-checkout/read';

afterEach(() => cleanup());

const contextOf = (
  toolName: string,
  args: Record<string, unknown>,
  status: ToolCallRenderContext['status'] = 'complete',
  result?: unknown,
): ToolCallRenderContext =>
  ({
    toolCallId: 'call-1',
    toolName,
    name: toolName,
    args,
    status,
    result,
    defaultUI: <span data-testid="row">the chat's row</span>,
  }) as ToolCallRenderContext;

describe('a message drawn by the A2UI renderer', () => {
  it('draws the basket as an A2UI surface and sends Buy as the person’s turn', async () => {
    const send = vi.fn(() => true);
    const view = render(
      <ToolCardSendContext.Provider value={send}>
        <ShoppingBasketCard
          context={contextOf('show_basket', {}, 'complete', {
            shown: 'basket',
            currency: 'USD',
            shipping: 4,
            items: [
              { title: 'Boots', price: 80, quantity: 1 },
              { title: 'Socks', price: 5.5, quantity: 2 },
            ],
          })}
        />
      </ToolCardSendContext.Provider>,
    );
    expect(view.container.querySelector('[data-a2ui-card]')).toBeTruthy();
    const buy = await view.findByRole('button', { name: 'Buy' });
    expect(await view.findByText(/Total: USD 95\.00/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(buy);
    });
    expect((send.mock.calls[0] as unknown as [string])[0]).toContain(
      'Buy this basket',
    );
  });

  it('keeps the chat’s row for a refusal', () => {
    const view = render(
      <ShoppingBasketCard
        context={contextOf(
          'show_basket',
          {},
          'complete',
          'Refused: the basket was not shown (items is a non-empty list).',
        )}
      />,
    );
    expect(view.getByTestId('row')).toBeTruthy();
  });

  it('writes Approve per match, Choose per trip, and the savings, as A2UI', () => {
    const reconciliation = reconciliationCard(
      readReconciliation({
        currency: 'EUR',
        lines: [
          {
            id: 'b1',
            label: 'ACME',
            amount: 120,
            invoice: 'INV/1',
            invoice_amount: 100,
          },
          { id: 'b2', label: 'Fee', amount: -5 },
        ],
      }),
      'c1',
      { approve: true },
    );
    expect(
      reconciliation.sections?.map(section => section.actions?.length),
    ).toEqual([1, 0]);
    expect(reconciliation.sections?.[0].actions?.[0]).toMatchObject({
      name: APPROVE_MATCH_ACTION,
      context: { line: 'b1', invoice: 'INV/1' },
    });
    const trips = tripOptionsCard(
      readTripOptions({
        options: [1, 2, 3, 4].map(n => ({ id: `o${n}`, title: `Trip ${n}` })),
      }),
      'c2',
      { choose: true },
    );
    expect(trips.sections).toHaveLength(3);
    expect(
      tripOptionsCard(
        readTripOptions({ options: [{ id: 'o1', title: 'Trip 1' }] }),
        'c2',
        { choose: true, chosen: 'o1' },
      ).sections?.[0].actions,
    ).toEqual([]);
    const messages = JSON.stringify(cardMessages(reconciliation, 'catalog'));
    expect(messages).toContain('"component":"Button"');
    expect(messages).toContain(APPROVE_MATCH_ACTION);
  });
});

describe('what each card reads', () => {
  it('reads the days with a map for each place', () => {
    const { days } = readItinerary({
      days: [
        {
          date: '2026-11-20',
          items: [
            {
              time: '09:00',
              what: 'Tram 28',
              place: 'Praça Martim Moniz, Lisboa',
            },
          ],
        },
      ],
    });
    expect(days[0].title).toBe('Day 1');
    expect(days[0].stops[0].mapUrl).toBe(
      'https://www.google.com/maps/search/?api=1&query=Pra%C3%A7a%20Martim%20Moniz%2C%20Lisboa',
    );
  });

  it('sums budgets, balances and VAT here, never on the agent’s word', () => {
    expect(
      readTripBudget({
        lines: [{ label: 'Flight', amount: 300 }],
        budget: 250,
        currency: 'EUR',
        total: 1,
      }).left,
    ).toBe(-50);
    expect(
      readTrialBalance({
        accounts: [
          { code: '400', debit: 10 },
          { code: '700', credit: 9 },
        ],
      }).balanced,
    ).toBe(false);
    expect(
      readVatSummary({
        boxes: [
          { box: '54', tax: 21 },
          { box: '59', tax: 30, direction: 'deductible' },
        ],
      }).net,
    ).toBe(-9);
  });

  it('orders scenes by date and clamps the cloud cover', () => {
    const { scenes } = readEarthScenes({
      scenes: [
        { date: '2026-08-01', cloud_cover: 140 },
        { date: '2026-05-01' },
      ],
    });
    expect(scenes.map(scene => scene.date)).toEqual([
      '2026-05-01',
      '2026-08-01',
    ]);
    expect(scenes[1].cloudCover).toBe(100);
    const index = readIndexResult({
      index: 'ndvi',
      dates: [
        { date: '2026-08-01', mean: 0.4 },
        { date: '2026-05-01', mean: 0.6 },
      ],
    });
    expect(index.change?.meanDelta).toBe(-0.2);
  });

  it('lists the savings largest first, summed', () => {
    const { savings, monthly } = readSavings({
      recommendations: [
        { id: 'a', finding: 'Idle', estimate: { monthly_saving_usd: 10 } },
        { id: 'b', finding: 'Oversized', estimate: { monthly_saving_usd: 40 } },
      ],
    });
    expect(savings.map(saving => saving.id)).toEqual(['b', 'a']);
    expect(monthly).toBe(50);
  });

  it('says which social account posts only or needs reconnecting', () => {
    const accounts = readSocialAccounts({
      x: { linked: true, username: 'datalayer', reads: true },
      bluesky: { linked: true, handle: 'dl.bsky.social', reads: false },
      linkedin: { linked: true, name: 'Eric', reconnect: true },
    });
    expect(accounts.map(account => account.state)).toEqual([
      'linked',
      'posting-only',
      'reconnect',
    ]);
  });

  it('previews a post against its network’s limit', () => {
    const preview = readPostPreview(
      'x',
      'post_to_x',
      { text: 'é'.repeat(281) },
      undefined,
    );
    expect(preview.length).toBe(281);
    expect(preview.tooLong).toBe(true);
    const out = readPostPreview(
      'bluesky',
      'reply_on_bluesky',
      { post: 'at://p', text: 'hi' },
      { post_url: 'https://bsky.app/x' },
    );
    expect([out.kind, out.answering, out.postedUrl]).toEqual([
      'reply',
      'at://p',
      'https://bsky.app/x',
    ]);
  });

  it('shows a purchase’s exact revision as the hosts do', () => {
    const shown = readPapPurchase('gateway__pap_confirm', {
      company: 'shop.example',
      company_name: 'Shop',
      summary: 'Two boots',
      terms: { total: 'EUR 160' },
      differences: [],
      operation_ref: 'op-1',
      revision: 'r2',
      expires_at: '2026-11-15T12:00:00Z',
      digest: 'abc',
    });
    expect(shown.fields.map(field => field.label)).toEqual(
      expect.arrayContaining([
        'Company',
        'Summary',
        'total',
        'Revision',
        'Holds until',
      ]),
    );
  });
});

describe('the title bar’s chips', () => {
  it('Link LinkedIn shows while LinkedIn is not linked or lapsed, never once linked', () => {
    expect(linkedInAsks({})).toBe('link');
    expect(linkedInAsks({ linkedin: { linked: false } })).toBe('link');
    expect(linkedInAsks({ linkedin: { linked: true, reconnect: true } })).toBe(
      'reconnect',
    );
    expect(linkedInAsks({ linkedin: { linked: true } })).toBe('none');
  });

  it('the X budget left is read from the guardrail, the spec’s budgets under it', () => {
    const budget = {
      id: 'x-api-budget',
      provider: 'x',
      currency: 'USD',
      prices: {},
      budgets: { per_person_daily: 0.5, per_person_monthly: 5 },
    };
    expect(xBudgetLeft(budget, { today: { micros: 180_000 } })?.short).toBe(
      'X: USD 0.32 left today',
    );
    expect(xBudgetLeft(budget, { today: { micros: 500_000 } })?.state).toBe(
      'today',
    );
    expect(
      xBudgetLeft(budget, {
        month: { micros: 5_000_000 },
        month_resets_at: '2026-12-01T00:00:00Z',
      })?.sentence,
    ).toContain('2026-12-01');
    expect(xBudgetLeft(budget, { platform_used_up: true })?.state).toBe(
      'platform',
    );
  });
});

describe('the Stripe checkout card (test mode)', () => {
  const created = {
    id: 'cs_test_a1',
    object: 'checkout.session',
    livemode: false,
    url: 'https://checkout.stripe.com/c/pay/cs_test_a1',
    currency: 'eur',
    amount_total: 16000,
    status: 'open',
    payment_status: 'unpaid',
  };
  const asked = {
    method: 'POST',
    path: '/v1/checkout/sessions',
    params: {
      mode: 'payment',
      line_items: [
        {
          quantity: 2,
          price_data: {
            currency: 'eur',
            unit_amount: 8000,
            product_data: { name: 'Boots' },
          },
        },
      ],
    },
  };

  it('reads a session from Stripe’s answer, MCP text content included, and its lines from the call', () => {
    const session = readCheckoutSession(asked, {
      content: [{ type: 'text', text: JSON.stringify(created) }],
    });
    expect(session).toMatchObject({
      id: 'cs_test_a1',
      currency: 'EUR',
      total: 160,
      status: 'open',
      testMode: true,
    });
    expect(session?.lines).toEqual([
      { name: 'Boots', quantity: 2, total: 160 },
    ]);
    expect(
      readCheckoutSession({}, { object: 'customer', id: 'cus_1' }),
    ).toBeNull();
  });

  it('offers Checkout only for an open test-mode session on Stripe’s page', () => {
    const session = readCheckoutSession(asked, created)!;
    const json = JSON.stringify(checkoutSurface(session, 'catalog'));
    expect(json).toContain(STRIPE_CHECKOUT_ACTION);
    expect(json).toContain('Test mode');
    const live = readCheckoutSession(asked, {
      ...created,
      id: 'cs_live_1',
      livemode: true,
    })!;
    expect(live.testMode).toBe(false);
    expect(JSON.stringify(checkoutSurface(live, 'catalog'))).not.toContain(
      STRIPE_CHECKOUT_ACTION,
    );
    const elsewhere = readCheckoutSession(asked, {
      ...created,
      url: 'https://evil.example/pay',
    })!;
    expect(elsewhere.url).toBe('');
  });

  it('says paid or expired when the person is back', () => {
    expect(
      readCheckoutSession(
        {},
        { ...created, status: 'complete', payment_status: 'paid' },
      )?.status,
    ).toBe('paid');
    expect(
      readCheckoutSession({}, { ...created, status: 'expired' })?.status,
    ).toBe('expired');
  });
});
