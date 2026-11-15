/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-aws-savings` — the Steward's savings, largest
 * first: each finding with its resource, the estimated monthly saving and
 * whose estimate it is, its state, and the reads it rests on; the sum of the
 * savings at the top. Draws `list_recommendations`, which the Steward ends a
 * scan with. Each recommendation's own card (Approve, Dismiss) is the A2UI
 * surface `record_recommendation` draws; this plugin is the list.
 *
 * @module apps/plugins/aws-savings
 */

import type { JSX } from 'react';
import { Label, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import type { ToolCallRenderContext } from '../../../types/chat';
import {
  CardFrame,
  CardSkeleton,
  cardData,
  defineToolCardPlugin,
  money,
} from '../../toolCards/kit';
import { readSavings } from './read';

export const AWS_SAVINGS_PLUGIN_NAME = '@datalayer/loop-plugin-aws-savings';

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

const STATE_VARIANT: Record<
  string,
  'success' | 'accent' | 'secondary' | 'attention'
> = {
  open: 'attention',
  approved: 'accent',
  applied: 'success',
  dismissed: 'secondary',
  expired: 'secondary',
};

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
  const { savings, monthly } = readSavings(read.data);
  return (
    <CardFrame
      title={AWS_SAVINGS_WORDS.title}
      subtitle={
        savings.length > 0
          ? AWS_SAVINGS_WORDS.total(money(monthly, 'USD'), savings.length)
          : AWS_SAVINGS_WORDS.none
      }
      maxWidth={720}
    >
      <Box as="ol" m={0} p={0} sx={{ listStyle: 'none' }}>
        {savings.map((saving, index) => (
          <Box
            as="li"
            key={saving.id || index}
            py={2}
            borderTop={index === 0 ? undefined : '1px solid'}
            borderColor="border.muted"
          >
            <Box
              display="flex"
              justifyContent="space-between"
              gap={2}
              flexWrap="wrap"
            >
              <Text sx={{ fontSize: 1, fontWeight: 'semibold' }}>
                {saving.finding}
              </Text>
              {saving.monthlySaving !== undefined ? (
                <Text
                  sx={{ fontSize: 1, fontWeight: 'bold', whiteSpace: 'nowrap' }}
                >
                  {AWS_SAVINGS_WORDS.perMonth(
                    money(saving.monthlySaving, 'USD'),
                  )}
                </Text>
              ) : null}
            </Box>
            <Box
              display="flex"
              gap={1}
              alignItems="center"
              flexWrap="wrap"
              mt={1}
            >
              <Label variant={STATE_VARIANT[saving.state] ?? 'secondary'}>
                {saving.state}
              </Label>
              {saving.category ? <Label>{saving.category}</Label> : null}
              <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                {[
                  saving.service,
                  saving.region,
                  saving.by ? AWS_SAVINGS_WORDS.by(saving.by) : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </Box>
            {saving.evidence.map((evidence, evidenceIndex) => (
              <Text
                as="div"
                key={`${evidence.call}-${evidenceIndex}`}
                sx={{ fontSize: 0, color: 'fg.muted', mt: 1 }}
              >
                {AWS_SAVINGS_WORDS.read(
                  evidence.source,
                  evidence.call,
                  evidence.readAt,
                )}
              </Text>
            ))}
          </Box>
        ))}
      </Box>
      <Text as="p" sx={{ mt: 2, mb: 0, fontSize: 0, color: 'fg.muted' }}>
        {AWS_SAVINGS_WORDS.changesNothing}
      </Text>
    </CardFrame>
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
