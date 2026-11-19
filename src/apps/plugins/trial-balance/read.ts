/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Accountant's trial balance (`show_trial_balance`), read. Pure.
 *
 * @module apps/plugins/trial-balance/read
 */

import { amount, records, words, type Data } from '../../toolCards/kit';

export type TrialBalanceAccount = {
  code: string;
  name: string;
  debit: number;
  credit: number;
  /** Debit less credit. */
  balance: number;
};

export type TrialBalance = {
  period: string;
  currency: string;
  accounts: TrialBalanceAccount[];
  debit: number;
  credit: number;
  /** Whether the debits and the credits agree, to the cent. */
  balanced: boolean;
};

const cents = (value: number): number => Math.round(value * 100) / 100;

export function readTrialBalance(data: Data): TrialBalance {
  const accounts = records(data.accounts)
    .map(account => {
      const debit = amount(account.debit) ?? 0;
      const credit = amount(account.credit) ?? 0;
      return {
        code: words(account.code),
        name: words(account.name),
        debit,
        credit,
        balance: cents(debit - credit),
      };
    })
    .filter(account => account.code || account.name);
  const debit = cents(
    accounts.reduce((sum, account) => sum + account.debit, 0),
  );
  const credit = cents(
    accounts.reduce((sum, account) => sum + account.credit, 0),
  );
  return {
    period: words(data.period),
    currency: words(data.currency),
    accounts,
    debit,
    credit,
    balanced: Math.abs(debit - credit) < 0.005,
  };
}
