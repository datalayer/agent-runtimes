/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The region under the prompt box, before its controls.
 *
 * What *describes* the prompt rather than acts on it: the context ring and the
 * token counts live here. It sits under the box because it is about the
 * conversation's budget rather than about the sentence being written, and
 * above `BelowPromptFooter` because a reading belongs nearer the thing it
 * reports on than the controls do.
 *
 * @module chat/prompt/header/BelowPromptHeader
 */

import type { ReactNode } from 'react';
import { PromptStacks, type PromptStack } from '../stack';

export interface BelowPromptHeaderProps {
  /** The bands, top to bottom. */
  stacks?: readonly PromptStack[];
  /** A single band, for the common case. Rendered before `stacks`. */
  children?: ReactNode;
  /** Dim and disable every band. */
  disabled?: boolean;
}

export function BelowPromptHeader({
  stacks,
  children,
  disabled,
}: BelowPromptHeaderProps) {
  // `children` and `stacks` compose rather than compete: the shorthand band
  // comes first, and declared bands follow it.
  const bands = [
    ...(children ? [{ id: 'default', content: children }] : []),
    ...(stacks ?? []),
  ];
  return <PromptStacks stacks={bands} disabled={disabled} />;
}

export default BelowPromptHeader;
