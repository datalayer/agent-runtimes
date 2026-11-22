/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/agent-plugin-trial-balance` — the Accountant's trial balance
 * for a period: each account's debit, credit and balance, the totals summed
 * here and whether they agree. Draws `show_trial_balance`.
 *
 * @module apps/plugins/trial-balance
 */

import type { JSX } from 'react';
import { Box } from '@datalayer/primer-addons';
import { Text } from '@primer/react';
import type { ToolCallRenderContext } from '../../../types/chat';
import {
  CardFrame,
  CardSkeleton,
  CardTable,
  cardData,
  defineToolCardPlugin,
  money,
} from '../../toolCards/kit';
import { readTrialBalance, type TrialBalanceAccount } from './read';

export const TRIAL_BALANCE_PLUGIN_NAME =
  '@datalayer/agent-plugin-trial-balance';

export const TRIAL_BALANCE_WORDS = {
  title: (period: string) =>
    period ? `Trial balance, ${period}` : 'Trial balance',
  writing: 'Reading the balances…',
  totals: 'Totals',
  balanced: 'Debits and credits agree.',
  unbalanced: (gap: string) => `Debits and credits differ by ${gap}.`,
} as const;

export function TrialBalanceCard({
  context,
}: {
  context: ToolCallRenderContext;
}): JSX.Element {
  const read = cardData(context);
  if (!read) {
    return <>{context.defaultUI}</>;
  }
  const balance = readTrialBalance(read.data);
  if (balance.accounts.length === 0) {
    return read.done ? (
      <>{context.defaultUI}</>
    ) : (
      <CardSkeleton label={TRIAL_BALANCE_WORDS.writing} />
    );
  }
  const { currency } = balance;
  return (
    <CardFrame title={TRIAL_BALANCE_WORDS.title(balance.period)} maxWidth={720}>
      <CardTable<TrialBalanceAccount>
        caption={`${balance.accounts.length} accounts`}
        rows={balance.accounts}
        rowKey={(row, index) => `${row.code}-${index}`}
        columns={[
          { key: 'code', title: 'Account', cell: row => row.code },
          { key: 'name', title: 'Name', cell: row => row.name },
          {
            key: 'debit',
            title: 'Debit',
            align: 'right',
            cell: row => money(row.debit, ''),
          },
          {
            key: 'credit',
            title: 'Credit',
            align: 'right',
            cell: row => money(row.credit, ''),
          },
          {
            key: 'balance',
            title: 'Balance',
            align: 'right',
            cell: row => money(row.balance, ''),
          },
        ]}
        footer={
          <tr>
            <Box
              as="td"
              colSpan={2}
              px={2}
              py={1}
              sx={{ fontWeight: 'bold', fontSize: 1 }}
            >
              {TRIAL_BALANCE_WORDS.totals}
            </Box>
            <Box
              as="td"
              px={2}
              py={1}
              sx={{ textAlign: 'right', fontWeight: 'bold', fontSize: 1 }}
            >
              {money(balance.debit, currency)}
            </Box>
            <Box
              as="td"
              px={2}
              py={1}
              sx={{ textAlign: 'right', fontWeight: 'bold', fontSize: 1 }}
            >
              {money(balance.credit, currency)}
            </Box>
            <Box as="td" />
          </tr>
        }
      />
      <Text
        as="p"
        sx={{
          mt: 2,
          mb: 0,
          fontSize: 1,
          color: balance.balanced ? 'success.fg' : 'danger.fg',
        }}
      >
        {balance.balanced
          ? TRIAL_BALANCE_WORDS.balanced
          : TRIAL_BALANCE_WORDS.unbalanced(
              money(Math.abs(balance.debit - balance.credit), currency),
            )}
      </Text>
    </CardFrame>
  );
}

export const TrialBalancePlugin = defineToolCardPlugin({
  id: 'trial-balance',
  displayName: 'Trial balance',
  description:
    'Each account’s debit, credit and balance for a period, with the totals and whether they agree.',
  octicon: 'law',
  emoji: '\u{2696}\u{FE0F}',
  tools: ['show_trial_balance'],
  Card: TrialBalanceCard,
});

export {
  readTrialBalance,
  type TrialBalance,
  type TrialBalanceAccount,
} from './read';
export default TrialBalancePlugin;
