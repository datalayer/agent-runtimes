/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The region inside the prompt box, above the input.
 *
 * Where the inline agent chips and any indicator that belongs *to what is
 * being written* go. Bounded by the prompt's own border, so what is here reads
 * as part of the field rather than as furniture around it.
 *
 * Takes a list of bands like every other region — see `chat/prompt/stack`. It
 * had one slot before, which is why a second thing above the input meant
 * editing the prompt.
 *
 * @module chat/prompt/header/InPromptHeader
 */

import type { ReactNode } from 'react';
import { PromptStacks, type PromptStack } from '../stack';

export interface InPromptHeaderProps {
  /** The bands, top to bottom. */
  stacks?: readonly PromptStack[];
  /**
   * A single band, for the common case.
   *
   * Equivalent to one stack called `default`, rendered before `stacks`; kept
   * because most callers have exactly one thing to put here and a list would
   * be ceremony.
   */
  children?: ReactNode;
  /** Dim and disable every band. */
  disabled?: boolean;
}

export function InPromptHeader({
  stacks,
  children,
  disabled,
}: InPromptHeaderProps) {
  // `children` and `stacks` compose rather than compete: the shorthand band
  // comes first, and declared bands follow it.
  const bands = [
    ...(children ? [{ id: 'default', content: children }] : []),
    ...(stacks ?? []),
  ];
  // The band above the input sits tighter to it than to the box's edge, which
  // is the asymmetry the prompt had before these regions were named.
  return (
    <PromptStacks
      stacks={bands.map(stack => ({ pt: 2, pb: 1, ...stack }))}
      disabled={disabled}
    />
  );
}

export default InPromptHeader;
