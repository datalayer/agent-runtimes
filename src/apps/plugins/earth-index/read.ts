/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Terra's index or change result (`show_index_result`), read. Pure.
 *
 * @module apps/plugins/earth-index/read
 */

import {
  amount,
  record,
  records,
  safeImage,
  words,
  type Data,
} from '../../toolCards/kit';

export type IndexReading = {
  date: string;
  scene: string;
  mean?: number;
  min?: number;
  max?: number;
};

export type IndexChange = {
  /** The later mean less the earlier. */
  meanDelta?: number;
  /** The share of the area that changed past the threshold, in percent. */
  changedAreaPct?: number;
  threshold?: number;
};

export type IndexResult = {
  index: string;
  area: string;
  readings: IndexReading[];
  change?: IndexChange;
  image: string;
  notes: string;
};

export function readIndexResult(data: Data): IndexResult {
  const readings = records(data.dates)
    .map(reading => ({
      date: words(reading.date),
      scene: words(reading.scene),
      mean: amount(reading.mean),
      min: amount(reading.min),
      max: amount(reading.max),
    }))
    .filter(reading => reading.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  const said = record(data.change);
  let change: IndexChange | undefined;
  if (said) {
    change = {
      meanDelta: amount(said.mean_delta),
      changedAreaPct: amount(said.changed_area_pct),
      threshold: amount(said.threshold),
    };
  } else if (readings.length >= 2) {
    const first = readings[0].mean;
    const last = readings[readings.length - 1].mean;
    if (first !== undefined && last !== undefined) {
      change = { meanDelta: Math.round((last - first) * 1000) / 1000 };
    }
  }
  return {
    index: words(data.index).toUpperCase(),
    area: words(data.area),
    readings,
    change,
    image: safeImage(data.image),
    notes: words(data.notes),
  };
}
