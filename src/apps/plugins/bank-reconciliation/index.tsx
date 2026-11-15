/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-bank-reconciliation` — the Accountant's proposed
 * matches: each bank line beside the invoice it would settle, the
 * difference computed here, and how sure the agent is. The person ticks the
 * matches they approve and sends them back as their next turn; nothing is
 * reconciled in Odoo before that. Draws `show_reconciliation`.
 *
 * @module apps/plugins/bank-reconciliation
 */

import type { JSX } from 'react';
import { useState } from 'react';
import { Button, Checkbox, Label, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import type { ToolCallRenderContext } from '../../../types/chat';
import {
  CardFrame,
  CardSkeleton,
  CardTable,
  cardData,
  defineToolCardPlugin,
  money,
  submitCard,
  useToolCardSend,
} from '../../toolCards/kit';
import {
  readReconciliation,
  reconciliationDecision,
  type ReconciliationLine,
} from './read';

export const BANK_RECONCILIATION_PLUGIN_NAME =
  '@datalayer/loop-plugin-bank-reconciliation';

export const BANK_RECONCILIATION_WORDS = {
  title: 'Bank lines and invoices',
  subtitle:
    'Tick the matches you approve. Nothing is reconciled in Odoo before you send them.',
  writing: 'Matching bank lines…',
  noMatch: 'No invoice',
  approve: (count: number) =>
    count === 1 ? 'Approve 1 match' : `Approve ${count} matches`,
  sent: 'Sent: the agent reconciles what you approved.',
  form: 'Reconciliation',
} as const;

const CONFIDENCE_VARIANT = {
  high: 'success',
  medium: 'attention',
  low: 'danger',
} as const;

export function BankReconciliationCard({
  context,
}: {
  context: ToolCallRenderContext;
}): JSX.Element {
  const send = useToolCardSend();
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [sent, setSent] = useState(false);
  const read = cardData(context);
  if (!read) {
    return <>{context.defaultUI}</>;
  }
  const { currency, lines } = readReconciliation(read.data);
  if (lines.length === 0) {
    return read.done ? (
      <>{context.defaultUI}</>
    ) : (
      <CardSkeleton label={BANK_RECONCILIATION_WORDS.writing} />
    );
  }
  const toggle = (id: string) =>
    setApproved(current => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  const decision = reconciliationDecision(lines, approved);
  return (
    <CardFrame
      title={BANK_RECONCILIATION_WORDS.title}
      subtitle={BANK_RECONCILIATION_WORDS.subtitle}
      maxWidth={800}
    >
      <CardTable<ReconciliationLine>
        caption={`${lines.length} bank lines`}
        rows={lines}
        rowKey={row => row.id}
        columns={[
          {
            key: 'approve',
            title: 'Approve',
            align: 'center',
            cell: row =>
              row.invoice ? (
                <Checkbox
                  aria-label={`Approve ${row.label} against ${row.invoice}`}
                  checked={approved.has(row.id)}
                  disabled={sent || !read.done}
                  onChange={() => toggle(row.id)}
                />
              ) : null,
          },
          { key: 'date', title: 'Date', cell: row => row.date },
          { key: 'label', title: 'Bank line', cell: row => row.label },
          {
            key: 'amount',
            title: 'Amount',
            align: 'right',
            cell: row => money(row.amount, currency),
          },
          {
            key: 'invoice',
            title: 'Invoice',
            cell: row =>
              row.invoice ? (
                <>
                  {row.invoice}
                  {row.partner ? (
                    <Text as="div" sx={{ color: 'fg.muted', fontSize: 0 }}>
                      {row.partner}
                    </Text>
                  ) : null}
                </>
              ) : (
                <Text sx={{ color: 'fg.muted' }}>
                  {BANK_RECONCILIATION_WORDS.noMatch}
                </Text>
              ),
          },
          {
            key: 'difference',
            title: 'Difference',
            align: 'right',
            cell: row =>
              row.difference === undefined ? (
                ''
              ) : (
                <Text
                  sx={{
                    color: row.difference === 0 ? 'fg.default' : 'attention.fg',
                  }}
                >
                  {money(row.difference, currency)}
                </Text>
              ),
          },
          {
            key: 'confidence',
            title: 'Confidence',
            cell: row =>
              row.confidence ? (
                <Label
                  variant={
                    CONFIDENCE_VARIANT[
                      row.confidence as keyof typeof CONFIDENCE_VARIANT
                    ]
                  }
                >
                  {row.confidence}
                </Label>
              ) : null,
          },
        ]}
      />
      {send && read.done ? (
        <Box mt={2} display="flex" alignItems="center" gap={2}>
          {sent ? (
            <Text sx={{ fontSize: 1, color: 'success.fg' }}>
              {BANK_RECONCILIATION_WORDS.sent}
            </Text>
          ) : (
            <Button
              variant="primary"
              disabled={decision.approved.length === 0}
              onClick={() =>
                setSent(
                  submitCard(send, {
                    title: BANK_RECONCILIATION_WORDS.form,
                    values: decision,
                  }),
                )
              }
            >
              {BANK_RECONCILIATION_WORDS.approve(decision.approved.length)}
            </Button>
          )}
        </Box>
      ) : null}
    </CardFrame>
  );
}

export const BankReconciliationPlugin = defineToolCardPlugin({
  id: 'bank-reconciliation',
  displayName: 'Bank reconciliation',
  description:
    'Bank lines beside the invoices they would settle, with the difference; the person approves the matches.',
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
