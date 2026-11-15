/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What is left of the person's X budget, read where the Marketer's
 * `x-api-budget` guardrail keeps it (agent-runtimes 1.6.58's
 * `ApiBudgetCapability`; the runtimes service's
 * `/api/runtimes/v1/api-budgets/x-api-budget/mine`). Nothing is counted
 * here: the guardrail counts and refuses, this only reads it back. The
 * budgets are the spec's (`guardrails[].api_budget`, `apiBudgetOf`). Pure.
 *
 * @module apps/plugins/x-budget/xBudget
 */

import { AGENTSPECS } from '../../../specs/agents';
import { apiBudgetOf, type AgentApiBudget } from '../../../types/guardrails';

/** The guardrail's id, in the spec and in the counters' keys. */
export const X_BUDGET_ID = 'x-api-budget';

const MICROS = 1_000_000;

/** The X budget of the first spec that declares it (the Marketer's). */
export function xBudgetOfCatalogue(
  specId?: string,
): AgentApiBudget | undefined {
  if (specId) {
    return apiBudgetOf(AGENTSPECS[specId]?.guardrails, X_BUDGET_ID);
  }
  for (const spec of Object.values(AGENTSPECS)) {
    const budget = apiBudgetOf(spec.guardrails, X_BUDGET_ID);
    if (budget) {
      return budget;
    }
  }
  return undefined;
}

type Spend = { micros?: number; limit_micros?: number | null };

/** The runtimes service's answer. */
export type XBudgetAnswer = {
  today?: Spend;
  month?: Spend;
  day_resets_at?: string;
  month_resets_at?: string;
  platform_used_up?: boolean;
};

export type XBudgetLeft = {
  /** `left`, or why nothing is: `today`, `month`, `platform`. */
  state: 'left' | 'today' | 'month' | 'platform';
  /** What is left today, in the currency. */
  leftToday?: number;
  daily?: number;
  currency: string;
  /** The whole sentence, for the chip's title and a screen reader. */
  sentence: string;
  /** The chip's few words. */
  short: string;
};

const money = (value: number, currency: string): string =>
  `${currency} ${value.toFixed(value !== 0 && value < 0.01 ? 3 : 2)}`;

/** What is left, from the spec's budgets and what was spent; undefined without a daily or monthly budget. */
export function xBudgetLeft(
  budget: AgentApiBudget | undefined,
  answer: XBudgetAnswer,
): XBudgetLeft | undefined {
  if (!budget) {
    return undefined;
  }
  const currency = String(budget.currency || 'USD');
  const daily =
    typeof answer.today?.limit_micros === 'number'
      ? answer.today.limit_micros / MICROS
      : budget.budgets?.per_person_daily;
  const monthly =
    typeof answer.month?.limit_micros === 'number'
      ? answer.month.limit_micros / MICROS
      : budget.budgets?.per_person_monthly;
  const today = Number(answer.today?.micros ?? 0) / MICROS;
  const month = Number(answer.month?.micros ?? 0) / MICROS;
  const monthResets = String(answer.month_resets_at ?? '').slice(0, 10);
  if (answer.platform_used_up) {
    return {
      state: 'platform',
      currency,
      sentence: `Datalayer's X budget for this month is used up for everyone; it resets on ${monthResets}.`,
      short: 'X paused',
    };
  }
  if (monthly !== undefined && month >= monthly) {
    return {
      state: 'month',
      currency,
      sentence: `Your X budget for this month (${money(monthly, currency)}) is used up; it resets on ${monthResets}.`,
      short: 'X: month used up',
    };
  }
  if (daily === undefined) {
    return undefined;
  }
  const leftToday = Math.max(0, Math.round((daily - today) * MICROS) / MICROS);
  if (leftToday === 0) {
    return {
      state: 'today',
      currency,
      leftToday,
      daily,
      sentence: `Today's X budget (${money(daily, currency)}) is used up; it resets at 00:00 UTC.`,
      short: 'X: today used up',
    };
  }
  return {
    state: 'left',
    currency,
    leftToday,
    daily,
    sentence: `${money(leftToday, currency)} of today's ${money(daily, currency)} X budget left; it resets at 00:00 UTC.`,
    short: `X: ${money(leftToday, currency)} left today`,
  };
}

/** Where the person's own spend is read. */
export function xBudgetUrl(runtimesUrl: string): string {
  return `${runtimesUrl.replace(/\/$/, '')}/api/runtimes/v1/api-budgets/${X_BUDGET_ID}/mine`;
}
