/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-stripe-checkout` — a Stripe Checkout Session the
 * agent created through Stripe's MCP server, drawn with the A2UI renderer
 * (the chat's A2UI catalogue, `InlineSurface`): its line items, total and
 * currency, test mode said. Brought by the `stripe` MCP server (the user,
 * 15 November 2026).
 *
 * - The session exists only once the person approved `stripe_api_write`
 *   (classed `write`, asked first: the chat's approval row, drawn under the
 *   card while it waits).
 * - **Checkout** opens Stripe's own page (`https://checkout.stripe.com/…`) in
 *   a new tab: the person pays there; no card data is typed in the chat.
 * - Back on the chat, **Check the payment** asks the agent to read the
 *   session (`stripe_api_read`), whose answer this card draws with its status:
 *   paid, waiting for payment, or expired.
 * - Test mode only: a live session is said and offers no Checkout.
 *
 * Any other Stripe call keeps the chat's own row.
 *
 * @module apps/plugins/stripe-checkout
 */

import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Box } from '@datalayer/primer-addons';
import type { A2uiClientAction } from '@a2ui/web_core/v0_9';
import type { ToolCallRenderContext } from '../../../types/chat';
import {
  InlineSurface,
  SURFACE_CATALOG_ID,
} from '../a2ui-surface/InlineSurface';
import { defineToolCardPlugin, useToolCardSend } from '../../toolCards/kit';
import {
  STRIPE_CHECK_ACTION,
  STRIPE_CHECKOUT_ACTION,
  STRIPE_CHECKOUT_WORDS,
  checkoutSurface,
  readCheckoutSession,
} from './read';

export const STRIPE_CHECKOUT_PLUGIN_NAME =
  '@datalayer/loop-plugin-stripe-checkout';

export function StripeCheckoutCard({
  context,
}: {
  context: ToolCallRenderContext;
}): JSX.Element {
  const send = useToolCardSend();
  const [opened, setOpened] = useState(false);
  const [returned, setReturned] = useState(false);
  const session = useMemo(
    () =>
      context.status === 'complete'
        ? readCheckoutSession(context.args, context.result)
        : null,
    [context.status, context.args, context.result],
  );
  // Back from Stripe's tab: offer to read the session again.
  useEffect(() => {
    if (!opened || returned || typeof document === 'undefined') {
      return undefined;
    }
    const back = () => {
      if (document.visibilityState === 'visible') {
        setReturned(true);
      }
    };
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);
    return () => {
      document.removeEventListener('visibilitychange', back);
      window.removeEventListener('focus', back);
    };
  }, [opened, returned]);
  if (!session) {
    return <>{context.defaultUI}</>;
  }
  const onAction = (action: A2uiClientAction) => {
    if (
      action.name === STRIPE_CHECKOUT_ACTION &&
      session.url &&
      session.testMode
    ) {
      window.open(session.url, '_blank', 'noopener,noreferrer');
      setOpened(true);
    } else if (action.name === STRIPE_CHECK_ACTION && send) {
      send(STRIPE_CHECKOUT_WORDS.checkMessage(session.id));
    }
  };
  return (
    <Box
      my={2}
      width="100%"
      maxWidth={480}
      data-stripe-checkout={session.status}
      data-stripe-test-mode={session.testMode ? 'yes' : 'no'}
    >
      <InlineSurface
        // Another surface once the person is back: Check the payment.
        key={`${session.id}-${returned ? 'returned' : 'first'}`}
        messages={checkoutSurface(session, SURFACE_CATALOG_ID, { returned })}
        onAction={onAction}
      />
    </Box>
  );
}

export const StripeCheckoutPlugin = defineToolCardPlugin({
  id: 'stripe-checkout',
  displayName: 'Stripe checkout',
  description:
    'A Stripe Checkout Session as an A2UI card: its lines, total and currency; Checkout opens Stripe’s page; its status when the person is back. Test mode only.',
  octicon: 'credit-card',
  emoji: '\u{1F4B3}',
  tools: ['stripe_api_write', 'stripe_api_read'],
  Card: StripeCheckoutCard,
});

export * from './read';
export default StripeCheckoutPlugin;
