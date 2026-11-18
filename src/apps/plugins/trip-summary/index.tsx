/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-trip-summary` — the trip the Traveller is planning,
 * in the chat's title bar: where and when, from the last itinerary it showed
 * (`show_itinerary`: its title, its first and last days), and its budget so
 * far (`show_trip_budget`'s total). Nothing before either. Brought by the
 * `travel-planning` skill.
 *
 * @module apps/plugins/trip-summary
 */

import type { JSX } from 'react';
import { Chip, defineChromePlugin } from '../../toolCards/chrome';
import { useLatestToolCall } from '../../toolCards/toolResults';
import { money, record, type Data } from '../../toolCards/kit';
import { readItinerary } from '../trip-itinerary/read';
import { readTripBudget } from '../trip-budget/read';

export const TRIP_SUMMARY_WORDS = {
  short: (parts: string[]) => `Trip: ${parts.join(' · ')}`,
  title: (parts: string[]) =>
    `The trip being planned: ${parts.join(', ')}. Nothing is booked.`,
} as const;

const dataOf = (
  call: { args: Record<string, unknown>; result: unknown } | undefined,
): Data | undefined => {
  if (!call) {
    return undefined;
  }
  const answered = record(call.result);
  return answered && 'shown' in answered ? answered : call.args;
};

/** Where and when, and the budget so far, from the cards shown; empty when none. */
export function tripSummaryOf(
  itinerary: { args: Record<string, unknown>; result: unknown } | undefined,
  budget: { args: Record<string, unknown>; result: unknown } | undefined,
): string[] {
  const parts: string[] = [];
  const days = dataOf(itinerary);
  if (days) {
    const read = readItinerary(days);
    const dates = read.days.map(day => day.date).filter(Boolean);
    if (read.title) {
      parts.push(read.title);
    }
    if (dates.length > 0) {
      parts.push(
        dates.length > 1
          ? `${dates[0]} – ${dates[dates.length - 1]}`
          : dates[0],
      );
    }
  }
  const lines = dataOf(budget);
  if (lines) {
    const trip = readTripBudget(lines);
    if (trip.lines.length > 0) {
      parts.push(money(trip.total, trip.currency));
    }
  }
  return parts;
}

export function TripSummaryChip(): JSX.Element | null {
  const parts = tripSummaryOf(
    useLatestToolCall(['show_itinerary']),
    useLatestToolCall(['show_trip_budget']),
  );
  if (parts.length === 0) {
    return null;
  }
  return (
    <Chip title={TRIP_SUMMARY_WORDS.title(parts)} data="trip-summary">
      {TRIP_SUMMARY_WORDS.short(parts)}
    </Chip>
  );
}

export const tripSummaryPlugin = defineChromePlugin({
  id: 'trip-summary',
  displayName: 'Trip being planned',
  description:
    'The trip being planned, in the chat’s title bar: where and when, and its budget so far.',
  octicon: 'paper-airplane',
  emoji: '\u{1F9ED}',
  Component: TripSummaryChip,
});

export const TripSummaryPlugin = tripSummaryPlugin('header');
export default TripSummaryPlugin;
