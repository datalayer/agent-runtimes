/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application's presence in its chat (LOOP T-08): its face, with a quiet
 * motion around it while it thinks or works, and one line saying what it is
 * doing. The face is never redrawn; the motion is a soft ring in the accent,
 * still under `prefers-reduced-motion`, and the line changes at the theme's
 * status pace (T-10). Paused, the ring is a still, muted dashed circle and
 * the face is dimmed: nothing moves around something that does nothing.
 *
 * @module chat/presence/Presence
 */

import type { ReactNode } from 'react';
import { Box } from '@datalayer/primer-addons';
import { Text } from '@primer/react';
import { FluentEmoji } from '@datalayer/core/lib/components/emoji';
import { PRESENCE_LINES, type PresenceState } from './presenceStatus';

const ACCENT = 'var(--loop-accent, var(--fgColor-accent))';

/**
 * A face at `size`: an emoji drawn in Fluent Emoji, the same on every
 * platform (LOOP T-20) — the system's, as text, only for one Datalayer ships
 * no drawing of — or a host's own drawing, left as it is.
 */
export function FaceDrawing({ face, size }: { face: ReactNode; size: number }) {
  return typeof face === 'string' ? (
    <FluentEmoji emoji={face} size={size} label="" />
  ) : (
    <>{face}</>
  );
}

export function PresenceFace({
  face,
  size,
  state,
}: {
  /**
   * The face: an emoji, drawn at `size`, or a host's own drawing of it — an
   * avatar on its disc (I-07) — as wide as `size`.
   */
  face: ReactNode;
  size: number;
  state: PresenceState;
}) {
  const active = state === 'thinking' || state === 'working';
  const paused = state === 'paused';
  return (
    <Box
      as="span"
      aria-hidden
      data-presence={state}
      position="relative"
      display="inline-flex"
      alignItems="center"
      justifyContent="center"
      width={size + 8}
      height={size + 8}
      flexShrink={0}
      fontSize={size}
      lineHeight={1}
    >
      <Box
        as="span"
        position="absolute"
        inset={0}
        borderRadius="50%"
        boxShadow={paused ? 'none' : `0 0 0 2px ${ACCENT}`}
        border={paused ? '2px dashed' : 'none'}
        borderColor="border.default"
        opacity={active || state === 'waiting' || paused ? 0.9 : 0}
        transition="opacity var(--theme-motion-status, 0ms) var(--theme-motion-easing, ease)"
        animation={
          active ? 'loopPresenceBreath 1.8s ease-in-out infinite' : 'none'
        }
        reducedMotion={{ animation: 'none' }}
        sx={{
          '@keyframes loopPresenceBreath': {
            '0%, 100%': { transform: 'scale(0.92)', opacity: 0.35 },
            '50%': { transform: 'scale(1.06)', opacity: 0.9 },
          },
        }}
      />
      <Box
        as="span"
        display="inline-flex"
        opacity={paused ? 0.55 : 1}
        filter={paused ? 'grayscale(0.6)' : 'none'}
        transition="opacity var(--theme-motion-status, 0ms) var(--theme-motion-easing, ease)"
      >
        <FaceDrawing face={face} size={size} />
      </Box>
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
