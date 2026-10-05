/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The floating assistant's conversation, open: a balloon over the character
 * that holds the conversation itself — the history as the chat draws it, the
 * welcome first, an approval as a message with *Approve* and *Deny* (T-23),
 * the composer last — with no header and no footer, a tail toward the
 * character, a close control, and a height that leaves the page in sight
 * while the history scrolls inside it.
 *
 * Closed, the character peeks instead (`SpeechBalloon`): one short line, and
 * what it needs to be answered.
 *
 * @module chat/assistant/ConversationBalloon
 */

import type { JSX } from 'react';
import { useEffect, useRef } from 'react';
import { Button, IconButton, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { XIcon } from '@primer/octicons-react';
import { ASSISTANT_WORDS, type BalloonApproval } from './state';

/** The open balloon's width, in pixels. */
export const CONVERSATION_BALLOON_WIDTH = 380;

/** The open balloon's tallest, in pixels, and its share of the window. */
export const CONVERSATION_BALLOON_MAX_HEIGHT = 560;
export const CONVERSATION_BALLOON_VIEWPORT_SHARE = 0.6;

/** The open balloon's height for a window this tall: 60% of it, 560px at most. */
export function conversationBalloonHeight(viewportHeight: number): number {
  return Math.max(
    240,
    Math.min(
      CONVERSATION_BALLOON_MAX_HEIGHT,
      Math.round(viewportHeight * CONVERSATION_BALLOON_VIEWPORT_SHARE),
    ),
  );
}

/**
 * Where the open balloon's tail points: from its bottom edge (the balloon
 * above the character) or its top edge (below it), `at` pixels from its
 * left; none when the balloon stands beside the character.
 */
export type BalloonTail =
  { edge: 'bottom' | 'top'; at: number } | { edge: 'none' };

/** The tail's half width, in pixels. */
const TAIL = 7;

/**
 * The tail toward a character whose middle is `characterMiddle` pixels from
 * the window's left, under or over a balloon whose left is `balloonLeft`:
 * kept off the balloon's rounded corners.
 */
export function balloonTailAt(
  characterMiddle: number,
  balloonLeft: number,
  width = CONVERSATION_BALLOON_WIDTH,
): number {
  return Math.min(
    width - 24 - TAIL,
    Math.max(24, characterMiddle - balloonLeft - TAIL),
  );
}

/**
 * The open balloon's shape: the bubble's radius, and its tail — drawn in the
 * colour of what it leaves (`tailBg`): the composer's band under the
 * history, the history over it.
 */
export function conversationBalloonSx(
  tail: BalloonTail,
  tailBg = 'canvas.default',
): Record<string, unknown> {
  return {
    borderRadius: 'var(--theme-radius-bubble, 16px)',
    overflow: 'visible',
    ...(tail.edge === 'none'
      ? {}
      : {
          '&::after': {
            content: '""',
            position: 'absolute',
            ...(tail.edge === 'bottom'
              ? { bottom: `-${TAIL}px` }
              : { top: `-${TAIL}px` }),
            left: `${tail.at}px`,
            width: `${TAIL * 2}px`,
            height: `${TAIL * 2}px`,
            bg: tailBg,
            borderRight: '1px solid',
            borderBottom: '1px solid',
            borderColor: 'border.default',
            transform:
              tail.edge === 'bottom' ? 'rotate(45deg)' : 'rotate(225deg)',
            pointerEvents: 'none',
          },
        }),
  };
}

/** The open balloon's close control, over its top right corner. */
export function ConversationBalloonClose({
  name,
  onClose,
}: {
  /** Who is talking: "Close the conversation with Paper clip". */
  name?: string;
  onClose: () => void;
}): JSX.Element {
  return (
    <Box
      data-conversation-balloon-close=""
      sx={{ position: 'absolute', top: '6px', right: '6px', zIndex: 30 }}
    >
      <IconButton
        icon={XIcon}
        size="small"
        variant="invisible"
        aria-label={
          name
            ? `Close the conversation with ${name}`
            : 'Close the conversation'
        }
        onClick={onClose}
        sx={{ bg: 'canvas.default', borderRadius: '50%' }}
      />
    </Box>
  );
}

/**
 * An approval the agent waits on, as a message of the history: what it asks
 * to do, the rule it was asked under, *Approve* and *Deny*, and how many more
 * wait (T-23). Brought into view when it arrives.
 */
export function BalloonApprovalMessage({
  approval,
}: {
  approval: BalloonApproval;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: 'nearest' });
  }, [approval.id]);
  return (
    <Box
      ref={ref}
      data-balloon-approval={approval.id}
      sx={{ px: 3, py: 2, display: 'flex' }}
    >
      <Box
        sx={{
          maxWidth: '90%',
          px: 3,
          py: 2,
          bg: 'attention.subtle',
          border: '1px solid',
          borderColor: 'attention.muted',
          borderRadius: 'var(--theme-radius-bubble, 16px)',
          fontSize: 1,
        }}
      >
        <Text as="p" sx={{ m: 0, color: 'fg.muted', fontSize: 0 }}>
          {ASSISTANT_WORDS.approval}
        </Text>
        <Text as="p" sx={{ m: 0, fontWeight: 'semibold' }}>
          {approval.asks}
        </Text>
        {approval.why ? (
          <Text as="p" sx={{ m: 0, color: 'fg.muted', fontSize: 0 }}>
            {approval.why}
          </Text>
        ) : null}
        <Box sx={{ display: 'flex', gap: 2, mt: 2, alignItems: 'center' }}>
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
          {approval.others > 0 ? (
            <Text sx={{ color: 'fg.muted', fontSize: 0 }}>
              {moreWaiting(approval.others)}
            </Text>
          ) : null}
        </Box>
      </Box>
    </Box>
  );
}

/** How many more wait, in two words: "2 more". */
export function moreWaiting(others: number): string {
  return `${others} more`;
}

/** How much of a message a peek says: its first words. */
export const PEEK_LIMIT = 60;

/**
 * A message's first words, for a peek: cut at a word, with an ellipsis, and
 * whether there was more.
 */
export function peekLine(
  text: string,
  limit = PEEK_LIMIT,
): { text: string; more: boolean } {
  const plain = text.replace(/\s+/g, ' ').trim();
  if (plain.length <= limit) {
    return { text: plain, more: false };
  }
  const cut = plain.slice(0, limit);
  const atWord = cut.slice(0, Math.max(cut.lastIndexOf(' '), limit * 0.6));
  return { text: `${atWord.trimEnd()}…`, more: true };
}
