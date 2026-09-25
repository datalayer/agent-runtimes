/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A soft light breathing around a round button, as if it were alive.
 *
 * Two blurred halos in the button's colour swell and fade on cycles of
 * different lengths, 3.4 s and 5.3 s, so the light drifts rather than
 * blinks: the two never line up the same way twice in a row. For a reader
 * who asks the system for less motion, the halos hold still, a little dimmer.
 *
 * The halos sit behind the button: the parent must be `position: relative`
 * and make a stacking context of its own (`isolation: 'isolate'`), or they
 * would slip behind the page instead.
 *
 * @module chat/display/ButtonGlow
 */

import { Box } from '@datalayer/primer-addons';

export interface ButtonGlowProps {
  /**
   * The colour of the light: the button's own. A theme token or any CSS
   * colour; the theme's `accent.emphasis` when absent.
   */
  color?: string;
}

const halo = (color: string | undefined) =>
  ({
    position: 'absolute',
    inset: 0,
    borderRadius: '50%',
    bg: color || 'accent.emphasis',
    zIndex: -1,
    pointerEvents: 'none',
    willChange: 'transform, opacity',
  }) as const;

export function ButtonGlow({ color }: ButtonGlowProps) {
  return (
    <>
      {/* The breath: close to the button, the brighter of the two. */}
      <Box
        aria-hidden
        data-button-glow="breath"
        sx={{
          ...halo(color),
          filter: 'blur(10px)',
          animation: 'agentRuntimesGlowBreath 3.4s ease-in-out infinite',
          '@keyframes agentRuntimesGlowBreath': {
            '0%, 100%': { transform: 'scale(0.9)', opacity: 0.35 },
            '50%': { transform: 'scale(1.25)', opacity: 0.7 },
          },
          '@media (prefers-reduced-motion: reduce)': {
            animation: 'none',
            transform: 'scale(1.1)',
            opacity: 0.4,
          },
        }}
      />
      {/* The aura: wider and fainter, on a slower beat of its own. */}
      <Box
        aria-hidden
        data-button-glow="aura"
        sx={{
          ...halo(color),
          filter: 'blur(18px)',
          animation: 'agentRuntimesGlowAura 5.3s ease-in-out infinite',
          '@keyframes agentRuntimesGlowAura': {
            '0%, 100%': { transform: 'scale(1)', opacity: 0.15 },
            '40%': { transform: 'scale(1.55)', opacity: 0.4 },
            '70%': { transform: 'scale(1.3)', opacity: 0.25 },
          },
          '@media (prefers-reduced-motion: reduce)': {
            animation: 'none',
            transform: 'scale(1.3)',
            opacity: 0.2,
          },
        }}
      />
    </>
  );
}

export default ButtonGlow;
