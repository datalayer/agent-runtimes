/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Steward's recommendations as `list_recommendations` answers them
 * (`agent_runtimes.tools.recommendations`), read. Pure.
 *
 * @module apps/plugins/aws-savings/read
 */

import { amount, record, records, words, type Data } from '../../toolCards/kit';

export type SavingEvidence = { source: string; call: string; readAt: string };

export type Saving = {
  id: string;
  kind: string;
  category: string;
  finding: string;
  service: string;
  region: string;
  arn: string;
  monthlySaving?: number;
  /** `aws` when the figure is AWS's estimate, `datalayer` when computed. */
  by: string;
  confidence: string;
  severity: string;
  state: string;
  evidence: SavingEvidence[];
};

export type Savings = {
  savings: Saving[];
  /** The sum of the estimated monthly savings, summed here. */
  monthly: number;
};

export function readSavings(data: Data): Savings {
  const savings = records(data.recommendations)
    .map(item => {
      const resource = record(item.resource) ?? {};
      const estimate = record(item.estimate) ?? {};
      return {
        id: words(item.id),
        kind: words(item.kind),
        category: words(item.category),
        finding: words(item.finding),
        service: words(resource.service),
        region: words(resource.region),
        arn: words(resource.arn),
        monthlySaving: amount(estimate.monthly_saving_usd),
        by: words(estimate.by),
        confidence: words(item.confidence),
        severity: words(item.severity),
        state: words(item.state) || 'open',
        evidence: records(item.evidence).map(read => ({
          source: words(read.source),
          call: words(read.call),
          readAt: words(read.read_at),
        })),
      };
    })
    .filter(saving => saving.finding)
    .sort((a, b) => (b.monthlySaving ?? 0) - (a.monthlySaving ?? 0));
  return {
    savings,
    monthly:
      Math.round(
        savings.reduce((sum, saving) => sum + (saving.monthlySaving ?? 0), 0) *
          100,
      ) / 100,
  };
}
