/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-earth-scenes` — the satellite scenes Terra found,
 * by date: each with its collection, sensor and cloud cover as the catalogue
 * gave them, the area and the dates searched. Draws `show_scenes`.
 *
 * @module apps/plugins/earth-scenes
 */

import type { JSX } from 'react';
import { Link, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import type { ToolCallRenderContext } from '../../../types/chat';
import {
  CardFrame,
  CardSkeleton,
  CardTable,
  cardData,
  defineToolCardPlugin,
} from '../../toolCards/kit';
import { readEarthScenes, type EarthScene } from './read';

export const EARTH_SCENES_PLUGIN_NAME = '@datalayer/loop-plugin-earth-scenes';

export const EARTH_SCENES_WORDS = {
  title: 'Scenes',
  writing: 'Searching the catalogue…',
  searched: (area: string, period: string, maxCloud?: number) =>
    [area, period, maxCloud !== undefined ? `up to ${maxCloud}% cloud` : '']
      .filter(Boolean)
      .join(' · '),
  cloud: (cover: number) => `${cover.toFixed(0)}% cloud cover`,
} as const;

/** A bar as long as the cloud cover, the figure beside it. */
function CloudBar({ cover }: { cover?: number }): JSX.Element | null {
  if (cover === undefined) {
    return null;
  }
  return (
    <Box display="flex" alignItems="center" gap={1} justifyContent="flex-end">
      <Box
        width={48}
        height={6}
        bg="neutral.muted"
        borderRadius={2}
        overflow="hidden"
        aria-label={EARTH_SCENES_WORDS.cloud(cover)}
        role="img"
      >
        <Box width={`${cover}%`} height="100%" bg="fg.muted" />
      </Box>
      <Text sx={{ fontSize: 0, fontFamily: 'mono' }}>{cover.toFixed(0)}%</Text>
    </Box>
  );
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
  const searched = EARTH_SCENES_WORDS.searched(
    found.area,
    found.period,
    found.maxCloud,
  );
  return (
    <CardFrame
      title={EARTH_SCENES_WORDS.title}
      subtitle={searched || undefined}
    >
      <CardTable<EarthScene>
        caption={`${found.scenes.length} scenes`}
        rows={found.scenes}
        rowKey={row => row.id}
        columns={[
          {
            key: 'date',
            title: 'Date',
            cell: row =>
              row.url ? (
                <Link href={row.url} target="_blank" rel="noreferrer">
                  {row.date}
                </Link>
              ) : (
                row.date
              ),
          },
          {
            key: 'collection',
            title: 'Collection',
            cell: row => row.collection,
          },
          { key: 'sensor', title: 'Sensor', cell: row => row.sensor },
          {
            key: 'cloud',
            title: 'Cloud cover',
            align: 'right',
            cell: row => <CloudBar cover={row.cloudCover} />,
          },
        ]}
      />
    </CardFrame>
  );
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
