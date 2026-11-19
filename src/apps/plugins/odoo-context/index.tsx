/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-odoo-context` — the Odoo company the Accountant
 * works in and the period it reads, in the chat's title bar: the company as
 * Odoo answered it (`odoo_get_context`, with or without the gateway's
 * prefix), the period of the last trial balance or VAT it showed. Nothing
 * until Odoo or a card said it. Brought by the `odoo` and `odoo-accounting`
 * servers.
 *
 * @module apps/plugins/odoo-context
 */

import type { JSX } from 'react';
import { Chip, defineChromePlugin } from '../../toolCards/chrome';
import { useLatestToolCall } from '../../toolCards/toolResults';
import { record, words } from '../../toolCards/kit';

/** The tools that say the company. */
export const ODOO_CONTEXT_TOOLS = ['odoo_get_context'];
/** The cards that say the period. */
export const ODOO_PERIOD_TOOLS = ['show_trial_balance', 'show_vat_summary'];

export const ODOO_CONTEXT_WORDS = {
  short: (parts: string[]) => `Odoo: ${parts.join(' · ')}`,
  title: (company: string, period: string) =>
    [
      company ? `Odoo company: ${company}` : '',
      period ? `Period: ${period}` : '',
    ]
      .filter(Boolean)
      .join('. ') + '.',
} as const;

/** The company Odoo answered, from its context. */
export function odooCompanyOf(result: unknown): string {
  const answer = record(result);
  if (!answer) {
    return '';
  }
  const company = record(answer.company);
  return (
    words(company?.name) ||
    words(answer.company_name) ||
    words(answer.company) ||
    words(record(answer.context)?.company_name)
  );
}

/** The period a trial balance or a VAT card said. */
export function odooPeriodOf(
  call: { args: Record<string, unknown>; result: unknown } | undefined,
): string {
  if (!call) {
    return '';
  }
  return words(record(call.result)?.period) || words(call.args.period);
}

export function OdooContextChip(): JSX.Element | null {
  const company = odooCompanyOf(useLatestToolCall(ODOO_CONTEXT_TOOLS)?.result);
  const period = odooPeriodOf(useLatestToolCall(ODOO_PERIOD_TOOLS));
  if (!company && !period) {
    return null;
  }
  return (
    <Chip title={ODOO_CONTEXT_WORDS.title(company, period)} data="odoo-context">
      {ODOO_CONTEXT_WORDS.short([company, period].filter(Boolean))}
    </Chip>
  );
}

export const odooContextPlugin = defineChromePlugin({
  id: 'odoo-context',
  displayName: 'Odoo company and period',
  description:
    'The Odoo company the agent works in and the period it reads, in the chat’s title bar.',
  octicon: 'briefcase',
  emoji: '\u{1F3E2}',
  Component: OdooContextChip,
});

export const OdooContextPlugin = odooContextPlugin('header');
export default OdooContextPlugin;
