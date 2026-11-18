/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Traveller's itinerary (`show_itinerary`), read. Pure.
 *
 * @module apps/plugins/trip-itinerary/read
 */

import { records, safeUrl, words, type Data } from '../../toolCards/kit';

export type ItineraryStop = {
  time: string;
  what: string;
  place: string;
  /** The stop on a map: the agent's link, or a search for its place. */
  mapUrl: string;
};

export type ItineraryDay = {
  date: string;
  title: string;
  stops: ItineraryStop[];
};

export type Itinerary = { title: string; days: ItineraryDay[] };

/** A place on a map, by Google Maps' search address (no key needed). */
export function mapSearchUrl(place: string): string {
  return place
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`
    : '';
}

export function readItinerary(data: Data): Itinerary {
  const days = records(data.days)
    .map((day, index) => ({
      date: words(day.date),
      title: words(day.title) || `Day ${index + 1}`,
      stops: records(day.items)
        .map(item => {
          const place = words(item.place);
          return {
            time: words(item.time),
            what: words(item.what),
            place,
            mapUrl: safeUrl(item.map_url) || mapSearchUrl(place),
          };
        })
        .filter(stop => stop.what || stop.place),
    }))
    .filter(day => day.stops.length > 0 || day.date);
  return { title: words(data.title), days };
}
