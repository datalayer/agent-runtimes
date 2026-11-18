/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-notices` — a short notice the agent slides in from
 * an edge of the view (the user, 18 November 2026: "the N/E/S/W sliding
 * panels are only for notices: info, success, warning, error and the like.
 * They are short, dismissible, triggered by the agent through one frontend
 * tool … They hold no controls or plugins").
 *
 * One frontend tool of the `notices` set, run in the page:
 * `show_notice({tone, title, text?, edge?, seconds?})`. A notice is
 * primer-addons' `SlidingPanel`, contained in the conversation — the view
 * (`LoopSlots.viewOverlay`) between the chat's title bar and its composer:
 * never over the page around the workspace, the application's own controls
 * or the person's typing — and says it comes from the agent. Words only: no link,
 * no button but its Close, nothing that could pass for the application's
 * own controls. One per edge: a second on the same edge replaces the first,
 * and the agent is told so. It goes after its seconds (an error stays until
 * closed), with its Close button, Escape, or a click on it. Nothing is kept:
 * a conversation opened again shows none, and one started over clears them.
 *
 * @module apps/plugins/notices
 */

import type { JSX } from 'react';
import { useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { BellIcon } from '@primer/octicons-react';
import { Box, SlidingPanel } from '@datalayer/primer-addons';
import type { ToolCallRenderContext } from '../../../types/chat';
import type { FrontendToolDefinition } from '../../../types/tools';
import { LoopSlots } from '../../core';
import { CallLine, cardRole } from '../../pageTools/cards';
import { defineToolCardPlugin } from '../../toolCards/kit';
import { ToolResultsContext } from '../../toolCards/toolResults';

export const NOTICES_PLUGIN_NAME = '@datalayer/loop-plugin-notices';

/** The one tool. */
export const SHOW_NOTICE = 'show_notice';

export type NoticeTone = 'info' | 'success' | 'warning' | 'error';
export type NoticeEdge = 'north' | 'east' | 'south' | 'west';

export const NOTICE_TONES: readonly NoticeTone[] = [
  'info',
  'success',
  'warning',
  'error',
];
export const NOTICE_EDGES: readonly NoticeEdge[] = [
  'north',
  'east',
  'south',
  'west',
];

/** How long a notice stays, by tone, when the agent says nothing; 0 stays until closed. */
export const NOTICE_SECONDS: Record<NoticeTone, number> = {
  info: 8,
  success: 8,
  warning: 12,
  error: 0,
};

export const NOTICE_TITLE_MAX = 80;
export const NOTICE_TEXT_MAX = 280;
export const NOTICE_SECONDS_MAX = 60;

export const NOTICES_WORDS = {
  from: 'From the agent',
  close: 'Close the notice',
  line: (title: string) => `Notice: ${title}`,
  writing: 'Showing a notice…',
  tone: `"tone" is one of ${NOTICE_TONES.join(', ')}.`,
  edge: `"edge" is one of ${NOTICE_EDGES.join(', ')}.`,
  title: `A notice says something: "title" is 1 to ${NOTICE_TITLE_MAX} characters.`,
  text: `"text" is at most ${NOTICE_TEXT_MAX} characters.`,
  seconds: `"seconds" is from 0 (until closed) to ${NOTICE_SECONDS_MAX}.`,
  unknown: (key: string) =>
    `A notice has no "${key}": tone, title, text, edge and seconds.`,
} as const;

/** A notice on the page. */
export type Notice = {
  id: number;
  tone: NoticeTone;
  title: string;
  text: string;
  edge: NoticeEdge;
  /** 0: until closed. */
  seconds: number;
};

/** What `show_notice` was given, checked: a notice to show, or a sentence. */
export function readNotice(
  args: Record<string, unknown>,
): Omit<Notice, 'id'> | string {
  const allowed = new Set(['tone', 'title', 'text', 'edge', 'seconds']);
  for (const key of Object.keys(args)) {
    if (!allowed.has(key)) {
      return NOTICES_WORDS.unknown(key);
    }
  }
  const tone = args.tone as NoticeTone;
  if (!NOTICE_TONES.includes(tone)) {
    return NOTICES_WORDS.tone;
  }
  const title = typeof args.title === 'string' ? args.title.trim() : '';
  if (!title || title.length > NOTICE_TITLE_MAX) {
    return NOTICES_WORDS.title;
  }
  const text =
    args.text === undefined
      ? ''
      : typeof args.text === 'string'
        ? args.text.trim()
        : null;
  if (text === null || text.length > NOTICE_TEXT_MAX) {
    return NOTICES_WORDS.text;
  }
  const edge = (args.edge ?? 'north') as NoticeEdge;
  if (!NOTICE_EDGES.includes(edge)) {
    return NOTICES_WORDS.edge;
  }
  const seconds =
    args.seconds === undefined ? NOTICE_SECONDS[tone] : Number(args.seconds);
  if (
    !Number.isFinite(seconds) ||
    seconds < 0 ||
    seconds > NOTICE_SECONDS_MAX
  ) {
    return NOTICES_WORDS.seconds;
  }
  return { tone, title, text, edge, seconds };
}

/** The notices on the page, one per edge. */
export class NoticeBoard {
  private shown: Partial<Record<NoticeEdge, Notice>> = {};
  private next = 0;
  private revision = 0;
  private listeners = new Set<() => void>();

  /** Shows a notice on its edge; says whether it replaced one there. */
  show(notice: Omit<Notice, 'id'>): { notice: Notice; replaced: boolean } {
    const replaced = this.shown[notice.edge] !== undefined;
    this.next += 1;
    const placed = { ...notice, id: this.next };
    this.shown = { ...this.shown, [notice.edge]: placed };
    this.tell();
    return { notice: placed, replaced };
  }

  /** Takes a notice away, if it is still the one on its edge. */
  dismiss(edge: NoticeEdge, id: number): void {
    if (this.shown[edge]?.id === id) {
      const { [edge]: _gone, ...rest } = this.shown;
      this.shown = rest;
      this.tell();
    }
  }

  /** Takes every notice away: the conversation started over. */
  clear(): void {
    if (Object.keys(this.shown).length > 0) {
      this.shown = {};
      this.tell();
    }
  }

  notices(): Notice[] {
    return NOTICE_EDGES.map(edge => this.shown[edge]).filter(
      (notice): notice is Notice => notice !== undefined,
    );
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getRevision = (): number => this.revision;

  private tell(): void {
    this.revision += 1;
    this.listeners.forEach(listener => listener());
  }
}

/** The page's notices. */
export const NOTICES = new NoticeBoard();

/** The tool, checked in the page. */
export function noticesTools(
  board: NoticeBoard = NOTICES,
): FrontendToolDefinition[] {
  return [
    {
      name: SHOW_NOTICE,
      description:
        'Slides a short notice in from an edge of the chat for a few seconds: info, success, warning or error, a title and a line of text. Words only, no link or button; the person can close it. Use it sparingly, for what the person should not miss (a step finished, something that needs them, a problem); never for what your answer already says. One per edge: a new one on the same edge replaces the old.',
      parameters: {
        type: 'object',
        properties: {
          tone: {
            type: 'string',
            enum: [...NOTICE_TONES],
            description: 'What it is: info, success, warning or error.',
          },
          title: {
            type: 'string',
            maxLength: NOTICE_TITLE_MAX,
            description: 'What it says, in a few words.',
          },
          text: {
            type: 'string',
            maxLength: NOTICE_TEXT_MAX,
            description: 'A line more, when the title needs it.',
          },
          edge: {
            type: 'string',
            enum: [...NOTICE_EDGES],
            description: 'Where it slides in from; north unsaid.',
          },
          seconds: {
            type: 'number',
            minimum: 0,
            maximum: NOTICE_SECONDS_MAX,
            description:
              'How long it stays: 8 for info and success, 12 for a warning, until closed for an error, unsaid; 0 is until closed.',
          },
        },
        required: ['tone', 'title'],
        additionalProperties: false,
      },
      handler: async args => {
        const read = readNotice(args);
        if (typeof read === 'string') {
          throw new Error(read);
        }
        const { notice, replaced } = board.show(read);
        return { shown: notice.edge, replaced };
      },
      summaryOf: args => NOTICES_WORDS.line(String(args.title ?? '')),
    },
  ];
}

const VARIANT: Record<NoticeTone, 'info' | 'success' | 'warning' | 'error'> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  error: 'error',
};

/** Where the conversation is within the view: under its title bar, above its composer. */
export function conversationInsets(container: HTMLElement): {
  top: number;
  bottom: number;
} {
  const box = container.getBoundingClientRect();
  const header = container.querySelector<HTMLElement>('[data-chat-header]');
  // The composer's own band, its padding included.
  const composer = container.querySelector<HTMLElement>(
    '[data-chat-composer]',
  )?.parentElement;
  return {
    top: header
      ? Math.max(0, header.getBoundingClientRect().bottom - box.top)
      : 0,
    bottom: composer
      ? Math.max(0, box.bottom - composer.getBoundingClientRect().top)
      : 0,
  };
}

/**
 * The region the notices slide in: the conversation itself, between the
 * chat's title bar and its composer — the application's own controls and the
 * person's typing are never covered — kept as the view resizes.
 */
function useConversationRegion(active: boolean): {
  ref: (element: HTMLDivElement | null) => void;
  insets: { top: number; bottom: number };
} {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [insets, setInsets] = useState({ top: 0, bottom: 0 });
  useEffect(() => {
    const container = element?.parentElement;
    if (!active || !container) {
      return undefined;
    }
    const measure = () => {
      const next = conversationInsets(container);
      setInsets(previous =>
        previous.top === next.top && previous.bottom === next.bottom
          ? previous
          : next,
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [active, element]);
  return { ref: setElement, insets };
}

/** The notices over the view, inside its bounds. */
export function NoticesOverlay({
  board = NOTICES,
}: {
  board?: NoticeBoard;
}): JSX.Element | null {
  useSyncExternalStore(board.subscribe, board.getRevision, board.getRevision);
  // A conversation started over: its notices go with it.
  const results = useContext(ToolResultsContext);
  const generation = useSyncExternalStore(
    results.subscribe,
    results.getGeneration,
    results.getGeneration,
  );
  useEffect(() => {
    board.clear();
  }, [board, generation]);
  const notices = board.notices();
  const region = useConversationRegion(notices.length > 0);
  if (notices.length === 0) {
    return null;
  }
  return (
    <Box
      ref={region.ref}
      data-notices-region=""
      sx={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: `${region.insets.top}px`,
        bottom: `${region.insets.bottom}px`,
        // Its notices slide in from its edges, not from beyond them.
        overflow: 'hidden',
        // Clicks reach the conversation, but on a notice.
        pointerEvents: 'none',
        zIndex: 5,
      }}
    >
      {notices.map(notice => {
        const horizontal = notice.edge === 'north' || notice.edge === 'south';
        return (
          <SlidingPanel
            key={notice.id}
            isOpen
            contained
            position={notice.edge}
            variant={VARIANT[notice.tone]}
            fullWidth={false}
            panelSize={horizontal ? undefined : 320}
            zIndex={1}
            closeLabel={NOTICES_WORDS.close}
            durationMs={notice.seconds > 0 ? notice.seconds * 1000 : undefined}
            onDismiss={() => board.dismiss(notice.edge, notice.id)}
            message={
              <Box data-notice={notice.tone} data-notice-edge={notice.edge}>
                <Box
                  as="span"
                  sx={{
                    display: 'block',
                    fontSize: 0,
                    fontWeight: 'semibold',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    opacity: 0.8,
                  }}
                >
                  {NOTICES_WORDS.from}
                </Box>
                <Box as="span" sx={{ fontSize: 2 }}>
                  {notice.title}
                </Box>
              </Box>
            }
            details={notice.text || undefined}
          />
        );
      })}
    </Box>
  );
}

/** A call, as a line in the conversation. */
export function NoticeCallCard({
  context,
}: {
  context: ToolCallRenderContext;
}): JSX.Element {
  const role = cardRole(context, undefined);
  if (role === 'default') {
    return <>{context.defaultUI}</>;
  }
  return (
    <CallLine icon={BellIcon} busy={role === 'pending'} data={SHOW_NOTICE}>
      {role === 'pending'
        ? NOTICES_WORDS.writing
        : NOTICES_WORDS.line(String(context.args?.title ?? ''))}
    </CallLine>
  );
}

export const NoticesPlugin = defineToolCardPlugin({
  id: 'notices',
  displayName: 'Notices',
  description:
    'A short notice the agent slides in from an edge of the chat: info, success, warning or error.',
  octicon: 'bell',
  emoji: '\u{1F514}',
  tools: [SHOW_NOTICE],
  Card: NoticeCallCard,
  frontendTools: noticesTools(),
  components: [
    {
      slot: LoopSlots.viewOverlay,
      id: 'notices',
      Component: NoticesOverlay as never,
    },
  ],
});

export default NoticesPlugin;
