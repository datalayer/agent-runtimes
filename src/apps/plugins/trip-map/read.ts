/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Traveller's map (`show_trip_map`), read. Pure.
 *
 * Each option's places, numbered in the order they are visited (by day,
 * then as given), and the box that holds every option's places, which the
 * map opens on.
 *
 * @module apps/plugins/trip-map/read
 */

import {
  amount,
  records,
  safeUrl,
  words,
  type Data,
} from '../../toolCards/kit';

/** What a place on the map is; anything else is a sight. */
export const TRIP_MAP_KINDS = [
  'stay',
  'food',
  'sight',
  'transport',
  'other',
] as const;

export type TripMapKind = (typeof TRIP_MAP_KINDS)[number];

export type TripMapPlace = {
  /** Its number on the map, from 1, in the order it is visited. */
  number: number;
  name: string;
  lat: number;
  lon: number;
  kind: TripMapKind;
  day?: number;
  time: string;
  address: string;
  url: string;
};

export type TripMapOption = {
  id: string;
  title: string;
  places: TripMapPlace[];
};

/** West, south, east, north. */
export type TripMapBounds = [number, number, number, number];

export type TripMap = {
  title: string;
  /** The places' attribution line, as the tool that found them said it. */
  attribution: string;
  options: TripMapOption[];
  bounds?: TripMapBounds;
};

/** What the basemap's data asks to be credited with, always shown. */
export const OVERTURE_BASEMAP_ATTRIBUTION =
  '© OpenStreetMap contributors, Overture Maps Foundation';

function kindOf(value: unknown): TripMapKind {
  const kind = words(value).toLowerCase();
  return (TRIP_MAP_KINDS as readonly string[]).includes(kind)
    ? (kind as TripMapKind)
    : 'sight';
}

function placeOf(data: Data): Omit<TripMapPlace, 'number'> | null {
  const lat = amount(data.lat);
  const lon = amount(data.lon);
  const name = words(data.name);
  if (
    !name ||
    lat === undefined ||
    lon === undefined ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180
  ) {
    return null;
  }
  const day = amount(data.day);
  return {
    name,
    lat,
    lon,
    kind: kindOf(data.kind),
    day: day !== undefined && day >= 1 ? Math.floor(day) : undefined,
    time: words(data.time),
    address: words(data.address),
    url: safeUrl(data.url),
  };
}

/** Places in the order they are visited: by day (a place without one last), then as given. */
function numbered(places: Omit<TripMapPlace, 'number'>[]): TripMapPlace[] {
  return places
    .map((place, index) => ({ place, index }))
    .sort(
      (a, b) =>
        (a.place.day ?? Number.MAX_SAFE_INTEGER) -
          (b.place.day ?? Number.MAX_SAFE_INTEGER) || a.index - b.index,
    )
    .map(({ place }, index) => ({ ...place, number: index + 1 }));
}

/** The box holding these places, or none. */
export function boundsOf(
  places: { lat: number; lon: number }[],
): TripMapBounds | undefined {
  if (places.length === 0) {
    return undefined;
  }
  const lats = places.map(place => place.lat);
  const lons = places.map(place => place.lon);
  return [
    Math.min(...lons),
    Math.min(...lats),
    Math.max(...lons),
    Math.max(...lats),
  ];
}

export function readTripMap(data: Data): TripMap {
  const options = records(data.options)
    .map((option, index) => ({
      id: words(option.id) || `option-${index + 1}`,
      title: words(option.title) || `Option ${index + 1}`,
      places: numbered(
        records(option.places)
          .map(placeOf)
          .filter((place): place is Omit<TripMapPlace, 'number'> => !!place),
      ),
    }))
    .filter(option => option.places.length > 0)
    .slice(0, 3);
  return {
    title: words(data.title),
    attribution: words(data.attribution),
    options,
    bounds: boundsOf(options.flatMap(option => option.places)),
  };
}
