/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application's presence in its chat (LOOP T-08): its face, with a quiet
 * motion around it while it thinks or works, and one line saying what it is
 * doing. The face is never redrawn; the motion is a soft ring in the accent,
 * still under `prefers-reduced-motion`, and the line changes at the theme's
 * status pace (T-10).
 *
 * @module loop/plugins/chat/Presence
 */

import { Box, Text } from '@primer/react';
import { PRESENCE_LINES, type PresenceState } from './presenceStatus';

const ACCENT = 'var(--loop-accent, var(--fgColor-accent))';

export function PresenceFace({
  face,
  size,
  state,
}: {
  face: string;
  size: number;
  state: PresenceState;
}) {
  const active = state === 'thinking' || state === 'working';
  return (
    <Box
      as="span"
      aria-hidden
      data-presence={state}
      sx={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size + 8,
        height: size + 8,
        flexShrink: 0,
        fontSize: size,
        lineHeight: 1,
      }}
    >
      <Box
        as="span"
        sx={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          boxShadow: `0 0 0 2px ${ACCENT}`,
          opacity: active ? 0.9 : state === 'waiting' ? 0.9 : 0,
          transition:
            'opacity var(--theme-motion-status, 0ms) var(--theme-motion-easing, ease)',
          animation: active
            ? 'loopPresenceBreath 1.8s ease-in-out infinite'
            : 'none',
          '@keyframes loopPresenceBreath': {
            '0%, 100%': { transform: 'scale(0.92)', opacity: 0.35 },
            '50%': { transform: 'scale(1.06)', opacity: 0.9 },
          },
          '@media (prefers-reduced-motion: reduce)': {
            animation: 'none',
          },
        }}
      />
      {face}
    </Box>
  );
}

export function PresenceLine({ state }: { state: PresenceState }) {
  return (
    <Text
      role="status"
      aria-live="polite"
      data-presence-line={state}
      sx={{
        fontSize: 0,
        color: state === 'waiting' ? 'fg.default' : 'fg.muted',
        fontWeight: state === 'waiting' ? 'semibold' : 'normal',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {PRESENCE_LINES[state]}
    </Text>
  );
}
