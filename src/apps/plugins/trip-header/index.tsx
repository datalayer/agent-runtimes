/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-trip-header` — the Traveller's title bar: the trip
 * being planned (where and when), a Travellers drop-down told to the agent
 * with every turn, and how many options are ready to compare. Stands in for
 * `trip-summary`: until the agent's tool says the trip, it reads the
 * itinerary and the budget shown (`show_itinerary`, `show_trip_budget`).
 *
 * What it draws is its UI spec's `header` (`agentspecs/ui/trip-header.yaml`):
 * the items, the frontend tool `set_trip_header` the agent sets them with,
 * and what each drop-down tells the agent (`toolCards/headerItems`).
 *
 * @module apps/plugins/trip-header
 */

import { defineHeaderPlugin } from '../../toolCards/headerItems';
import { useLatestToolCall } from '../../toolCards/toolResults';
import { tripSummaryOf } from '../trip-summary';

export const TRIP_HEADER_PLUGIN_NAME = '@datalayer/loop-plugin-trip-header';

/** The trip of the cards shown, for the indicator its tool has not set. */
function useShownTrip() {
  const itinerary = useLatestToolCall(['show_itinerary']);
  const budget = useLatestToolCall(['show_trip_budget']);
  const parts = tripSummaryOf(itinerary, budget);
  return parts.length > 0
    ? {
        label: parts.join(' · '),
        order: Math.max(itinerary?.order ?? 0, budget?.order ?? 0),
      }
    : undefined;
}

/** The plugin, built for a workspace: what a person picked is that workspace's. */
export const tripHeaderPlugin = defineHeaderPlugin({
  id: 'trip-header',
  derive: { trip: useShownTrip },
});

export default tripHeaderPlugin;
