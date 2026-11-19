/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-trip-budget` — what the Traveller's trip costs: each
 * line (travel, stay, food, activities) with its amount, quotes apart from
 * estimates, the total summed here, and what is left of the person's
 * budget. Draws `show_trip_budget`.
 *
 * @module apps/plugins/trip-budget
 */

import type { JSX } from 'react';
import { Label, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import type { ToolCallRenderContext } from '../../../types/chat';
import {
  CardFrame,
  CardSkeleton,
  CardTable,
  cardData,
  defineToolCardPlugin,
  money,
} from '../../toolCards/kit';
import { readTripBudget, type TripBudgetLine } from './read';

export const TRIP_BUDGET_PLUGIN_NAME = '@datalayer/loop-plugin-trip-budget';

export const TRIP_BUDGET_WORDS = {
  title: 'Trip budget',
  writing: 'Adding up the trip…',
  estimate: 'Estimate',
  total: 'Total',
  left: (left: string, budget: string) => `${left} left of your ${budget}`,
  over: (over: string, budget: string) => `${over} over your ${budget}`,
} as const;

export function TripBudgetCard({
  context,
}: {
  context: ToolCallRenderContext;
}): JSX.Element {
  const read = cardData(context);
  if (!read) {
    return <>{context.defaultUI}</>;
  }
  const trip = readTripBudget(read.data);
  if (trip.lines.length === 0) {
    return read.done ? (
      <>{context.defaultUI}</>
    ) : (
      <CardSkeleton label={TRIP_BUDGET_WORDS.writing} />
    );
  }
  const { currency } = trip;
  return (
    <CardFrame title={TRIP_BUDGET_WORDS.title} maxWidth={520}>
      <CardTable<TripBudgetLine>
        caption={`${trip.lines.length} lines`}
        rows={trip.lines}
        rowKey={(row, index) => `${row.label}-${index}`}
        columns={[
          {
            key: 'label',
            title: 'What',
            cell: row => (
              <>
                {row.label}{' '}
                {row.estimate ? (
                  <Label>{TRIP_BUDGET_WORDS.estimate}</Label>
                ) : null}
                {row.category ? (
                  <Text as="div" sx={{ fontSize: 0, color: 'fg.muted' }}>
                    {row.category}
                  </Text>
                ) : null}
              </>
            ),
          },
          {
            key: 'amount',
            title: 'Amount',
            align: 'right',
            cell: row => money(row.amount, currency),
          },
        ]}
      />
      <Box mt={2} display="flex" flexDirection="column" alignItems="flex-end">
        <Text sx={{ fontSize: 2, fontWeight: 'bold' }} data-trip-total>
          {TRIP_BUDGET_WORDS.total}: {money(trip.total, currency)}
        </Text>
        {trip.budget !== undefined && trip.left !== undefined ? (
          <Text
            sx={{
              fontSize: 1,
              color: trip.left >= 0 ? 'success.fg' : 'danger.fg',
            }}
          >
            {trip.left >= 0
              ? TRIP_BUDGET_WORDS.left(
                  money(trip.left, currency),
                  money(trip.budget, currency),
                )
              : TRIP_BUDGET_WORDS.over(
                  money(-trip.left, currency),
                  money(trip.budget, currency),
                )}
          </Text>
        ) : null}
      </Box>
    </CardFrame>
  );
}

export const TripBudgetPlugin = defineToolCardPlugin({
  id: 'trip-budget',
  displayName: 'Trip budget',
  description:
    'What the trip costs, line by line, the total and what is left of the person’s budget.',
  octicon: 'credit-card',
  emoji: '\u{1F4B0}',
  tools: ['show_trip_budget'],
  Card: TripBudgetCard,
});

export { readTripBudget, type TripBudget, type TripBudgetLine } from './read';
export default TripBudgetPlugin;
