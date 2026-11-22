/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/agent-plugin-bank-reconciliation` — the Accountant's proposed
 * matches, as a message drawn by the A2UI renderer: each bank line beside the
 * invoice it would settle, the difference computed here, how sure the agent
 * is, and **Approve** per match. Each press sends that match back as the
 * person's next turn; nothing is reconciled in Odoo before. Draws
 * `show_reconciliation`.
 *
 * @module apps/plugins/bank-reconciliation
 */

import type { JSX } from 'react';
import { useState } from 'react';
import type { A2uiClientAction } from '@a2ui/web_core/v0_9';
import type { ToolCallRenderContext } from '../../../types/chat';
import {
  CardSkeleton,
  cardData,
  defineToolCardPlugin,
  money,
  submitCard,
  useToolCardSend,
} from '../../toolCards/kit';
import { A2uiCard, type CardSpec } from '../../toolCards/a2uiCard';
import { readReconciliation, type Reconciliation } from './read';

export const BANK_RECONCILIATION_PLUGIN_NAME =
  '@datalayer/agent-plugin-bank-reconciliation';

export const BANK_RECONCILIATION_WORDS = {
  title: 'Bank lines and invoices',
  subtitle:
    'Approve each match you agree with. Nothing is reconciled in Odoo before you do.',
  writing: 'Matching bank lines…',
  noMatch: 'No invoice',
  approve: 'Approve',
  approved: 'Approved: sent to the agent.',
  confidence: (confidence: string) => `Confidence: ${confidence}`,
  difference: (difference: string) => `Difference: ${difference}`,
  form: 'Reconciliation',
} as const;

/** The action each **Approve** sends. */
export const APPROVE_MATCH_ACTION = 'approve_match';

/** The reconciliation as an A2UI card: one section per bank line. */
export function reconciliationCard(
  reconciliation: Reconciliation,
  id: string,
  options: { approve?: boolean; approved?: ReadonlySet<string> } = {},
): CardSpec {
  const { currency } = reconciliation;
  return {
    id: `reconciliation-${id}`,
    title: BANK_RECONCILIATION_WORDS.title,
    captions: [BANK_RECONCILIATION_WORDS.subtitle],
    sections: reconciliation.lines.map(line => ({
      id: line.id,
      title: `${line.date ? `${line.date} · ` : ''}${line.label} · ${money(line.amount, currency)}`,
      lines: [
        line.invoice
          ? `${line.invoice}${line.partner ? ` · ${line.partner}` : ''} · ${money(line.invoiceAmount, currency)}`
          : BANK_RECONCILIATION_WORDS.noMatch,
        ...(line.difference !== undefined && line.difference !== 0
          ? [
              BANK_RECONCILIATION_WORDS.difference(
                money(line.difference, currency),
              ),
            ]
          : []),
        ...(line.confidence
          ? [BANK_RECONCILIATION_WORDS.confidence(line.confidence)]
          : []),
        ...(options.approved?.has(line.id)
          ? [BANK_RECONCILIATION_WORDS.approved]
          : []),
      ],
      actions:
        options.approve && line.invoice && !options.approved?.has(line.id)
          ? [
              {
                name: APPROVE_MATCH_ACTION,
                label: BANK_RECONCILIATION_WORDS.approve,
                context: { line: line.id, invoice: line.invoice },
                primary: true,
              },
            ]
          : [],
    })),
  };
}

export function BankReconciliationCard({
  context,
}: {
  context: ToolCallRenderContext;
}): JSX.Element {
  const send = useToolCardSend();
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const read = cardData(context);
  if (!read) {
    return <>{context.defaultUI}</>;
  }
  const reconciliation = readReconciliation(read.data);
  if (reconciliation.lines.length === 0) {
    return read.done ? (
      <>{context.defaultUI}</>
    ) : (
      <CardSkeleton label={BANK_RECONCILIATION_WORDS.writing} />
    );
  }
  const onAction = (action: A2uiClientAction) => {
    const lineId = String((action.context ?? {}).line ?? '');
    const line = reconciliation.lines.find(each => each.id === lineId);
    if (action.name !== APPROVE_MATCH_ACTION || !line || !send) {
      return;
    }
    if (
      submitCard(send, {
        title: BANK_RECONCILIATION_WORDS.form,
        values: { approved: [line.id], invoice: line.invoice },
      })
    ) {
      setApproved(current => new Set(current).add(line.id));
    }
  };
  return (
    <A2uiCard
      spec={reconciliationCard(reconciliation, context.toolCallId, {
        approve: Boolean(send) && read.done,
        approved,
      })}
      onAction={onAction}
      maxWidth={720}
    />
  );
}

export const BankReconciliationPlugin = defineToolCardPlugin({
  id: 'bank-reconciliation',
  displayName: 'Bank reconciliation',
  description:
    'Bank lines beside the invoices they would settle, with the difference; the person approves each match.',
  octicon: 'git-compare',
  emoji: '\u{1F9FE}',
  tools: ['show_reconciliation'],
  Card: BankReconciliationCard,
});

export {
  readReconciliation,
  reconciliationDecision,
  type Reconciliation,
  type ReconciliationLine,
} from './read';
export default BankReconciliationPlugin;
