/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-earth-index` — what Terra computed from the
 * pixels, as a message drawn by the A2UI renderer: an index (NDVI, NDWI,
 * NBR…) over an area on each date with the scene it came from, the change
 * between the dates, the map it drew and what limits the reading. Draws
 * `show_index_result`.
 *
 * @module apps/plugins/earth-index
 */

import type { JSX } from 'react';
import type { ToolCallRenderContext } from '../../../types/chat';
import {
  CardSkeleton,
  cardData,
  defineToolCardPlugin,
} from '../../toolCards/kit';
import { A2uiCard, type CardSpec } from '../../toolCards/a2uiCard';
import { readIndexResult, type IndexResult } from './read';

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

/** The result as an A2UI card: the map, a table by date, the change. */
export function indexCard(result: IndexResult, id: string): CardSpec {
  const { change } = result;
  return {
    id: `index-${id}`,
    title: EARTH_INDEX_WORDS.title(result.index, result.area),
    ...(result.image
      ? {
          image: {
            url: result.image,
            alt: EARTH_INDEX_WORDS.map(result.index),
          },
        }
      : {}),
    table: {
      columns: ['Date', 'Scene', 'Mean', 'Min', 'Max'],
      rows: result.readings.map(reading => ({
        Date: reading.date,
        Scene: reading.scene,
        Mean: fixed(reading.mean),
        Min: fixed(reading.min),
        Max: fixed(reading.max),
      })),
    },
    lines: [
      ...(change?.meanDelta !== undefined
        ? [`**${EARTH_INDEX_WORDS.delta(change.meanDelta)}**`]
        : []),
      ...(change?.changedAreaPct !== undefined
        ? [EARTH_INDEX_WORDS.changed(change.changedAreaPct, change.threshold)]
        : []),
      ...(result.notes ? [result.notes] : []),
    ],
  };
}

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
  return <A2uiCard spec={indexCard(result, context.toolCallId)} />;
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
