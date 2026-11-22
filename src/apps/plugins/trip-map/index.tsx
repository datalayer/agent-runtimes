/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/agent-plugin-trip-map` — the Traveller's options on a map: each
 * option's places numbered in the order they are visited, one option at a
 * time with a switch between them, over Overture Maps' open basemap, the
 * places listed under the map with their links and the attribution of the
 * places and of the basemap. Draws `show_trip_map`.
 *
 * The map (MapLibre, PMTiles) is a chunk of its own, loaded when a card is
 * drawn; a placeholder holds its place meanwhile.
 *
 * @module apps/plugins/trip-map
 */

import { Suspense, lazy, useMemo, useState, type JSX } from 'react';
import { Link, SegmentedControl, Text, useTheme } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import type { ToolCallRenderContext } from '../../../types/chat';
import {
  CardFrame,
  CardSkeleton,
  cardData,
  defineToolCardPlugin,
} from '../../toolCards/kit';
import { OVERTURE_BASEMAP_ATTRIBUTION, readTripMap } from './read';

export const TRIP_MAP_PLUGIN_NAME = '@datalayer/agent-plugin-trip-map';

export const TRIP_MAP_WORDS = {
  title: 'On the map',
  writing: 'Drawing the map…',
  loading: 'Loading the map…',
  options: 'Options',
  day: (day: number) => `Day ${day}`,
  basemap: `Map: ${OVERTURE_BASEMAP_ATTRIBUTION}`,
} as const;

const MAP_HEIGHT = 320;

const TripMapView = lazy(() => import('./TripMapView'));

function MapPlaceholder({ label }: { label: string }): JSX.Element {
  return (
    <Box
      height={MAP_HEIGHT}
      display="flex"
      alignItems="center"
      justifyContent="center"
      bg="canvas.subtle"
      borderRadius={2}
      aria-busy="true"
      data-testid="trip-map-placeholder"
    >
      <Text sx={{ fontSize: 1, color: 'fg.muted' }}>{label}</Text>
    </Box>
  );
}

export function TripMapCard({
  context,
}: {
  context: ToolCallRenderContext;
}): JSX.Element {
  const read = cardData(context);
  const map = useMemo(() => (read ? readTripMap(read.data) : null), [read]);
  const [chosen, setChosen] = useState(0);
  const { colorScheme } = useTheme();
  if (!read || !map) {
    return <>{context.defaultUI}</>;
  }
  if (map.options.length === 0) {
    return read.done ? (
      <>{context.defaultUI}</>
    ) : (
      <CardSkeleton label={TRIP_MAP_WORDS.writing} />
    );
  }
  const index = Math.min(chosen, map.options.length - 1);
  const option = map.options[index];
  const dark = String(colorScheme ?? '').startsWith('dark');
  return (
    <CardFrame
      title={map.title || TRIP_MAP_WORDS.title}
      subtitle={map.options.length > 1 ? undefined : option.title}
    >
      {map.options.length > 1 ? (
        <SegmentedControl
          aria-label={TRIP_MAP_WORDS.options}
          size="small"
          sx={{ mb: 2 }}
          onChange={setChosen}
        >
          {map.options.map((each, position) => (
            <SegmentedControl.Button
              key={each.id}
              selected={position === index}
            >
              {each.title}
            </SegmentedControl.Button>
          ))}
        </SegmentedControl>
      ) : null}
      {read.done ? (
        <Suspense fallback={<MapPlaceholder label={TRIP_MAP_WORDS.loading} />}>
          <TripMapView places={option.places} dark={dark} height={MAP_HEIGHT} />
        </Suspense>
      ) : (
        <MapPlaceholder label={TRIP_MAP_WORDS.writing} />
      )}
      <Box as="ol" m={0} mt={2} p={0} sx={{ listStyle: 'none' }}>
        {option.places.map(place => (
          <Box
            as="li"
            key={`${place.number}-${place.name}`}
            display="flex"
            gap={2}
            py={1}
          >
            <Text
              sx={{
                fontSize: 1,
                fontFamily: 'mono',
                color: 'fg.muted',
                minWidth: 24,
              }}
            >
              {place.number}.
            </Text>
            <Box flex={1}>
              {place.url ? (
                <Link
                  href={place.url}
                  target="_blank"
                  rel="noreferrer"
                  sx={{ fontSize: 1 }}
                >
                  {place.name}
                </Link>
              ) : (
                <Text sx={{ fontSize: 1 }}>{place.name}</Text>
              )}
              <Text as="div" sx={{ fontSize: 0, color: 'fg.muted' }}>
                {[
                  place.day ? TRIP_MAP_WORDS.day(place.day) : '',
                  place.time,
                  place.kind,
                  place.address,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </Box>
          </Box>
        ))}
      </Box>
      <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', mt: 2, mb: 0 }}>
        {[map.attribution, TRIP_MAP_WORDS.basemap].filter(Boolean).join(' ')}
      </Text>
    </CardFrame>
  );
}

export const TripMapPlugin = defineToolCardPlugin({
  id: 'trip-map',
  displayName: 'Trip map',
  description:
    "The places of each trip option on a map — numbered by day, one option at a time — over Overture Maps' open basemap, with its attribution (show_trip_map). The map library loads only when the card is drawn.",
  octicon: 'location',
  emoji: '\u{1F5FA}\u{FE0F}',
  tools: ['show_trip_map'],
  Card: TripMapCard,
});

export {
  OVERTURE_BASEMAP_ATTRIBUTION,
  boundsOf,
  readTripMap,
  type TripMap,
  type TripMapOption,
  type TripMapPlace,
} from './read';
export default TripMapPlugin;
