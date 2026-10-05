/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A speech balloon over something that stands for the agent — the floating
 * assistant's character, or the floating popup's button while the chat is
 * closed: the agent's newest words, as the Office Assistant said them
 * (LOOP T-23), with *Open the conversation* when there is more — and an
 * approval it waits on, answered there with *Approve* or *Deny*.
 *
 * @module chat/assistant/SpeechBalloon
 */

import type { JSX } from 'react';
import { Button, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { ASSISTANT_WORDS, type BalloonApproval } from './state';

export interface SpeechBalloonProps {
  text: string;
  /** There is more than the balloon holds. */
  more?: boolean;
  /** Opens the conversation. */
  onOpen: () => void;
  /** How far from what it stands over, in pixels: above it, or below. */
  above: number;
  /** Above what speaks (the default), or below it when it sits at the top. */
  side?: 'above' | 'below';
  /** Which edge it is aligned to, toward the page's inside. */
  align: 'left' | 'right';
  /** Where the tail points, from that edge, in pixels. */
  tailAt: number;
  /** An approval it waits on: what is asked, and the two answers. */
  approval?: BalloonApproval;
}

export function SpeechBalloon({
  text,
  more = false,
  onOpen,
  above,
  side = 'above',
  align,
  tailAt,
  approval,
}: SpeechBalloonProps): JSX.Element {
  return (
    <Box
      role="status"
      aria-live="polite"
      data-speech-balloon=""
      sx={{
        position: 'absolute',
        // Pixels, as strings: a number here is read as the theme's space
        // scale (`-7` would be `-space[7]`, 48px).
        ...(side === 'above'
          ? { bottom: `${above}px` }
          : { top: `${above}px` }),
        [align]: 0,
        maxWidth: 280,
        width: 'max-content',
        px: 3,
        py: 2,
        bg: 'canvas.default',
        color: 'fg.default',
        border: '1px solid',
        borderColor: 'border.default',
        borderRadius: 'var(--theme-radius-bubble, 16px)',
        boxShadow: 'shadow.medium',
        fontSize: 1,
        textAlign: 'left',
        // The tail, toward what speaks.
        '&::after': {
          content: '""',
          position: 'absolute',
          ...(side === 'above' ? { bottom: '-7px' } : { top: '-7px' }),
          [align]: `${tailAt - 6}px`,
          width: 12,
          height: 12,
          bg: 'canvas.default',
          borderRight: '1px solid',
          borderBottom: '1px solid',
          borderColor: 'border.default',
          transform: side === 'above' ? 'rotate(45deg)' : 'rotate(225deg)',
        },
      }}
    >
      <Text as="p" sx={{ m: 0 }}>
        {text}
      </Text>
      {approval && (
        <Box data-balloon-approval={approval.id} sx={{ mt: 1 }}>
          <Text as="p" sx={{ m: 0, fontWeight: 'semibold' }}>
            {approval.asks}
          </Text>
          {approval.why ? (
            <Text as="p" sx={{ m: 0, color: 'fg.muted', fontSize: 0 }}>
              {approval.why}
            </Text>
          ) : null}
          <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
            <Button
              size="small"
              variant="primary"
              disabled={approval.deciding}
              onClick={approval.onApprove}
            >
              {ASSISTANT_WORDS.approve}
            </Button>
            <Button
              size="small"
              disabled={approval.deciding}
              onClick={approval.onDeny}
            >
              {ASSISTANT_WORDS.deny}
            </Button>
          </Box>
          {approval.others > 0 ? (
            <Text as="p" sx={{ m: 0, mt: 1, color: 'fg.muted', fontSize: 0 }}>
              {`${approval.others} more waiting.`}
            </Text>
          ) : null}
        </Box>
      )}
      {more && (
        <Box
          as="button"
          type="button"
          onClick={onOpen}
          sx={{
            mt: 1,
            p: 0,
            border: 0,
            bg: 'transparent',
            color: 'accent.fg',
            textDecoration: 'underline',
            cursor: 'pointer',
            fontSize: 1,
          }}
        >
          Open the conversation
        </Box>
      )}
    </Box>
  );
}

export default SpeechBalloon;
