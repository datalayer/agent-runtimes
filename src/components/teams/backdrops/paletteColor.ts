/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A spec's colour as the theme draws it: a name of the palette (`teal`,
 * `indigo`, `primary`…) in the value the current theme and mode give it, a
 * hex (`#RGB`, `#RRGGBB`) as it is, anything else nothing — the backdrop
 * then draws its own colour.
 *
 * A thin resolver over primer-addons' `useColorPalette`, which every
 * released primer-addons has: the palette itself is primer-addons', read by
 * name. It stands until a primer-addons with `usePaletteColor` is released
 * and this package's range raised; then it gives way to that.
 *
 * @module components/teams/backdrops/paletteColor
 */

import { useCallback } from 'react';
import { useColorPalette, type ColorPalette } from '@datalayer/primer-addons';

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** A spec's colour in a palette: the palette's value of a name, a hex as it is, else nothing. */
export function resolveSpecColor(
  value: string | null | undefined,
  palette: ColorPalette,
): string | undefined {
  if (!value) {
    return undefined;
  }
  if (HEX_COLOR.test(value)) {
    return value;
  }
  const named: unknown = Object.prototype.hasOwnProperty.call(palette, value)
    ? Reflect.get(palette, value)
    : undefined;
  return typeof named === 'string' ? named : undefined;
}

/** `resolveSpecColor` in the current theme and mode; a new function when either changes. */
export function useSpecColor(): (
  value: string | null | undefined,
) => string | undefined {
  const palette = useColorPalette();
  return useCallback(value => resolveSpecColor(value, palette), [palette]);
}
