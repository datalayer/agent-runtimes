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

import type { JSX, ReactNode, RefObject } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { TypingDots } from '../indicators/TypingDots';
import { ChatMessageList } from '../messages/ChatMessageList';
import { ChatMarkdown, type ChatDensity } from '../messages/ChatMarkdown';
import { agentRuntimeStore } from '../../stores/agentRuntimeStore';
import type { DisplayItem } from '../../types/chat';
import {
  toolAnnouncement,
  displayItemOfLine,
  type BalloonToolLine,
  type ToolLinePhase,
} from './toolLine';
import { useChatWords } from '../ChatLanguage';
import { ENGLISH_CHAT_WORDS, type ChatWords } from '../words';

/** Out of sight, still heard. */
const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;

/** How the balloon's chat items know their people: no avatars are drawn. */
const BALLOON_AVATARS = {
  userAvatar: null,
  assistantAvatar: null,
  showAvatars: false,
  avatarSize: 0,
  userAvatarBg: 'neutral.muted',
  assistantAvatarBg: 'accent.emphasis',
} as const;

/**
 * Inline approvals answered in the balloon go where the chat's go: the
 * shared monitoring socket.
 */
async function respondInBalloon(
  _toolCallId: string,
  result: unknown,
): Promise<void> {
  if (result && typeof result === 'object') {
    const record = result as Record<string, unknown>;
    if (
      record.type === 'tool-approval-decision' &&
      typeof record.approved === 'boolean' &&
      typeof record.approvalId === 'string'
    ) {
      agentRuntimeStore
        .getState()
        .sendDecision(record.approvalId, record.approved);
    }
  }
}

/**
 * The conversation's items in the balloon, drawn by the chat's own
 * components (`ChatMessageList`): markdown, code blocks, tool calls and
 * their approvals, notes, the three dots — in the compact density, or the
 * chat's own when drawn large.
 */
export function BalloonChatItems({
  items,
  density = 'compact',
  waiting = false,
}: {
  items: readonly DisplayItem[];
  density?: ChatDensity;
  /** At work with nothing written yet: the chat's dots, last. */
  waiting?: boolean;
}): JSX.Element {
  const end = useRef<HTMLDivElement>(null);
  return (
    <Box data-balloon-chat-items="" sx={{ minWidth: 0 }}>
      <ChatMessageList
        displayItems={items as DisplayItem[]}
        isLoading={waiting}
        isStreaming={false}
        showLoadingIndicator={waiting}
        hideMessagesAfterToolUI={false}
        avatarConfig={BALLOON_AVATARS}
        padding={0}
        onRespond={respondInBalloon}
        messagesEndRef={end as RefObject<HTMLDivElement>}
        emptyContent={waiting ? <TypingDots size={6} /> : null}
        density={density}
      />
    </Box>
  );
}

/**
 * The tool being called, in the balloon: the chat's tool call card, compact,
 * with its runtime's own words (`Asking Accounting…`) as its summary.
 * Seen, not read out: {@link ToolLineAnnouncer} says it once per change.
 */
export function BalloonToolCall({
  line,
  waiting = false,
}: {
  line: BalloonToolLine;
  waiting?: boolean;
}): JSX.Element {
  return (
    <Box
      aria-hidden="true"
      data-balloon-tool={line.phase}
      data-balloon-tool-name={line.tool || undefined}
      sx={{ minWidth: 0, width: '100%' }}
    >
      <BalloonChatItems items={[displayItemOfLine(line)]} waiting={waiting} />
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
  const chatText = useChatWords();
  const last = useRef<{ id: string; phase: ToolLinePhase } | undefined>(
    undefined,
  );
  const [said, setSaid] = useState('');
  useEffect(() => {
    const words = toolAnnouncement(line, last.current, chatText);
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
  const chatText = useChatWords();
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
      {chatText.now}
    </Box>
  );
}

/** How the `history` balloon names itself: "Conversation · 6". */
export function conversationHeaderText(
  count: number,
  chatText: ChatWords = ENGLISH_CHAT_WORDS,
): string {
  return count > 0
    ? `${chatText.conversation} · ${count}`
    : chatText.conversation;
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
  const chatText = useChatWords();
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
        {conversationHeaderText(count, chatText)}
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
        <BalloonToolCall line={tool} waiting={waiting} />
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
                  pr: 1,
                }
              : {
                  // About four lines; *more* shows the rest.
                  maxHeight: '5.6em',
                  overflow: 'hidden',
                  overflowWrap: 'anywhere',
                }
          }
        >
          {/* The chat's own markdown: the words as written, whole. */}
          <ChatMarkdown
            density="compact"
            text={whole ? (fullText ?? text) : text}
          />
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
