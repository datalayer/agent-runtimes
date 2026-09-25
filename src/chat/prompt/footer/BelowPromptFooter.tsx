/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The region under the prompt box: its controls.
 *
 * The agents, tools, skills and model menus are one band today; the region is
 * a list because it has already had two, and because a host adding a third
 * should not have to edit the prompt to do it.
 *
 * Under the box rather than inside it because these choose what the *session*
 * does, not what the sentence says — and because the box is the field, which
 * ought to look like one.
 *
 * @module chat/prompt/footer/BelowPromptFooter
 */

import type { ReactNode } from 'react';
import { PromptStacks, type PromptStack } from '../stack';

export interface BelowPromptFooterProps {
  /** The bands, top to bottom. */
  stacks?: readonly PromptStack[];
  /** A single band, for the common case. Rendered before `stacks`. */
  children?: ReactNode;
  /** Dim and disable every band. */
  disabled?: boolean;
}

export function BelowPromptFooter({
  stacks,
  children,
  disabled,
}: BelowPromptFooterProps) {
  // `children` and `stacks` compose rather than compete: the shorthand band
  // comes first, and declared bands follow it.
  const bands = [
    ...(children ? [{ id: 'default', content: children }] : []),
    ...(stacks ?? []),
  ];
  return <PromptStacks stacks={bands} disabled={disabled} />;
}

export default BelowPromptFooter;
