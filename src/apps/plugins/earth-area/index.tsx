/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-earth-area` — the area and the dates Terra
 * searched, in the chat's title bar: from the last scenes it showed
 * (`show_scenes`: the area, the period, the most cloud cover), else from its
 * last granule search's bounding box and dates (`search_earth_datagranules`,
 * with or without the gateway's prefix). Nothing before a search. Brought by
 * the `earthdata` server.
 *
 * @module apps/plugins/earth-area
 */

import type { JSX } from 'react';
import { Chip, defineChromePlugin } from '../../toolCards/chrome';
import { useLatestToolCall } from '../../toolCards/toolResults';
import { amount, record, words } from '../../toolCards/kit';

export const EARTH_AREA_WORDS = {
  short: (parts: string[]) => `Area: ${parts.join(' · ')}`,
  title: (parts: string[]) => `Searched: ${parts.join(', ')}.`,
} as const;

/** What a search said of its area and dates; empty when nothing. */
export function earthAreaOf(
  scenes: { args: Record<string, unknown>; result: unknown } | undefined,
  search: { args: Record<string, unknown>; result: unknown } | undefined,
): string[] {
  if (scenes) {
    const said = record(scenes.result) ?? scenes.args;
    const cloud = amount(said.max_cloud_cover);
    const parts = [
      words(said.area),
      words(said.period),
      cloud !== undefined ? `≤ ${cloud}% cloud` : '',
    ].filter(Boolean);
    if (parts.length > 0) {
      return parts;
    }
  }
  if (search) {
    const box = search.args.bounding_box;
    const area = Array.isArray(box) ? box.map(words).join(', ') : words(box);
    const temporal = search.args.temporal;
    const dates = Array.isArray(temporal)
      ? temporal.map(words).filter(Boolean).join(' – ')
      : words(temporal);
    return [area ? `[${area}]` : '', dates].filter(Boolean);
  }
  return [];
}

export function EarthAreaChip(): JSX.Element | null {
  const parts = earthAreaOf(
    useLatestToolCall(['show_scenes']),
    useLatestToolCall(['search_earth_datagranules']),
  );
  if (parts.length === 0) {
    return null;
  }
  return (
    <Chip title={EARTH_AREA_WORDS.title(parts)} data="earth-area">
      {EARTH_AREA_WORDS.short(parts)}
    </Chip>
  );
}

export const earthAreaPlugin = defineChromePlugin({
  id: 'earth-area',
  displayName: 'Area and dates',
  description: 'The area and the dates searched, in the chat’s title bar.',
  octicon: 'location',
  emoji: '\u{1F5FA}\u{FE0F}',
  Component: EarthAreaChip,
});

export const EarthAreaPlugin = earthAreaPlugin('header');
export default EarthAreaPlugin;
