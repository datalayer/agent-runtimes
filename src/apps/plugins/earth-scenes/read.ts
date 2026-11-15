/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Terra's satellite scenes (`show_scenes`), read. Pure.
 *
 * @module apps/plugins/earth-scenes/read
 */

import {
  amount,
  records,
  safeUrl,
  words,
  type Data,
} from '../../toolCards/kit';

export type EarthScene = {
  id: string;
  collection: string;
  sensor: string;
  date: string;
  /** Percent, 0–100, as the catalogue gave it. */
  cloudCover?: number;
  url: string;
};

export type EarthScenes = {
  area: string;
  period: string;
  /** The most cloud cover searched, when said. */
  maxCloud?: number;
  scenes: EarthScene[];
};

export function readEarthScenes(data: Data): EarthScenes {
  const scenes = records(data.scenes)
    .map((scene, index) => {
      const cloud = amount(scene.cloud_cover);
      return {
        id: words(scene.id) || `scene-${index + 1}`,
        collection: words(scene.collection),
        sensor: words(scene.sensor),
        date: words(scene.date),
        cloudCover:
          cloud === undefined ? undefined : Math.min(100, Math.max(0, cloud)),
        url: safeUrl(scene.url),
      };
    })
    .filter(scene => scene.date || scene.collection)
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    area: words(data.area),
    period: words(data.period),
    maxCloud: amount(data.max_cloud_cover),
    scenes,
  };
}
