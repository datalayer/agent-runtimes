/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React, { useLayoutEffect } from 'react';
import { Box } from '@datalayer/primer-addons';
import { useChatStore, useConversationStore } from '../../stores';
import { ChatAvailabilityProvider } from '../../chat/base/ChatAvailability';
import { useRuntimeTarget } from '../utils/runtimeTargetStore';

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
 *
 * And it declares, for every chat an example renders, whether there is an agent
 * to talk to. Two of the four runtime targets are a sandbox and nothing else,
 * and saying so once here is why no example has to know which: the chat shows
 * itself switched off, with the reason in its header, wherever it is mounted.
 */
export const ExampleWrapper: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { hasAgent, noAgentReason } = useRuntimeTarget();
  useLayoutEffect(() => {
    useChatStore.getState().reset();
    useConversationStore.getState().clearAll();
  }, []);
  return (
    <ChatAvailabilityProvider
      disabled={!hasAgent}
      disableReason={hasAgent ? undefined : noAgentReason}
    >
      <Box
        sx={{
          position: 'relative',
          height: '100%',
          width: '100%',
          minHeight: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          fontFamily:
            'var(--fontStack-sansSerif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif)',
          lineHeight: 1.5,
          '& h1, & h2, & h3, & h4, & h5, & h6, & p, & li, & span, & label, & button, & input, & textarea, & select':
            {
              fontFamily: 'inherit',
            },
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
    </ChatAvailabilityProvider>
  );
};

export default ExampleWrapper;
