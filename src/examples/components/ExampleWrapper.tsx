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
 * Wraps every example in a fixed-height container that accounts for
 * the 60 px header bar. Examples inside can use `100vh` or `100%`
 * freely — the wrapper clips and scrolls as needed.
 *
 * Also clears the shared chat + conversation stores synchronously as the
 * new example mounts, so switching examples never leaks messages from the
 * previously-mounted chat (``handleExampleChange`` in ``main.tsx`` already
 * resets these, but a last-millisecond WebSocket callback from the old
 * example can repopulate them between reset and the new mount — this
 * ``useLayoutEffect`` closes that race).
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
        height: 'calc(100vh - 60px)',
        width: '100%',
        overflow: 'auto',
        position: 'relative',
      }}
    >
      {children}
    </Box>
  );
};

export default ExampleWrapper;
