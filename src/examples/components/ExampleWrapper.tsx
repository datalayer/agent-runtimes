/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React, { useLayoutEffect } from 'react';
import { Box } from '@datalayer/primer-addons';
import { useChatStore, useConversationStore } from '../../stores';

/**
 * ExampleWrapper
 *
 * Provides every example with a definite-height, scroll-clipped container
 * that fills the parent content area exactly. Examples mounted inside
 * should treat this as their viewport: use `height: '100%'` on their
 * root, then own their internal flex/grid layout (and place any internal
 * scrollers on dedicated panels with `minHeight: 0` + `overflow: 'auto'`).
 *
 * Also clears the shared chat + conversation stores synchronously as the
 * new example mounts, so switching examples never leaks messages from the
 * previously-mounted chat.
 */
export const ExampleWrapper: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  useLayoutEffect(() => {
    useChatStore.getState().reset();
    useConversationStore.getState().clearAll();
  }, []);
  return (
    <Box
      sx={{
        position: 'relative',
        height: '100%',
        width: '100%',
        minHeight: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        // Generic constraint: every example's root child fills the wrapper
        // exactly and cannot exceed it. This neutralises stray `100vh`/
        // `calc(100vh - Npx)` heights inside individual examples so the
        // chat footer (or any bottom UI) always remains in the viewport.
        '& > *': {
          flex: '1 1 0',
          minHeight: 0,
          maxHeight: '100%',
          width: '100%',
          // Default scroll behaviour for plain content pages. Examples
          // that manage their own internal scrollers can override this
          // by setting `overflow: 'hidden'` (or another value) on their
          // root element \u2014 the child rule wins on specificity.
          overflow: 'auto',
        },
      }}
    >
      {children}
    </Box>
  );
};

export default ExampleWrapper;
