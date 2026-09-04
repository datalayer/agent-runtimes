/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The turn panel: the current turn, hung on the composer.
 *
 * On the page layout the transcript is a side panel that starts closed, so
 * without this a person who asks something sees cells appear and no word from
 * whoever is writing them. This shows the turn where the eye already is: the
 * message just sent, then the reply as it streams — and, while a tool runs,
 * what the agent is doing in the page ("Analyst is adding a cell…") — in the
 * prompt's own card. Under it, by configuration, the transcript's turn footer,
 * only its copy and dismiss actions, or nothing. A new message replaces it
 * all: the turn feed is the last turn only, and that is the panel's contract.
 *
 * Plain text, deliberately, with the markdown marks taken off; the transcript
 * renders it, and is one click away. Here it is a running line of what the
 * agent is saying, not a second transcript.
 *
 * @module loop/plugins/page-layout/TurnPanel
 */

import type { JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, IconButton, Text } from '@primer/react';
import {
  CheckIcon,
  CommentDiscussionIcon,
  CopyIcon,
  XIcon,
} from '@primer/octicons-react';
import { useContributions, useSignalValue } from '@datalayer/reactor/react';
import { signal } from '@datalayer/reactor';
import { TurnFooter } from '../../../chat/messages/TurnFooter';
import { LoopChatTurn, type ChatTurnSnapshot } from '../../core';
import { openConversationPanel } from './panelState';
import { flattenMarkdown } from './plainText';

/* A signal to read when no chat contributed a turn: the hook needs one. */
const NO_TURN = signal<ChatTurnSnapshot>({ id: 0, status: 'idle' });

/** How much of the reply the panel shows before it scrolls. */
const MAX_HEIGHT = 168;

export type TurnPanelFooter = 'full' | 'actions' | 'none';

/** The three dots, while the agent has said nothing yet. */
function Thinking(): JSX.Element {
  return (
    <Box
      as="span"
      aria-label="The agent is thinking"
      sx={{
        display: 'inline-flex',
        gap: '4px',
        alignItems: 'center',
        height: '1.5em',
        '& > i': {
          width: 5,
          height: 5,
          borderRadius: '50%',
          bg: 'fg.muted',
          animation: 'loop-turn-dot 1.2s ease-in-out infinite',
        },
        '& > i:nth-of-type(2)': { animationDelay: '0.15s' },
        '& > i:nth-of-type(3)': { animationDelay: '0.3s' },
        '@keyframes loop-turn-dot': {
          '0%, 80%, 100%': { opacity: 0.25 },
          '40%': { opacity: 1 },
        },
      }}
    >
      <i />
      <i />
      <i />
    </Box>
  );
}

export function TurnPanel({
  footer = 'full',
}: {
  footer?: TurnPanelFooter;
}): JSX.Element | null {
  const entries = useContributions(LoopChatTurn);
  const turn = useSignalValue(entries[0]?.value.turn ?? NO_TURN);
  const replyRef = useRef<HTMLDivElement | null>(null);
  /*
   * Dismissed, per turn: the panel goes away until the next message — the
   * transcript keeps the turn, one click away. Keyed on the turn's id so a
   * new turn shows again unasked.
   */
  const [dismissedId, setDismissedId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  // Follow the reply as it grows: the newest words are the ones wanted.
  useEffect(() => {
    const el = replyRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [turn.assistant]);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copyTurn = useCallback(async () => {
    const text = [turn.user, turn.assistant].filter(Boolean).join('\n\n');
    await navigator.clipboard?.writeText(text);
    setCopied(true);
  }, [turn.user, turn.assistant]);

  if (turn.status === 'idle' || !turn.user || dismissedId === turn.id) {
    return null;
  }

  const working = turn.status === 'thinking' || turn.status === 'streaming';

  return (
    <Box
      data-turn-panel=""
      sx={{
        borderTop: '1px solid',
        borderColor: 'border.muted',
        px: 3,
        pt: 2,
        pb: footer === 'none' ? 2 : 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        bg: 'canvas.default',
      }}
    >
      {/* What was asked, as a compact line on the trailing edge — the same
          side a transcript puts the person on. */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Text
          sx={{
            fontSize: 0,
            lineHeight: 1.45,
            px: 2,
            py: 1,
            borderRadius: '10px',
            bg: 'accent.subtle',
            color: 'fg.default',
            maxWidth: '85%',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {turn.user}
        </Text>
      </Box>

      {/* The reply so far — or what the agent is doing, or the dots. */}
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
        <Box
          ref={replyRef}
          sx={{
            flex: '1 1 auto',
            minWidth: 0,
            maxHeight: MAX_HEIGHT,
            overflowY: 'auto',
            fontSize: 0,
            lineHeight: 1.5,
            color: turn.assistant ? 'fg.default' : 'fg.muted',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
          }}
        >
          {turn.assistant ? (
            flattenMarkdown(turn.assistant)
          ) : turn.activity ? (
            <Text sx={{ color: 'fg.muted', fontStyle: 'italic' }}>
              {turn.activity}
            </Text>
          ) : working ? (
            <Thinking />
          ) : turn.status === 'error' ? (
            'The agent could not answer.'
          ) : (
            'Done — the result is in the page.'
          )}
        </Box>
        {/* The whole conversation is one click away. */}
        <IconButton
          icon={CommentDiscussionIcon}
          size="small"
          variant="invisible"
          aria-label="Open the conversation"
          onClick={openConversationPanel}
          sx={{ color: 'fg.muted', flexShrink: 0 }}
        />
      </Box>

      {/* What the agent is doing, while the reply is still coming: under the
          text once there is some, so the line is never lost behind it. */}
      {turn.assistant && turn.activity ? (
        <Text sx={{ fontSize: 0, color: 'fg.muted', fontStyle: 'italic' }}>
          {turn.activity}
        </Text>
      ) : null}

      {footer === 'full' ? (
        // The same footer the transcript draws under a turn: the window's
        // fill, this turn's tokens in and out, copy, and dismiss.
        <TurnFooter
          usage={turn.usage}
          live={working}
          latest
          padding={0}
          onCopy={copyTurn}
          onRemove={() => setDismissedId(turn.id)}
        />
      ) : footer === 'actions' ? (
        // The actions without the counters, for a host whose readers are not
        // asking about tokens.
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 1,
            mt: -1,
          }}
        >
          <IconButton
            icon={copied ? CheckIcon : CopyIcon}
            size="small"
            variant="invisible"
            aria-label={copied ? 'Copied' : 'Copy this turn'}
            onClick={() => void copyTurn()}
            sx={{ color: 'fg.muted' }}
          />
          <IconButton
            icon={XIcon}
            size="small"
            variant="invisible"
            aria-label="Dismiss until the next turn"
            onClick={() => setDismissedId(turn.id)}
            sx={{ color: 'fg.muted' }}
          />
        </Box>
      ) : null}
    </Box>
  );
}

export default TurnPanel;
