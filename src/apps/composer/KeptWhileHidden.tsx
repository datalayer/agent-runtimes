/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A part of the application's page kept mounted while another is shown — a
 * running Preview, an open dialog and what each card read survive a change of
 * part — and not drawn again while it is hidden.
 *
 * Hidden, it hands React the very elements it last drew, which React does not
 * draw again: a drop on the Canvas re-draws Compose, not the cards of the five
 * other parts, nor the designer's Preview and Python while the Agent is shown.
 * A card's own state still updates it, hidden or not; shown again, it is drawn
 * with what the page has now.
 *
 * @module apps/composer/KeptWhileHidden
 */

import type { JSX, ReactNode } from 'react';
import { useRef } from 'react';
import { Box } from '@datalayer/primer-addons';

export function KeptWhileHidden({
  hidden,
  label,
  as = 'section',
  children,
  ...data
}: {
  hidden: boolean;
  /** Its name, said to a screen reader. */
  label?: string;
  /** A part of the page (`section`), or a surface of the designer (`div`). */
  as?: 'section' | 'div';
  children: ReactNode;
  /** Its `data-*` attributes, which a test or a probe finds it by. */
  [data: `data-${string}`]: string | undefined;
}): JSX.Element {
  const drawn = useRef<ReactNode>(children);
  if (!hidden) {
    drawn.current = children;
  }
  return (
    <Box as={as} hidden={hidden} aria-label={label} {...data}>
      {drawn.current}
    </Box>
  );
}
