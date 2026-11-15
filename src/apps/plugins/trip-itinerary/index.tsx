/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-trip-itinerary` — the Voyager's itinerary, day by
 * day: each stop with its time and place, and the place on a map. Draws
 * `show_itinerary`.
 *
 * @module apps/plugins/trip-itinerary
 */

import type { JSX } from 'react';
import { Heading, Link, Text } from '@primer/react';
import { LocationIcon } from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import type { ToolCallRenderContext } from '../../../types/chat';
import {
  CardFrame,
  CardSkeleton,
  cardData,
  defineToolCardPlugin,
} from '../../toolCards/kit';
import { readItinerary } from './read';

export const TRIP_ITINERARY_PLUGIN_NAME =
  '@datalayer/loop-plugin-trip-itinerary';

export const TRIP_ITINERARY_WORDS = {
  title: 'Itinerary',
  writing: 'Planning the days…',
  map: (place: string) => `${place} on a map`,
} as const;

export function TripItineraryCard({
  context,
}: {
  context: ToolCallRenderContext;
}): JSX.Element {
  const read = cardData(context);
  if (!read) {
    return <>{context.defaultUI}</>;
  }
  const itinerary = readItinerary(read.data);
  if (itinerary.days.length === 0) {
    return read.done ? (
      <>{context.defaultUI}</>
    ) : (
      <CardSkeleton label={TRIP_ITINERARY_WORDS.writing} />
    );
  }
  return (
    <CardFrame title={itinerary.title || TRIP_ITINERARY_WORDS.title}>
      <Box as="ol" m={0} p={0} sx={{ listStyle: 'none' }}>
        {itinerary.days.map((day, index) => (
          <Box as="li" key={`${day.date}-${index}`} mb={3}>
            <Heading as="h5" sx={{ fontSize: 1, mb: 1 }}>
              {[day.title, day.date].filter(Boolean).join(' · ')}
            </Heading>
            <Box as="ul" m={0} pl={0} sx={{ listStyle: 'none' }}>
              {day.stops.map((stop, stopIndex) => (
                <Box
                  as="li"
                  key={`${stop.time}-${stopIndex}`}
                  display="flex"
                  gap={2}
                  py={1}
                  borderTop={stopIndex === 0 ? undefined : '1px solid'}
                  borderColor="border.muted"
                >
                  <Text
                    sx={{
                      fontSize: 1,
                      color: 'fg.muted',
                      minWidth: 48,
                      fontFamily: 'mono',
                    }}
                  >
                    {stop.time}
                  </Text>
                  <Box flex={1}>
                    <Text as="div" sx={{ fontSize: 1 }}>
                      {stop.what}
                    </Text>
                    {stop.place ? (
                      <Link
                        href={stop.mapUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={TRIP_ITINERARY_WORDS.map(stop.place)}
                        sx={{ fontSize: 0 }}
                      >
                        <LocationIcon size={12} /> {stop.place}
                      </Link>
                    ) : null}
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        ))}
      </Box>
    </CardFrame>
  );
}

export const TripItineraryPlugin = defineToolCardPlugin({
  id: 'trip-itinerary',
  displayName: 'Trip itinerary',
  description:
    'The trip day by day: each stop with its time and place, and the place on a map.',
  octicon: 'calendar',
  emoji: '\u{1F5FA}\u{FE0F}',
  tools: ['show_itinerary'],
  Card: TripItineraryCard,
});

export {
  mapSearchUrl,
  readItinerary,
  type Itinerary,
  type ItineraryDay,
  type ItineraryStop,
} from './read';
export default TripItineraryPlugin;
