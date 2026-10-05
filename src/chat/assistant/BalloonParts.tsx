/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The parts the two balloon displays are drawn with (LOOP T-23): the tool
 * line ("Using **list_invoices**…"), what a screen reader hears of it, the
 * `current` balloon's *Now*, and the `history` balloon's header
 * ("Conversation · 6").
 *
 * @module chat/assistant/BalloonParts
 */

import type { JSX, ReactNode } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { CheckIcon, ToolsIcon, XIcon } from '@primer/octicons-react';
import { SpecMark, hasMark, marksOfToolCall } from '../marks';
import { TypingDots } from '../indicators/TypingDots';
import {
  toolAnnouncement,
  toolLineParts,
  type BalloonToolLine,
  type ToolLinePhase,
} from './toolLine';

/** Out of sight, still heard. */
const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;

const PHASE_COLOR: Record<ToolLinePhase, string> = {
  running: 'fg.muted',
  done: 'success.fg',
  failed: 'danger.fg',
};

/**
 * A tool call in the balloon, in plain words: its mark when the catalogue
 * gives one (an MCP server's, a skill's, a tool set's), else a tool; "Using
 * **list_invoices**…", "Done: **list_invoices**", "**list_invoices** failed".
 * Seen, not read out: {@link ToolLineAnnouncer} says it once per change.
 */
export function BalloonToolLineView({
  line,
}: {
  line: BalloonToolLine;
}): JSX.Element {
  const { before, name, after } = toolLineParts(line);
  const marks = line.tool ? marksOfToolCall(line.tool, undefined) : null;
  const Icon =
    line.phase === 'done'
      ? CheckIcon
      : line.phase === 'failed'
        ? XIcon
        : ToolsIcon;
  return (
    <Box
      as="span"
      aria-hidden="true"
      data-balloon-tool={line.phase}
      data-balloon-tool-name={line.tool || undefined}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        minWidth: 0,
        maxWidth: '100%',
        color: line.phase === 'failed' ? 'danger.fg' : 'fg.default',
      }}
    >
      <Box
        as="span"
        sx={{
          display: 'inline-flex',
          flexShrink: 0,
          color: PHASE_COLOR[line.phase],
        }}
      >
        {line.phase === 'running' && hasMark(marks) ? (
          <SpecMark icon={marks?.icon} emoji={marks?.emoji} size={14} />
        ) : (
          <Icon size={14} />
        )}
      </Box>
      <Box
        as="span"
        sx={{
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {before}
        {name ? (
          <Box as="strong" sx={{ fontWeight: 'semibold' }}>
            {name}
          </Box>
        ) : null}
        {after}
      </Box>
    </Box>
  );
}

/**
 * What a screen reader hears of the tool lines, politely: once when a call
 * starts and once when it ends, never while it runs nor while words stream.
 */
export function ToolLineAnnouncer({
  line,
}: {
  line?: BalloonToolLine;
}): JSX.Element {
  const last = useRef<{ id: string; phase: ToolLinePhase } | undefined>(
    undefined,
  );
  const [said, setSaid] = useState('');
  useEffect(() => {
    const words = toolAnnouncement(line, last.current);
    if (line && words) {
      last.current = { id: line.id, phase: line.phase };
      setSaid(words);
    }
  }, [line?.id, line?.phase]);
  return (
    <Box
      as="span"
      role="status"
      aria-live="polite"
      data-balloon-announce=""
      sx={VISUALLY_HIDDEN}
    >
      {said}
    </Box>
  );
}

/**
 * The `current` balloon's mark: *Now*, with a dot that breathes while the
 * agent is at work — still for a reader who asks for reduced motion.
 */
export function BalloonNow({ busy = false }: { busy?: boolean }): JSX.Element {
  return (
    <Box
      as="span"
      data-balloon-now={busy ? 'busy' : ''}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: 0,
        fontWeight: 'semibold',
        color: 'accent.fg',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        '@keyframes balloonNowBreathe': {
          '0%, 100%': { opacity: 1, transform: 'scale(1)' },
          '50%': { opacity: 0.35, transform: 'scale(0.7)' },
        },
        '& [data-balloon-now-dot]': {
          width: 6,
          height: 6,
          borderRadius: '50%',
          bg: 'accent.emphasis',
          animation: busy
            ? 'balloonNowBreathe 1.2s ease-in-out infinite'
            : 'none',
        },
        '@media (prefers-reduced-motion: reduce)': {
          '& [data-balloon-now-dot]': { animation: 'none' },
        },
      }}
    >
      <Box as="span" data-balloon-now-dot="" aria-hidden="true" />
      Now
    </Box>
  );
}

/** How the `history` balloon names itself: "Conversation · 6". */
export function conversationHeaderText(count: number): string {
  return count > 0 ? `Conversation · ${count}` : 'Conversation';
}

/**
 * The `history` balloon's header: what it holds — the conversation, and how
 * many messages — over the scrolled history and the composer.
 */
export function ConversationBalloonHeader({
  count,
}: {
  count: number;
}): JSX.Element {
  return (
    <Box
      data-balloon-header=""
      sx={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        // Room for the close control over the corner.
        pl: 3,
        pr: 6,
        py: 2,
        borderBottom: '1px solid',
        borderColor: 'border.muted',
        bg: 'canvas.default',
        borderTopLeftRadius: 'var(--theme-radius-bubble, 16px)',
        borderTopRightRadius: 'var(--theme-radius-bubble, 16px)',
      }}
    >
      <Text sx={{ fontSize: 0, fontWeight: 'semibold', color: 'fg.muted' }}>
        {conversationHeaderText(count)}
      </Text>
    </Box>
  );
}

/**
 * What the `current` balloon holds: *Now*, then the one thing being said or
 * done — the tool line while a tool runs, else the words — cut to a few
 * lines, never scrolled; and what goes with them (`attachment`).
 */
export function CurrentBalloonBody({
  text,
  tool,
  busy = false,
  speaking = false,
  attachment,
  waiting = false,
  whole = false,
  fullText,
  onOverflow,
}: {
  /**
   * Shown whole: the full text (`fullText`, else `text`), unclamped, in a
   * taller box that scrolls.
   */
  whole?: boolean;
  /** The text uncut, when `text` was cut to fit (`…`). */
  fullText?: string;
  /** Whether the clamped text overflows its lines: *more* has more to show. */
  onOverflow?: (overflowing: boolean) => void;
  text?: string;
  tool?: BalloonToolLine;
  busy?: boolean;
  /**
   * At work with nothing written yet (thinking, working, waiting): the
   * chat's three dots follow the line, or stand alone.
   */
  waiting?: boolean;
  /** Words are arriving: read out once they have. */
  speaking?: boolean;
  attachment?: ReactNode;
}): JSX.Element {
  const textRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element || whole || !onOverflow) {
      return;
    }
    onOverflow(element.scrollHeight > element.clientHeight + 1);
  }, [text, whole, onOverflow]);
  return (
    <Box
      data-balloon-current=""
      sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}
    >
      <BalloonNow busy={busy} />
      {tool ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <BalloonToolLineView line={tool} />
          {waiting && <TypingDots size={5} />}
        </Box>
      ) : text ? (
        <Box
          aria-live="polite"
          aria-busy={speaking}
          ref={textRef}
          data-balloon-current-text={whole ? 'whole' : ''}
          sx={
            whole
              ? {
                  maxHeight: 240,
                  overflowY: 'auto',
                  overflowWrap: 'anywhere',
                  whiteSpace: 'pre-wrap',
                  pr: 1,
                }
              : {
                  display: '-webkit-box',
                  WebkitLineClamp: 4,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  overflowWrap: 'anywhere',
                }
          }
        >
          {whole ? (fullText ?? text) : text}
          {waiting && (
            <Box as="span" sx={{ ml: 2, display: 'inline-flex' }}>
              <TypingDots size={5} />
            </Box>
          )}
        </Box>
      ) : waiting ? (
        <TypingDots size={6} />
      ) : null}
      {attachment}
      <ToolLineAnnouncer line={tool} />
    </Box>
  );
}
