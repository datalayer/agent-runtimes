/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What the components of Datalayer's own share: the frame a block is drawn
 * in — the `loop` theme's card radius and Primer's colours, so a block reads
 * as part of the page it is on in either colour mode — its title, and the
 * sentence it says when what it was given cannot be drawn.
 *
 * @module components/a2ui/datalayer/parts
 */

import type { ReactNode } from 'react';
import { Heading, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';

/** The theme's card radius, Primer's 6px where no theme sets it. */
export const CARD_RADIUS = 'var(--theme-radius-card, 6px)';

/** A block's frame: its title above, what it draws inside. */
export function BlockFrame({
  title,
  label,
  weight,
  children,
  testId,
}: {
  title?: string;
  /** What assistive technologies call it when it has no title. */
  label: string;
  weight?: number;
  children: ReactNode;
  testId: string;
}) {
  return (
    <Box
      as="section"
      aria-label={title || label}
      data-testid={testId}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        minWidth: 0,
        boxSizing: 'border-box',
        p: 3,
        border: '1px solid',
        borderColor: 'border.default',
        borderRadius: CARD_RADIUS,
        bg: 'canvas.default',
        color: 'fg.default',
        ...(typeof weight === 'number'
          ? { flex: `${weight}`, minHeight: 0 }
          : null),
      }}
    >
      {title ? (
        <Heading as="h3" sx={{ fontSize: 2, m: 0 }}>
          {title}
        </Heading>
      ) : null}
      {children}
    </Box>
  );
}

/** What a block says instead of what it was given, when that cannot be drawn. */
export function Problem({ children }: { children: ReactNode }) {
  return (
    <Text as="p" role="status" sx={{ m: 0, color: 'danger.fg', fontSize: 1 }}>
      {children}
    </Text>
  );
}

/** A quiet sentence: nothing to show yet. */
export function Quiet({ children }: { children: ReactNode }) {
  return (
    <Text as="p" sx={{ m: 0, color: 'fg.muted', fontSize: 1 }}>
      {children}
    </Text>
  );
}

/** Whether a value is a record — an item of a list a block shows. */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A value as words in a cell, a point, a passage. */
export function asWords(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}
