/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Three pulsing dots: a speaker is still at work and has not written yet —
 * the chat's waiting indicator, and the assistant's balloon's. Still, but
 * shown, for a reader who asks for reduced motion. Hidden from a screen
 * reader: the live region beside it says the state.
 *
 * @module chat/indicators/TypingDots
 */

import type { ReactElement } from 'react';
import { Box } from '@datalayer/primer-addons';

export function TypingDots({ size = 8 }: { size?: number }): ReactElement {
  return (
    <Box
      aria-hidden="true"
      data-typing-dots=""
      sx={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
    >
      {[0, 0.2, 0.4].map((delay, index) => (
        <Box
          key={index}
          sx={{
            width: size,
            height: size,
            borderRadius: '50%',
            bg: 'fg.muted',
            animation: 'typingPulse 1.4s ease-in-out infinite',
            animationDelay: `${delay}s`,
            '@keyframes typingPulse': {
              '0%, 60%, 100%': { transform: 'scale(0.6)', opacity: 0.4 },
              '30%': { transform: 'scale(1)', opacity: 1 },
            },
            '@media (prefers-reduced-motion: reduce)': {
              animation: 'none',
              opacity: 0.7,
            },
          }}
        />
      ))}
    </Box>
  );
}

export default TypingDots;
