/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Traveller's trip budget (`show_trip_budget`), read. Pure.
 *
 * @module apps/plugins/trip-budget/read
 */

import { amount, records, words, type Data } from '../../toolCards/kit';

export type TripBudgetLine = {
  label: string;
  category: string;
  amount: number;
  /** Whether the price is a quote read, or the agent's estimate. */
  estimate: boolean;
};

export type TripBudget = {
  currency: string;
  lines: TripBudgetLine[];
  /** Summed here. */
  total: number;
  /** What the person said they would spend, when they said it. */
  budget?: number;
  /** Budget less total, when there is a budget. */
  left?: number;
};

const cents = (value: number): number => Math.round(value * 100) / 100;

export function readTripBudget(data: Data): TripBudget {
  const lines = records(data.lines)
    .map(line => ({
      label: words(line.label),
      category: words(line.category),
      amount: amount(line.amount) ?? 0,
      estimate: line.estimate === true,
    }))
    .filter(line => line.label);
  const total = cents(lines.reduce((sum, line) => sum + line.amount, 0));
  const budget = amount(data.budget);
  return {
    currency: words(data.currency),
    lines,
    total,
    budget,
    left: budget === undefined ? undefined : cents(budget - total),
  };
}
