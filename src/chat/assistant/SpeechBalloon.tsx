/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A speech balloon over something that stands for the agent — the floating
 * assistant's character, or the floating popup's button while the chat is
 * closed: a peek, one short line — the agent's newest words, as the Office
 * Assistant said them (LOOP T-23), cut to their first words, or a
 * notification — that opens the conversation when clicked, and can be
 * dismissed; an approval it waits on, answered there with *Approve* or
 * *Deny*, and how many more wait; and, where the runtime can be asked and
 * the conversation is elsewhere (the LOOP workspace), *Ask a decision*: a
 * typed decision asked of Jev, its answer said back in the balloon.
 *
 * Shown `history` with the conversation's messages (`history`), it lists
 * them all — the person's and the agent's, under a header that counts them,
 * scrolled to the newest — rather than the newest line alone.
 *
 * Given suggestions while the agent waits for a question, it offers them as
 * chips under its words: one clicked is sent as the person's prompt.
 *
 * Shown `current` (LOOP T-23), it is the one thing being said or done now:
 * *Now*, then the words as they are written, or the tool being called
 * ("Using **list_invoices**…"), cut to a few lines, and what goes with them
 * (a notebook given, read-only). Either way a tool line stands in for the
 * peek while a tool runs, and a screen reader hears it once as it starts and
 * once as it ends.
 *
 * @module chat/assistant/SpeechBalloon
 */

import type { JSX, KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Button, IconButton, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { XIcon } from '@primer/octicons-react';
import type { BalloonApproval } from './state';
import type { DisplayItem } from '../../types/chat';
import { DecisionAsk } from './DecisionAsk';
import type { DecisionAsker } from './decisions';
import {
  BalloonChatItems,
  BalloonToolCall,
  CurrentBalloonBody,
  ToolLineAnnouncer,
  conversationHeaderText,
} from './BalloonParts';
import {
  conversationCount,
  withToolCall,
  type BalloonDisplay,
  type BalloonToolLine,
} from './toolLine';
import { BalloonExpandButton } from './BalloonVisual';
import { ScreenFullIcon } from '@primer/octicons-react';
import { useChatWords } from '../ChatLanguage';

/** A suggestion the balloon offers: its label, and the prompt it sends. */
export type BalloonSuggestion = { label: string; prompt: string };

/** The suggestions, as chips: each sends its prompt. */
export function BalloonSuggestions({
  suggestions,
  onSuggestion,
}: {
  suggestions: readonly BalloonSuggestion[];
  onSuggestion: (suggestion: BalloonSuggestion) => void;
}): JSX.Element {
  const chatText = useChatWords();
  return (
    <Box
      role="group"
      aria-label={chatText.suggestions}
      data-balloon-suggestions=""
      display="flex"
      flexWrap="wrap"
      gap={1}
      mt={2}
    >
      {suggestions.map(suggestion => (
        <Button
          key={suggestion.label}
          size="small"
          data-balloon-suggestion={suggestion.label}
          aria-label={`Ask: ${suggestion.prompt}`}
          title={suggestion.prompt}
          onClick={() => onSuggestion(suggestion)}
          sx={{ borderRadius: 999 }}
        >
          {suggestion.label}
        </Button>
      ))}
    </Box>
  );
}

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
  /** Asks a typed decision of the runtime: offers *Ask a decision*. */
  decide?: DecisionAsker;
  /** The decision's form or answer is on screen: it stays, and is wider. */
  onDecisionActive?: (active: boolean) => void;
  /** Wider, for the decision's form. */
  wide?: boolean;
  /** Puts the peek away: a × beside its line. Never for an approval. */
  onDismissPeek?: () => void;
  /**
   * How it is shown: a peek of the conversation (`history`, the default),
   * or the one thing being said or done now (`current`).
   */
  display?: BalloonDisplay;
  /** The tool being called: said in place of the words while it runs. */
  tool?: BalloonToolLine;
  /** Words are being written: read out once they have all arrived. */
  speaking?: boolean;
  /** The agent is at work: *Now* breathes. */
  busy?: boolean;
  /** What goes with the words, under them: a notebook given, read-only. */
  attachment?: ReactNode;
  /**
   * The conversation (`history`), in the chat's own model — its messages
   * and tool calls, as the chat holds them — listed in the balloon by the
   * chat's own components, in place of the newest line alone.
   */
  history?: readonly DisplayItem[];
  /**
   * What goes with the words is a large visual (a notebook): an *Expand*
   * button under it draws it large, named by `expandTitle`.
   */
  onExpand?: () => void;
  /** What the large visual is, for the *Expand* button: `Accounting's notebook`. */
  expandTitle?: string;
  /** Draws the listed history large (`history` display): its *Expand*. */
  onExpandHistory?: () => void;
  /**
   * What the person may ask, as chips under the words: one clicked is sent
   * as the prompt (`onSuggestion`), as if typed and asked.
   */
  suggestions?: readonly BalloonSuggestion[];
  onSuggestion?: (suggestion: BalloonSuggestion) => void;
  /**
   * At work with nothing written yet: the chat's three dots — after the
   * current line, or last in the history — until words arrive.
   */
  waiting?: boolean;
  /**
   * The words uncut, when `text` was cut to fit: *more* shows them whole,
   * in the balloon, *less* folds them back.
   */
  fullText?: string;
}

/** How tall the listed conversation grows before it scrolls, in pixels. */
export const BALLOON_HISTORY_MAX_HEIGHT = 220;

/** Shorter, when something goes with the words under it (a notebook). */
export const BALLOON_HISTORY_WITH_ATTACHMENT_MAX_HEIGHT = 120;

/**
 * The conversation in the `history` balloon: a header that counts it and
 * opens it, then every message, the person's to the right, scrolled to the
 * newest.
 */
/**
 * The history balloon, large (*Expand*): every message, then the tool being
 * called and what goes with the words, in the overlay or the page's area,
 * scrolled there.
 */
export function BalloonHistoryLarge({
  history,
  tool,
  attachment,
}: {
  history: readonly DisplayItem[];
  tool?: BalloonToolLine;
  attachment?: ReactNode;
}): JSX.Element {
  const chatText = useChatWords();
  return (
    <Box
      role="log"
      aria-label={chatText.conversation}
      data-balloon-history-large=""
      display="flex"
      flexDirection="column"
      gap={2}
    >
      <BalloonChatItems
        items={withToolCall(history, tool)}
        density="comfortable"
      />
      {attachment ? <Box>{attachment}</Box> : null}
    </Box>
  );
}

function BalloonHistory({
  history,
  onOpen,
  maxHeight = BALLOON_HISTORY_MAX_HEIGHT,
  onExpand,
  tool,
  waiting = false,
}: {
  history: readonly DisplayItem[];
  /** The tool being called, listed last when the history does not hold it. */
  tool?: BalloonToolLine;
  /** At work with nothing written yet: the chat's dots, last. */
  waiting?: boolean;
  onOpen: () => void;
  maxHeight?: number;
  /** Draws the history large: *Expand*. */
  onExpand?: () => void;
}): JSX.Element {
  const chatText = useChatWords();
  const listRef = useRef<HTMLDivElement>(null);
  const newest = history[history.length - 1]?.id;
  useEffect(() => {
    const list = listRef.current;
    if (list) {
      list.scrollTop = list.scrollHeight;
    }
  }, [history.length, newest, waiting, tool?.id, tool?.phase]);
  // The chat's markdown draws after the list does: kept at the newest as
  // what is drawn grows.
  useEffect(() => {
    const list = listRef.current;
    const content = list?.firstElementChild;
    if (!list || !content || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(() => {
      list.scrollTop = list.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);
  return (
    <Box
      data-balloon-history=""
      flex={1}
      minWidth={0}
      display="flex"
      flexDirection="column"
    >
      <Box
        as="button"
        type="button"
        data-balloon-peek=""
        data-balloon-header=""
        onClick={onOpen}
        m={0}
        p={0}
        pb={1}
        border={0}
        bg="transparent"
        font="inherit"
        textAlign="left"
        cursor="pointer"
        fontSize={0}
        fontWeight="semibold"
        color="fg.muted"
        hover={{ textDecoration: 'underline' }}
      >
        {conversationHeaderText(conversationCount(history), chatText)}
      </Box>
      {onExpand ? (
        <IconButton
          icon={ScreenFullIcon}
          size="small"
          variant="invisible"
          aria-label={chatText.expandConversation}
          data-balloon-history-expand=""
          onClick={onExpand}
          sx={{ position: 'absolute', top: '4px', right: '28px' }}
        />
      ) : null}
      <Box
        ref={listRef}
        role="log"
        aria-label={chatText.conversation}
        data-balloon-history-list=""
        maxHeight={maxHeight}
        overflowY="auto"
        display="flex"
        flexDirection="column"
        pr={1}
      >
        <BalloonChatItems
          items={withToolCall(history, tool)}
          waiting={waiting}
        />
      </Box>
    </Box>
  );
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
  decide,
  onDecisionActive,
  wide = false,
  onDismissPeek,
  display = 'history',
  tool,
  speaking = false,
  busy = false,
  attachment,
  history,
  onExpand,
  expandTitle,
  suggestions,
  onSuggestion,
  waiting = false,
  fullText,
  onExpandHistory,
}: SpeechBalloonProps): JSX.Element {
  const chatText = useChatWords();
  // *more*: the words whole, when they were cut or overflow their lines.
  const [whole, setWhole] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const cut =
    (!!fullText && fullText !== text) || (!!more && text.endsWith('…'));
  const wholeText = fullText ?? text;
  // Other words, folded again.
  useEffect(() => {
    setWhole(false);
  }, [wholeText.slice(0, 40)]);
  const offered =
    suggestions && suggestions.length > 0 && onSuggestion && !approval
      ? suggestions
      : null;
  const current = display === 'current';
  // History with messages to list: all of them, not the newest line alone.
  const listed = !current && history && history.length > 0 ? history : null;
  return (
    <Box
      data-speech-balloon=""
      data-balloon-display={display}
      maxWidth={
        wide || listed || offered || whole || (current && attachment)
          ? 300
          : current
            ? 260
            : 280
      }
      px={3}
      py={2}
      color="fg.default"
      border="1px solid"
      borderRadius="bubble"
      boxShadow="shadow.medium"
      fontSize={1}
      textAlign="left"
      bottom={side === 'above' ? `${above}px` : undefined}
      top={side === 'above' ? undefined : `${above}px`}
      sx={{
        position: 'absolute',
        [align]: 0,
        width:
          wide || listed || offered || whole || (current && attachment)
            ? 300
            : 'max-content',
        bg: 'canvas.default',
        // The current balloon is the agent's voice now: its accent's edge.
        borderColor: current ? 'accent.muted' : 'border.default',
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
          borderColor: current ? 'accent.muted' : 'border.default',
          transform: side === 'above' ? 'rotate(45deg)' : 'rotate(225deg)',
        },
      }}
    >
      <Box display="flex" alignItems="flex-start" gap={1}>
        {current && !approval ? (
          // Not a <button>: the body draws the chat's tool card, a button of
          // its own, and a click on that card is the card's alone.
          <Box
            role="button"
            tabIndex={0}
            data-balloon-peek=""
            onClick={(event: MouseEvent<HTMLElement>) => {
              const inner = (event.target as HTMLElement).closest('button');
              if (inner && event.currentTarget.contains(inner)) {
                return;
              }
              onOpen();
            }}
            onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
              if (
                event.target === event.currentTarget &&
                (event.key === 'Enter' || event.key === ' ')
              ) {
                event.preventDefault();
                onOpen();
              }
            }}
            flex={1}
            minWidth={0}
            m={0}
            p={0}
            border={0}
            bg="transparent"
            color="inherit"
            font="inherit"
            textAlign="left"
            cursor="pointer"
          >
            <CurrentBalloonBody
              text={text}
              tool={tool}
              busy={busy}
              speaking={speaking}
              waiting={waiting}
              whole={whole}
              fullText={wholeText}
              onOverflow={setOverflowing}
            />
          </Box>
        ) : listed ? (
          <BalloonHistory
            history={listed}
            onOpen={onOpen}
            onExpand={onExpandHistory}
            tool={tool}
            waiting={waiting}
            maxHeight={
              attachment
                ? BALLOON_HISTORY_WITH_ATTACHMENT_MAX_HEIGHT
                : BALLOON_HISTORY_MAX_HEIGHT
            }
          />
        ) : tool ? (
          // The tool being called: the chat's card, not inside the peek's
          // button (the card is a button of its own).
          <Box flex={1} minWidth={0}>
            <BalloonToolCall line={tool} />
          </Box>
        ) : (
          <Box
            as="button"
            type="button"
            data-balloon-peek=""
            data-balloon-more={more ? '' : undefined}
            onClick={onOpen}
            flex={1}
            minWidth={0}
            m={0}
            p={0}
            border={0}
            bg="transparent"
            color="inherit"
            font="inherit"
            textAlign="left"
            cursor="pointer"
            hover={{ textDecoration: 'underline' }}
          >
            <Box as="span" role="status" aria-live="polite">
              {text}
            </Box>
          </Box>
        )}
        {onDismissPeek && !approval ? (
          <IconButton
            icon={XIcon}
            size="small"
            variant="invisible"
            aria-label={chatText.dismiss}
            data-balloon-dismiss=""
            onClick={onDismissPeek}
            sx={{ mt: '-4px', mr: '-8px', flexShrink: 0 }}
          />
        ) : null}
      </Box>
      {current && !approval && !tool && (cut || overflowing || whole) ? (
        <Box
          as="button"
          type="button"
          aria-expanded={whole}
          data-balloon-whole={whole ? 'less' : 'more'}
          onClick={() => setWhole(!whole)}
          m={0}
          mt={1}
          p={0}
          border={0}
          bg="transparent"
          color="accent.fg"
          font="inherit"
          fontSize={0}
          cursor="pointer"
          hover={{ textDecoration: 'underline' }}
        >
          {whole ? chatText.showLess : chatText.showMore}
        </Box>
      ) : null}
      {/* No history listed, at work with nothing written yet: the dots. */}
      {!current && !listed && waiting ? (
        <Box data-balloon-waiting="" mt={1}>
          <BalloonChatItems items={[]} waiting />
        </Box>
      ) : null}
      {approval && (
        <Box data-balloon-approval={approval.id} mt={1}>
          <Text as="p" sx={{ m: 0, fontWeight: 'semibold' }}>
            {approval.asks}
          </Text>
          {approval.why ? (
            <Text as="p" sx={{ m: 0, color: 'fg.muted', fontSize: 0 }}>
              {approval.why}
            </Text>
          ) : null}
          <Box display="flex" gap={2} mt={2}>
            <Button
              size="small"
              variant="primary"
              disabled={approval.deciding}
              onClick={approval.onApprove}
            >
              {chatText.approve}
            </Button>
            <Button
              size="small"
              disabled={approval.deciding}
              onClick={approval.onDeny}
            >
              {chatText.deny}
            </Button>
          </Box>
          {approval.others > 0 ? (
            <Text as="p" sx={{ m: 0, mt: 1, color: 'fg.muted', fontSize: 0 }}>
              {chatText.moreWaiting(approval.others)}
            </Text>
          ) : null}
        </Box>
      )}
      {offered && onSuggestion ? (
        <BalloonSuggestions suggestions={offered} onSuggestion={onSuggestion} />
      ) : null}
      {/* What goes with the words, in either display, a tool line or not. */}
      {attachment ? (
        <Box
          data-balloon-attachment=""
          mt={2}
          display="flex"
          flexDirection="column"
          gap={1}
        >
          {attachment}
          {onExpand ? (
            <BalloonExpandButton
              title={expandTitle ?? chatText.theVisual}
              onExpand={onExpand}
            />
          ) : null}
        </Box>
      ) : null}
      {!current ? <ToolLineAnnouncer line={tool} /> : null}
      {decide && <DecisionAsk ask={decide} onActiveChange={onDecisionActive} />}
    </Box>
  );
}

export default SpeechBalloon;
