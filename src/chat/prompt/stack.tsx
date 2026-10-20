/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A stack: one horizontal band around the prompt.
 *
 * The prompt has four regions — above and below the input, each of those
 * either inside the bordered box or under it — and every one of them is a
 * *list* of bands rather than a single slot. That was already true of the
 * footers, where the context ring and the controls bar are two bands with
 * different rules; it was not true of the headers, which had one slot and no
 * way to add a second without editing the prompt.
 *
 * Naming the regions is the point of this module's neighbours:
 *
 * | | above the input | below the input |
 * | --- | --- | --- |
 * | inside the box | `InPromptHeader` | `InPromptFooter` |
 * | under the box | `BelowPromptHeader` | `BelowPromptFooter` |
 *
 * @module chat/prompt/stack
 */

import type { ReactNode } from 'react';
import { useTheme } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { ASSISTANT_CLEARANCE_VAR } from '../assistant/clearance';

/** Primer's space scale, for a band drawn without a theme. */
const PRIMER_SPACE = [
  '0',
  '4px',
  '8px',
  '16px',
  '24px',
  '32px',
  '40px',
  '48px',
  '64px',
] as const;

/**
 * A theme space step (`px={2}`) as a CSS length, from the theme's scale or
 * else Primer's own.
 */
export function spaceLength(
  step: number,
  scale: readonly (string | number)[] = PRIMER_SPACE,
): string {
  const value = scale[step] ?? PRIMER_SPACE[step] ?? `${step * 8}px`;
  return typeof value === 'number' ? `${value}px` : value;
}

/**
 * The right padding of a band that `clearsAssistant`: the floating
 * assistant's clearance while it stands in a bottom corner (what it covers
 * from the window's right edge, `--assistant-clearance`), so that the
 * character is never drawn over the band's controls and never takes their
 * clicks; else the band's own `padding`, a CSS length.
 */
export function clearOfAssistant(padding: string): string {
  return `var(${ASSISTANT_CLEARANCE_VAR}, ${padding})`;
}

/** One band in a region. */
export type PromptStack = {
  /** Identity, for React and for a host reasoning about which band is which. */
  id: string;
  /** What the band shows. A band with nothing in it is not rendered. */
  content?: ReactNode;
  /**
   * Reserve this height even when the band is empty.
   *
   * For content that arrives late and would otherwise make the layout jump —
   * token usage is the case this exists for. Left unset, an empty band takes
   * no space at all, which is what a band with nothing coming should do: a
   * permanent white stripe reserved for something that never arrives reads as
   * a rendering fault.
   */
  minHeight?: number;
  /**
   * Dim the band and make it inert.
   *
   * Opacity rather than `grayscale`, which takes the theme with it: a
   * workspace on the Jupyter variant showed a grey strip under a coloured
   * page, as though the theme had failed rather than the controls being
   * unavailable. Opacity alone says "not now" without saying "not yours".
   */
  disabled?: boolean;
  /** A rule above the band, separating it from what precedes it. */
  bordered?: boolean;
  /** A tinted ground, for a band of controls rather than of information. */
  subtle?: boolean;
  /** Horizontal padding, in theme units. */
  px?: number | number[];
  /** Vertical padding, in theme units. */
  py?: number;
  /** Top padding, overriding `py`. The bands around the input are asymmetric. */
  pt?: number;
  /** Bottom padding, overriding `py`. */
  pb?: number;
  /** Space between the items in the band. */
  gap?: number;
  /**
   * How the band lays its content out.
   *
   * `'row'` — the default — is a flex row of controls: menus, indicators,
   * buttons, laid out with `gap`.
   *
   * `'block'` is for content that *is* the band and draws its own full width.
   * The context ring is one: it brings its own padding and background, and in
   * a flex row it shrinks to its content and leaves the rest of the row
   * showing the page behind it — a pale stripe down the right-hand side.
   */
  layout?: 'row' | 'block';
  /**
   * Keep the band's right end clear of the floating assistant while it
   * stands in a bottom corner: its right padding becomes the assistant's
   * clearance (`--assistant-clearance`), so that the character is never
   * drawn over the band's controls and never takes their clicks. For a band
   * that runs to the page's right edge, as the composer's session controls
   * do on an application's page.
   */
  clearsAssistant?: boolean;
};

export type PromptStacksProps = {
  /** The bands, top to bottom. */
  stacks: readonly PromptStack[];
  /** Applied to every band, for a region that is disabled as a whole. */
  disabled?: boolean;
};

/**
 * Whether a band would draw anything.
 *
 * A band kept for its `minHeight` still counts: reserving the space is the
 * whole reason it is there.
 */
function isRendered(stack: PromptStack): boolean {
  return Boolean(stack.content) || Boolean(stack.minHeight);
}

/** Render a region's bands, skipping the ones with nothing to show. */
export function PromptStacks({
  stacks,
  disabled = false,
}: PromptStacksProps): React.JSX.Element | null {
  const visible = stacks.filter(isRendered);
  const { theme } = useTheme();
  if (visible.length === 0) {
    return null;
  }

  return (
    <>
      {visible.map(stack => {
        const isDisabled = disabled || stack.disabled;
        const px = stack.px ?? 2;
        const right = Array.isArray(px) ? px[px.length - 1] : px;
        return (
          <Box
            key={stack.id}
            data-prompt-stack={stack.id}
            aria-disabled={isDisabled || undefined}
            px={px}
            data-clears-assistant={stack.clearsAssistant ? '' : undefined}
            sx={
              stack.clearsAssistant
                ? {
                    paddingRight: clearOfAssistant(
                      spaceLength(right, theme?.space as string[] | undefined),
                    ),
                  }
                : undefined
            }
            py={stack.py ?? 1}
            minHeight={stack.minHeight}
            display={stack.layout === 'block' ? undefined : 'flex'}
            alignItems={stack.layout === 'block' ? undefined : 'center'}
            gap={stack.layout === 'block' ? undefined : (stack.gap ?? 2)}
            pt={stack.pt === undefined ? undefined : stack.pt}
            pb={stack.pb === undefined ? undefined : stack.pb}
            borderTop={stack.bordered ? '1px solid' : undefined}
            borderColor={stack.bordered ? 'border.default' : undefined}
            bg={stack.subtle ? 'canvas.subtle' : undefined}
            opacity={isDisabled ? 0.5 : undefined}
            pointerEvents={isDisabled ? 'none' : undefined}
          >
            {stack.content}
          </Box>
        );
      })}
    </>
  );
}

export default PromptStacks;
