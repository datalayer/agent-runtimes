/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/agent-plugin-earth-scenes` — the satellite scenes Terra found,
 * by date, as a message drawn by the A2UI renderer: each with its collection,
 * sensor and cloud cover as the catalogue gave them, the area and the dates
 * searched. Draws `show_scenes`.
 *
 * @module apps/plugins/earth-scenes
 */

import type { JSX } from 'react';
import type { ToolCallRenderContext } from '../../../types/chat';
import {
  CardSkeleton,
  cardData,
  defineToolCardPlugin,
} from '../../toolCards/kit';
import { A2uiCard, type CardSpec } from '../../toolCards/a2uiCard';
import { readEarthScenes, type EarthScenes } from './read';

export const EARTH_SCENES_PLUGIN_NAME = '@datalayer/agent-plugin-earth-scenes';

export const EARTH_SCENES_WORDS = {
  title: 'Scenes',
  writing: 'Searching the catalogue…',
  searched: (area: string, period: string, maxCloud?: number) =>
    [area, period, maxCloud !== undefined ? `up to ${maxCloud}% cloud` : '']
      .filter(Boolean)
      .join(' · '),
  count: (count: number) => (count === 1 ? '1 scene' : `${count} scenes`),
} as const;

/** The scenes as an A2UI card: a table by date. */
export function scenesCard(found: EarthScenes, id: string): CardSpec {
  const searched = EARTH_SCENES_WORDS.searched(
    found.area,
    found.period,
    found.maxCloud,
  );
  return {
    id: `scenes-${id}`,
    title: EARTH_SCENES_WORDS.title,
    captions: [
      EARTH_SCENES_WORDS.count(found.scenes.length),
      ...(searched ? [searched] : []),
    ],
    table: {
      columns: ['Date', 'Collection', 'Sensor', 'Cloud cover'],
      rows: found.scenes.map(scene => ({
        Date: scene.date,
        Collection: scene.collection,
        Sensor: scene.sensor,
        'Cloud cover':
          scene.cloudCover === undefined
            ? ''
            : `${scene.cloudCover.toFixed(0)}%`,
      })),
    },
    lines: found.scenes
      .filter(scene => scene.url)
      .map(scene => `[${scene.date} ${scene.collection}](${scene.url})`),
  };
}

export function EarthScenesCard({
  context,
}: {
  context: ToolCallRenderContext;
}): JSX.Element {
  const read = cardData(context);
  if (!read) {
    return <>{context.defaultUI}</>;
  }
  const found = readEarthScenes(read.data);
  if (found.scenes.length === 0) {
    return read.done ? (
      <>{context.defaultUI}</>
    ) : (
      <CardSkeleton label={EARTH_SCENES_WORDS.writing} />
    );
  }
  return <A2uiCard spec={scenesCard(found, context.toolCallId)} />;
}

export const EarthScenesPlugin = defineToolCardPlugin({
  id: 'earth-scenes',
  displayName: 'Satellite scenes',
  description:
    'The satellite scenes found, by date, each with its collection, sensor and cloud cover.',
  octicon: 'globe',
  emoji: '\u{1F6F0}\u{FE0F}',
  tools: ['show_scenes'],
  Card: EarthScenesCard,
});

export { readEarthScenes, type EarthScene, type EarthScenes } from './read';
export default EarthScenesPlugin;
