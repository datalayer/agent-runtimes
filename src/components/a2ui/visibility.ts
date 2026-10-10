/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What `visible_when` is, without the renderer: the key and the rule, for
 * whatever writes or checks a surface (the Studio's Canvas) as well as for
 * what draws it (`visibleWhen`).
 *
 * @module components/a2ui/visibility
 */

/** The key any block may carry to be shown only under a condition. */
export const VISIBLE_WHEN = 'visible_when';

/**
 * Whether a block whose condition resolved to `value` is shown: `true`, or a
 * value that is not empty. `false`, `''`, `0`, `null`, an empty list, or
 * nothing published at the path yet hide it.
 */
export function isShown(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return Boolean(value);
}
