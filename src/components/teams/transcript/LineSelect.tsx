/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What selects a line from the keyboard: a native button around the line's
 * time, in the Lines view and in the Table. It has no handler of its own: its
 * click, by a pointer, Enter or Space, bubbles to the line's or the row's
 * own, which a click anywhere on it reaches too.
 *
 * @module components/teams/transcript/LineSelect
 */

import type { JSX, ReactNode } from 'react';
import { Box } from '@datalayer/primer-addons';

export type LineSelectProps = {
  /** What a screen reader says of it: the line it selects. */
  label: string;
  /** The line is the selected one. */
  selected: boolean;
  /** The line's time, as the view draws it. */
  children: ReactNode;
};

/** The line's time, as a button that selects it. */
export function LineSelect({
  label,
  selected,
  children,
}: LineSelectProps): JSX.Element {
  return (
    <Box
      as="button"
      type="button"
      data-transcript-select=""
      aria-label={label}
      aria-pressed={selected}
      sx={{
        alignSelf: 'start',
        appearance: 'none',
        background: 'none',
        border: 0,
        color: 'inherit',
        cursor: 'pointer',
        font: 'inherit',
        p: 0,
        '&:focus-visible': {
          outline: '2px solid',
          outlineColor: 'accent.fg',
        },
      }}
    >
      {children}
    </Box>
  );
}

export default LineSelect;
