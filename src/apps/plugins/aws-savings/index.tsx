/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/agent-plugin-aws-savings` — the Steward's savings, largest
 * first, as a message drawn by the A2UI renderer: each finding with its
 * resource, the estimated monthly saving and whose estimate it is, its state,
 * and the reads it rests on; their sum at the top. Draws
 * `list_recommendations`, which the Steward ends a scan with. Each
 * recommendation's own card (Approve, Dismiss) is the A2UI surface
 * `record_recommendation` draws (`a2ui-surface`).
 *
 * @module apps/plugins/aws-savings
 */

import type { JSX } from 'react';
import type { ToolCallRenderContext } from '../../../types/chat';
import {
  CardSkeleton,
  cardData,
  defineToolCardPlugin,
  money,
} from '../../toolCards/kit';
import { A2uiCard, type CardSpec } from '../../toolCards/a2uiCard';
import { readSavings, type Savings } from './read';

export const AWS_SAVINGS_PLUGIN_NAME = '@datalayer/agent-plugin-aws-savings';

export const AWS_SAVINGS_WORDS = {
  title: 'Savings',
  writing: 'Listing the recommendations…',
  total: (monthly: string, count: number) =>
    `${monthly} a month across ${count} ${count === 1 ? 'recommendation' : 'recommendations'}`,
  perMonth: (saving: string) => `${saving} / month`,
  by: (by: string) =>
    by === 'aws' ? 'AWS’s estimate' : 'Datalayer’s estimate',
  read: (source: string, call: string, at: string) =>
    `Read from ${source} (${call})${at ? ` at ${at}` : ''}`,
  none: 'No recommendation recorded yet.',
  changesNothing: 'The Steward changes nothing in your account.',
} as const;

/** The savings as an A2UI card: a section per recommendation, largest first. */
export function savingsCard(
  { savings, monthly }: Savings,
  id: string,
): CardSpec {
  return {
    id: `savings-${id}`,
    title: AWS_SAVINGS_WORDS.title,
    captions: [
      savings.length > 0
        ? AWS_SAVINGS_WORDS.total(money(monthly, 'USD'), savings.length)
        : AWS_SAVINGS_WORDS.none,
      AWS_SAVINGS_WORDS.changesNothing,
    ],
    sections: savings.map((saving, index) => ({
      id: saving.id || `saving-${index}`,
      title:
        saving.monthlySaving !== undefined
          ? `${saving.finding} — ${AWS_SAVINGS_WORDS.perMonth(money(saving.monthlySaving, 'USD'))}`
          : saving.finding,
      lines: [
        [
          saving.state,
          saving.category,
          saving.service,
          saving.region,
          saving.by ? AWS_SAVINGS_WORDS.by(saving.by) : '',
        ]
          .filter(Boolean)
          .join(' · '),
        ...saving.evidence.map(read =>
          AWS_SAVINGS_WORDS.read(read.source, read.call, read.readAt),
        ),
      ],
    })),
  };
}

export function AwsSavingsCard({
  context,
}: {
  context: ToolCallRenderContext;
}): JSX.Element {
  const read = cardData(context);
  if (!read) {
    return <>{context.defaultUI}</>;
  }
  if (!read.done) {
    return <CardSkeleton label={AWS_SAVINGS_WORDS.writing} />;
  }
  return (
    <A2uiCard
      spec={savingsCard(readSavings(read.data), context.toolCallId)}
      maxWidth={720}
    />
  );
}

export const AwsSavingsPlugin = defineToolCardPlugin({
  id: 'aws-savings',
  displayName: 'AWS savings',
  description:
    'The recommended savings, largest first, each with its evidence and estimated monthly saving.',
  octicon: 'list-ordered',
  emoji: '\u{1F4B8}',
  tools: ['list_recommendations'],
  Card: AwsSavingsCard,
});

export {
  readSavings,
  type Saving,
  type SavingEvidence,
  type Savings,
} from './read';
export default AwsSavingsPlugin;
