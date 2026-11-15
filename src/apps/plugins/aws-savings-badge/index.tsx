/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-aws-savings-badge` — the savings the Steward found
 * in this session, in the chat's title bar: the estimated monthly sum and the
 * AWS account, from the last `list_recommendations`, else summed over the
 * recommendations recorded (`record_recommendation`). Nothing before one.
 * Brought by the recommendation tools.
 *
 * @module apps/plugins/aws-savings-badge
 */

import type { JSX } from 'react';
import { Chip, defineChromePlugin } from '../../toolCards/chrome';
import { useLatestToolCall, useToolCalls } from '../../toolCards/toolResults';
import { amount, money, record, words } from '../../toolCards/kit';
import { readSavings } from '../aws-savings/read';

export const AWS_SAVINGS_BADGE_WORDS = {
  short: (monthly: string, account: string) =>
    `Savings: ${monthly}/month${account ? ` · ${account}` : ''}`,
  title: (monthly: string, count: number, account: string) =>
    `${count} ${count === 1 ? 'recommendation' : 'recommendations'} found in this session, ${monthly} a month estimated${account ? `, in AWS account ${account}` : ''}. Nothing is changed in the account.`,
} as const;

type Call = { args: Record<string, unknown>; result: unknown };

/** The sum, the count and the account; undefined before any recommendation. */
export function savingsFoundOf(
  listed: Call | undefined,
  recorded: readonly Call[],
): { monthly: number; count: number; account: string } | undefined {
  const accountOf = (recommendation: unknown): string =>
    words(record(record(recommendation)?.resource)?.account);
  if (listed) {
    const said = record(listed.result);
    if (said) {
      const { savings, monthly } = readSavings(said);
      if (savings.length > 0) {
        const raw = Array.isArray(said.recommendations)
          ? said.recommendations
          : [];
        return {
          monthly,
          count: savings.length,
          account: raw.map(accountOf).find(Boolean) ?? '',
        };
      }
    }
  }
  const kept = recorded
    .map(call => record(record(call.result)?.recommendation))
    .filter((each): each is Record<string, unknown> => each !== null);
  if (kept.length === 0) {
    return undefined;
  }
  return {
    monthly:
      Math.round(
        kept.reduce(
          (sum, each) =>
            sum + (amount(record(each.estimate)?.monthly_saving_usd) ?? 0),
          0,
        ) * 100,
      ) / 100,
    count: kept.length,
    account: kept.map(accountOf).find(Boolean) ?? '',
  };
}

export function AwsSavingsBadge(): JSX.Element | null {
  const found = savingsFoundOf(
    useLatestToolCall(['list_recommendations']),
    useToolCalls(['record_recommendation']),
  );
  if (!found) {
    return null;
  }
  const monthly = money(found.monthly, 'USD');
  return (
    <Chip
      title={AWS_SAVINGS_BADGE_WORDS.title(monthly, found.count, found.account)}
      data="aws-savings-badge"
    >
      {AWS_SAVINGS_BADGE_WORDS.short(monthly, found.account)}
    </Chip>
  );
}

export const awsSavingsBadgePlugin = defineChromePlugin({
  id: 'aws-savings-badge',
  displayName: 'Savings found',
  description:
    'This session’s estimated monthly savings and the AWS account they were found in, in the chat’s title bar.',
  octicon: 'graph',
  emoji: '\u{1F4B8}',
  Component: AwsSavingsBadge,
});

export const AwsSavingsBadgePlugin = awsSavingsBadgePlugin('header');
export default AwsSavingsBadgePlugin;
