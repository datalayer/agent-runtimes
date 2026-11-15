/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-earth-index` — what Terra computed from the
 * pixels: an index (NDVI, NDWI, NBR…) over an area on each date with the
 * scene it came from, the change between the dates, the map it drew and
 * what limits the reading. Draws `show_index_result`.
 *
 * @module apps/plugins/earth-index
 */

import type { JSX } from 'react';
import { Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import type { ToolCallRenderContext } from '../../../types/chat';
import {
  CardFrame,
  CardSkeleton,
  CardTable,
  cardData,
  defineToolCardPlugin,
} from '../../toolCards/kit';
import { readIndexResult, type IndexReading } from './read';

export const EARTH_INDEX_PLUGIN_NAME = '@datalayer/loop-plugin-earth-index';

const fixed = (value: number | undefined): string =>
  value === undefined ? '' : value.toFixed(3);

export const EARTH_INDEX_WORDS = {
  title: (index: string, area: string) =>
    [index || 'Index', area].filter(Boolean).join(' over '),
  writing: 'Computing from the pixels…',
  delta: (delta: number) =>
    `Mean change: ${delta > 0 ? '+' : ''}${delta.toFixed(3)}`,
  changed: (pct: number, threshold?: number) =>
    threshold === undefined
      ? `${pct.toFixed(1)}% of the area changed`
      : `${pct.toFixed(1)}% of the area changed by more than ${threshold}`,
  map: (index: string) => `${index || 'Index'} map`,
} as const;

export function EarthIndexCard({
  context,
}: {
  context: ToolCallRenderContext;
}): JSX.Element {
  const read = cardData(context);
  if (!read) {
    return <>{context.defaultUI}</>;
  }
  const result = readIndexResult(read.data);
  if (result.readings.length === 0) {
    return read.done ? (
      <>{context.defaultUI}</>
    ) : (
      <CardSkeleton label={EARTH_INDEX_WORDS.writing} />
    );
  }
  const { change } = result;
  return (
    <CardFrame title={EARTH_INDEX_WORDS.title(result.index, result.area)}>
      {result.image ? (
        <Box
          as="img"
          src={result.image}
          alt={EARTH_INDEX_WORDS.map(result.index)}
          width="100%"
          maxHeight={320}
          borderRadius={2}
          mb={2}
          sx={{ objectFit: 'contain', bg: 'canvas.default' }}
        />
      ) : null}
      <CardTable<IndexReading>
        caption={`${result.readings.length} dates`}
        rows={result.readings}
        rowKey={(row, index) => `${row.date}-${index}`}
        columns={[
          { key: 'date', title: 'Date', cell: row => row.date },
          { key: 'scene', title: 'Scene', cell: row => row.scene },
          {
            key: 'mean',
            title: 'Mean',
            align: 'right',
            cell: row => fixed(row.mean),
          },
          {
            key: 'min',
            title: 'Min',
            align: 'right',
            cell: row => fixed(row.min),
          },
          {
            key: 'max',
            title: 'Max',
            align: 'right',
            cell: row => fixed(row.max),
          },
        ]}
      />
      {change ? (
        <Box mt={2}>
          {change.meanDelta !== undefined ? (
            <Text
              as="div"
              sx={{ fontSize: 2, fontWeight: 'bold' }}
              data-index-delta
            >
              {EARTH_INDEX_WORDS.delta(change.meanDelta)}
            </Text>
          ) : null}
          {change.changedAreaPct !== undefined ? (
            <Text as="div" sx={{ fontSize: 1 }}>
              {EARTH_INDEX_WORDS.changed(
                change.changedAreaPct,
                change.threshold,
              )}
            </Text>
          ) : null}
        </Box>
      ) : null}
      {result.notes ? (
        <Text as="p" sx={{ mt: 2, mb: 0, fontSize: 1, color: 'fg.muted' }}>
          {result.notes}
        </Text>
      ) : null}
    </CardFrame>
  );
}

export const EarthIndexPlugin = defineToolCardPlugin({
  id: 'earth-index',
  displayName: 'Index and change',
  description:
    'An index computed over an area on each date, the change between the dates and its map.',
  octicon: 'graph',
  emoji: '\u{1F33F}',
  tools: ['show_index_result'],
  Card: EarthIndexCard,
});

export {
  readIndexResult,
  type IndexChange,
  type IndexReading,
  type IndexResult,
} from './read';
export default EarthIndexPlugin;
