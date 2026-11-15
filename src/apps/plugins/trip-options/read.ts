/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Voyager's trip options (`show_trip_options`), read. Pure.
 *
 * @module apps/plugins/trip-options/read
 */

import {
  amount,
  records,
  safeImage,
  safeUrl,
  words,
  wordsList,
  type Data,
} from '../../toolCards/kit';

/** The most options a person compares at once. */
export const MOST_TRIP_OPTIONS = 3;

export type TripOption = {
  id: string;
  title: string;
  summary: string;
  dates: string;
  nights?: number;
  price?: number;
  currency: string;
  highlights: string[];
  url: string;
  image: string;
};

export function readTripOptions(data: Data): TripOption[] {
  const fallbackCurrency = words(data.currency);
  return records(data.options)
    .map((option, index) => ({
      id: words(option.id) || `option-${index + 1}`,
      title: words(option.title),
      summary: words(option.summary),
      dates: words(option.dates),
      nights: amount(option.nights),
      price: amount(option.price),
      currency: words(option.currency) || fallbackCurrency,
      highlights: wordsList(option.highlights).slice(0, 5),
      url: safeUrl(option.url),
      image: safeImage(option.image),
    }))
    .filter(option => option.title)
    .slice(0, MOST_TRIP_OPTIONS);
}
