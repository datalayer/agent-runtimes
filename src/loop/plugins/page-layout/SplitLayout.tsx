/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The split: the conversation and the work side by side, one hairline
 * between them that a person drags (LOOP T-07, an Appspec's `layout: split`).
 *
 * The page layout's other arrangement. Where `page` puts the work on a sheet
 * and the conversation in a panel that opens when wanted, `split` keeps both
 * on screen: the conversation on the left — its transcript with the composer
 * under it — and the work on the right, the way the reference screens show a
 * mail, a document or the agent's computer beside the chat.
 *
 * The hairline is a separator a person can move with the pointer or the
 * keyboard (arrows by a step, Home and End to the bounds); the share it
 * leaves the conversation is kept while the workspace is mounted. The page
 * opens at the theme's pace (T-10, `paneOpening`).
 *
 * @module loop/plugins/page-layout/SplitLayout
 */

import type { JSX, KeyboardEvent, PointerEvent } from 'react';
import { useCallback, useRef, useState } from 'react';
import { Box } from '@datalayer/primer-addons';
import type { ChatLayoutParts } from '../../core';
import { paneOpening } from '../../shell/paneMotion';

/** The conversation's share of the width when the split opens. */
export const SPLIT_DEFAULT_SHARE = 0.4;
/** The narrowest and widest the conversation may be made. */
export const SPLIT_MIN_SHARE = 0.2;
export const SPLIT_MAX_SHARE = 0.8;
/** How far an arrow key moves the hairline. */
export const SPLIT_KEY_STEP = 0.05;

/** A share, held within the bounds. */
export function clampSplitShare(share: number): number {
  if (!Number.isFinite(share)) {
    return SPLIT_DEFAULT_SHARE;
  }
  return Math.min(SPLIT_MAX_SHARE, Math.max(SPLIT_MIN_SHARE, share));
}

/** Where a key moves the hairline, or `null` for a key it ignores. */
export function splitShareForKey(share: number, key: string): number | null {
  switch (key) {
    case 'ArrowLeft':
      return clampSplitShare(share - SPLIT_KEY_STEP);
    case 'ArrowRight':
      return clampSplitShare(share + SPLIT_KEY_STEP);
    case 'Home':
      return SPLIT_MIN_SHARE;
    case 'End':
      return SPLIT_MAX_SHARE;
    default:
      return null;
  }
}

export function SplitLayout({
  editors,
  hasEditor,
  transcript,
  prompt,
  chips,
  picker,
  transient,
}: ChatLayoutParts): JSX.Element {
  const [share, setShare] = useState(SPLIT_DEFAULT_SHARE);
  const row = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);

  const shareAt = useCallback((clientX: number): number | null => {
    const box = row.current?.getBoundingClientRect();
    if (!box || box.width <= 0) {
      return null;
    }
    return clampSplitShare((clientX - box.left) / box.width);
  }, []);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) {
      return;
    }
    const next = shareAt(event.clientX);
    if (next !== null) {
      setShare(next);
    }
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = splitShareForKey(share, event.key);
    if (next !== null) {
      event.preventDefault();
      setShare(next);
    }
  };

  const percent = Math.round(share * 100);
  return (
    <Box
      data-testid="loop-split-layout"
      flex="1 1 auto"
      minHeight={0}
      display="flex"
      flexDirection="column"
    >
      {picker}
      <Box
        ref={row}
        flex="1 1 auto"
        minHeight={0}
        display="flex"
        // The hidden editors position themselves against this row.
        position="relative"
        overflow="hidden"
      >
        <Box
          data-testid="loop-split-conversation"
          flex={hasEditor ? `0 0 ${percent}%` : '1 1 auto'}
          minWidth={0}
          minHeight={0}
          display="flex"
          flexDirection="column"
          // The transcript draws a rule on its left when an editor is on
          // screen, for the split it sits on the right of. Here it is on
          // the left, and the hairline is the separator: the rule is
          // pushed out of the row, which clips it.
          ml={hasEditor ? '-1px' : 0}
        >
          {transcript}
          {chips}
          {prompt}
        </Box>
        {hasEditor ? (
          <Box
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize the conversation and the page"
            aria-valuemin={Math.round(SPLIT_MIN_SHARE * 100)}
            aria-valuemax={Math.round(SPLIT_MAX_SHARE * 100)}
            aria-valuenow={percent}
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
            // A hairline to the eye, a few pixels to the pointer.
            flex="0 0 7px"
            mx="-3px"
            zIndex={1}
            cursor="col-resize"
            display="flex"
            justifyContent="center"
            outline="none"
            sx={{
              touchAction: 'none',
              '&::before': {
                content: '""',
                width: '1px',
                height: '100%',
                bg: 'border.default',
              },
              '&:hover::before, &:focus-visible::before': {
                width: '3px',
                bg: 'accent.emphasis',
              },
            }}
          />
        ) : null}
        <Box
          data-testid="loop-split-page"
          sx={
            hasEditor
              ? {
                  flex: '1 1 0',
                  minWidth: 0,
                  minHeight: 0,
                  display: 'flex',
                  // The page opening beside the conversation, at the theme's
                  // pace (T-10): no motion where the theme sets none.
                  ...paneOpening('right'),
                }
              : // Mounted but out of sight: the editors keep their place.
                {
                  position: 'absolute',
                  inset: 0,
                  visibility: 'hidden',
                  pointerEvents: 'none',
                  zIndex: -1,
                }
          }
        >
          {editors}
        </Box>
      </Box>
      {transient}
    </Box>
  );
}

export default SplitLayout;
