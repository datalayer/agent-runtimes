/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-page-layout` — the editor as a page.
 *
 * The chat view's default arrangement is a split: the editor beside the
 * transcript, the prompt underneath. This plugin arranges the same parts the
 * way a document application does: the notebook or the document on a centred
 * sheet over a quiet canvas, the composer docked in a band directly above it
 * like a toolbar, and the conversation in a panel at the side that opens when
 * it is wanted. The work is the page; the agent is the bar above it.
 *
 * The layout itself is primer-addons' `PageLayout` — with its panel signals
 * and its header toggle, in `@datalayer/primer-addons/lib/reactor` — which
 * any Reactor host can mount, on its own or as `PageLayoutPlugin` over
 * slots. This plugin is the Loop's side of it, in three contributions:
 *
 * - the layout, through `LoopChatLayout`: the chat view's parts handed to
 *   `PageLayout` — the editors as the page, the transcript as the panel,
 *   the composer as the band — with what the agent is doing in the page,
 *   read from `LoopChatTurn`, pinned to the top of the sheet;
 * - with the composer floating, the chat header's display-mode toggle in
 *   the card's footer, through the input-prompt plugin's `promptAction`
 *   slot: the card over the page, or the composer in the conversation panel
 *   — beside the page, over its edge, or in its corner (`pageLayoutChatMode`,
 *   `pageLayoutForChatMode`); the layout follows the mode, and the chat view
 *   follows the composer's stance through `promptStance`;
 * - a button in the workspace header that opens and closes the conversation
 *   panel — primer-addons' toggle, labelled for a conversation; it shares
 *   the layout's `pageLayoutPanelOpen` signal with any host that wants to
 *   open the panel too;
 * - the **turn panel**, hung on the composer through the input-prompt
 *   plugin's `LoopPromptPanel` point and fed by the chat plugin's
 *   `LoopChatTurn`: with the transcript out of sight, the message just sent,
 *   the reply as it streams and what the agent is doing in the page show in
 *   the prompt's own band, cleared by the next message. `turnPanel` says which
 *   side of the composer; `turnPanelFooter` what goes under the reply. It
 *   stays here rather than moving with the layout: it renders the reply as
 *   the transcript does, with the chat's markdown and the turn footer.
 *
 * The layout component is imported statically: it is a few boxes, and a
 * layout that arrived late would draw the split first and the page a moment
 * after, which is a flash a reader notices.
 *
 * @module loop/plugins/page-layout
 */

import type { JSX } from 'react';
import { CommentDiscussionIcon } from '@primer/octicons-react';
import { definePlugin, signal } from '@datalayer/reactor';
import { useContributions, useSignalValue } from '@datalayer/reactor/react';
import {
  PageLayout,
  PagePanelToggle,
  openPagePanel,
  type PageSize,
} from '@datalayer/primer-addons/lib/reactor';
import type { ChatViewMode } from '../../../types/chat';
import { ChatViewModeToggle } from '../../../chat/header/ChatViewModeToggle';
import {
  LoopChatLayout,
  LoopChatTurn,
  LoopPromptPanel,
  LoopSlots,
  type ChatLayoutParts,
  type ChatTurnSnapshot,
} from '../../core';
import { TurnPanel, type TurnPanelFooter } from './TurnPanel';

/*
 * The layout's state is primer-addons', re-exported under the names the
 * Loop always had: a host that opened the conversation panel by calling
 * `openConversationPanel()` keeps doing so.
 */
export {
  pageLayoutPanelOpen,
  pageLayoutSheet,
  openPagePanel as openConversationPanel,
} from '@datalayer/primer-addons/lib/reactor';
export type { TurnPanelFooter } from './TurnPanel';
/* The sheet's size is primer-addons' type; a host names it without a second import. */
export type {
  PageSize,
  PageSizeFormat,
} from '@datalayer/primer-addons/lib/reactor';

export const LOOP_PAGE_LAYOUT_PLUGIN_NAME =
  '@datalayer/loop-plugin-page-layout';

/** What a host may set on the page layout. */
export type LoopPageLayoutConfig = {
  /**
   * Where the turn panel hangs on the composer.
   *
   * `below` (the default): under the composer, where a reply reads as the
   * answer to what was just typed above it. `above`: over it, for a host
   * whose composer sits at the bottom of the page and wants the reply to
   * rise. `none`: no panel — the conversation is the side panel only.
   */
  turnPanel: 'below' | 'above' | 'none';
  /**
   * How the composer stands over the page.
   *
   * `docked` (the default): in a band above the canvas, at the sheet's own
   * width, so the prompt and the page read as one column. `floating`: a
   * draggable card anchored to the top of the canvas, hovering over a strip
   * kept clear for it — the document application's title bar, movable.
   */
  prompt: 'docked' | 'floating';
  /**
   * Which edge of the page a floating composer starts at: `top` (the
   * default), where a document's title bar would be, or `bottom`, where a
   * chat's composer waits. Either way it is dragged from there. Only read
   * with a `floating` prompt.
   */
  promptAnchor?: 'top' | 'bottom';
  /**
   * The sheet's size: free (the default) at the layout's reading width, or
   * a paper — `{ format: 'letter' }`, `{ format: 'a4' }` — whose width the
   * sheet takes and whose height it is at least, with a free `width` or
   * `height` over either. Omitted: free.
   */
  pageSize?: PageSize;
  /**
   * What the turn panel draws under the reply.
   *
   * `full` (the default): the transcript's turn footer — the window's fill,
   * this turn's tokens, copy, dismiss. `actions`: copy and dismiss only, for
   * a host whose readers are not asking about tokens. `none`: nothing.
   */
  turnPanelFooter: TurnPanelFooter;
};

/* A signal to read when no chat contributed a turn: the hook needs one. */
const NO_TURN = signal<ChatTurnSnapshot>({ id: 0, status: 'idle' });

/**
 * How the page layout shows the chat, when the composer is the floating
 * card: the card itself over the page (`floating-draggable`, where it
 * starts), or the conversation panel with the composer standing in it —
 * beside the page (`sidebar`), over its right edge at full height
 * (`floating`), or as a window in its corner (`floating-small`). The four
 * modes of the chat header's toggle, which the card carries in its own
 * footer. One signal for the workspace, as `pageLayoutPanelOpen` is: the
 * mode is the person's, not a build's.
 */
export const pageLayoutChatMode = signal<ChatViewMode>('floating-draggable');

/** The composer's stance for the chat view, following the mode above. */
const promptStance = signal<'floating-top' | 'floating-bottom' | 'docked-top'>(
  'floating-top',
);

/*
 * Which edge the card returns to when the mode puts it back over the page:
 * the build's own `promptAnchor`, kept here because the mode is picked
 * through a module-level function, as `pageLayoutChatMode` itself is. One
 * page layout to a page, the assumption that signal already makes.
 */
let floatingStance: 'floating-top' | 'floating-bottom' = 'floating-top';

/** Where a mode puts the composer (the band) and the conversation (the panel). */
export type PageLayoutChatPlacement = {
  bandMode: 'floating' | 'panel';
  panelMode: 'docked' | 'overlay' | 'popup';
};

export function pageLayoutForChatMode(
  mode: ChatViewMode,
): PageLayoutChatPlacement {
  switch (mode) {
    case 'sidebar':
      return { bandMode: 'panel', panelMode: 'docked' };
    case 'floating':
      return { bandMode: 'panel', panelMode: 'overlay' };
    case 'floating-small':
      return { bandMode: 'panel', panelMode: 'popup' };
    default:
      return { bandMode: 'floating', panelMode: 'docked' };
  }
}

/** Picks a mode: the layout follows, and so does the composer's stance. */
export function setPageLayoutChatMode(mode: ChatViewMode): void {
  pageLayoutChatMode.value = mode;
  const { bandMode } = pageLayoutForChatMode(mode);
  promptStance.value = bandMode === 'floating' ? floatingStance : 'docked-top';
  // The composer went into the panel: the panel opens to show it.
  if (bandMode === 'panel') {
    openPagePanel();
  }
}

/** The toggle in the floating composer's footer. */
function ChatModeAction(): JSX.Element {
  const mode = useSignalValue(pageLayoutChatMode);
  return <ChatViewModeToggle value={mode} onChange={setPageLayoutChatMode} />;
}

/**
 * The chat view's parts on the page layout.
 *
 * The editors are the page, the transcript the panel, the composer the band;
 * what the agent is doing — the turn's `activity` — is the line at the top
 * of the sheet, so the change is seen where it happens.
 */
function LoopPageLayout({
  parts,
  promptMode,
  pageSize,
}: {
  parts: ChatLayoutParts;
  promptMode: 'docked' | 'floating';
  pageSize?: PageSize;
}): JSX.Element {
  const turnEntries = useContributions(LoopChatTurn);
  const turn = useSignalValue(turnEntries[0]?.value.turn ?? NO_TURN);
  const chatMode = useSignalValue(pageLayoutChatMode);
  // The display modes are the floating card's own; a docked composer stays
  // docked above the page, whatever mode was picked elsewhere.
  const placement: {
    bandMode: 'docked' | 'floating' | 'panel';
    panelMode: 'docked' | 'overlay' | 'popup';
  } =
    promptMode === 'floating'
      ? pageLayoutForChatMode(chatMode)
      : { bandMode: 'docked', panelMode: 'docked' };
  return (
    <PageLayout
      page={parts.editors}
      hasPage={parts.hasEditor}
      panel={parts.transcript}
      band={parts.prompt}
      chips={parts.chips}
      picker={parts.picker}
      transient={parts.transient}
      activity={turn.activity}
      bandMode={placement.bandMode}
      panelMode={placement.panelMode}
      pageSize={pageSize}
    />
  );
}

/** The header button that opens and closes the conversation panel. */
function ConversationToggle(): JSX.Element | null {
  return (
    <PagePanelToggle
      panelName="conversation"
      icon={CommentDiscussionIcon}
      sx={{ order: 2 }}
    />
  );
}

export const LoopPageLayoutPlugin = definePlugin<LoopPageLayoutConfig>({
  name: LOOP_PAGE_LAYOUT_PLUGIN_NAME,
  config: {
    turnPanel: 'below',
    turnPanelFooter: 'full',
    prompt: 'docked',
    promptAnchor: 'top',
    pageSize: undefined,
  },
  displayName: 'Page layout',
  description:
    'The editor — or, in the chat view, the conversation — on a centred sheet, the prompt docked above it at the same width or floating over it as a draggable card, the current turn under the prompt, the conversation in a side panel.',
  octicon: 'file',
  emoji: '\u{1F4C4}',
  build: ({ config, ...ctx }) => {
    /*
      The layout, contributed per build because the composer's stance is
      configuration: `docked-top` means the layout owns the composer's width
      — `PageLayout` gives it a mount point the width of the sheet, so the
      prompt and the page read as one column; `floating-top` and
      `floating-bottom` are the draggable
      card, sized by itself, over a strip of canvas kept clear for it. The
      component closes over the choice once, per build.
    */
    const promptMode = config.prompt;
    const pageSize = config.pageSize;
    floatingStance =
      config.promptAnchor === 'bottom' ? 'floating-bottom' : 'floating-top';
    if (promptMode === 'floating') {
      promptStance.value = floatingStance;
    }
    const ConfiguredLayout = (parts: ChatLayoutParts): JSX.Element => (
      <LoopPageLayout
        parts={parts}
        promptMode={promptMode}
        pageSize={pageSize}
      />
    );
    ctx.contribute(
      LoopChatLayout,
      {
        id: 'page-layout',
        prompt: promptMode === 'floating' ? floatingStance : 'docked-top',
        // Live only for the card: its display modes move the composer.
        promptStance: promptMode === 'floating' ? promptStance : undefined,
        Component: ConfiguredLayout,
      },
      { id: 'page-layout' },
    );
    // The turn panel is configuration-dependent, so it is contributed here
    // rather than statically: which side, what footer, or not at all. The
    // component closes over the footer choice once, per build.
    if (config.turnPanel !== 'none') {
      const footer = config.turnPanelFooter;
      const ConfiguredTurnPanel = (): JSX.Element | null => (
        <TurnPanel footer={footer} />
      );
      ctx.contribute(
        LoopPromptPanel,
        {
          id: 'page-layout-turn',
          placement: config.turnPanel,
          order: 0,
          Component: ConfiguredTurnPanel,
        },
        { id: 'page-layout-turn' },
      );
    }
    return {
      components: [
        {
          id: 'page-layout-conversation-toggle',
          slot: LoopSlots.header,
          Component: ConversationToggle,
        },
        // The display modes, in the floating card's footer — and only
        // there: a docked composer has none to pick.
        ...(promptMode === 'floating'
          ? [
              {
                id: 'page-layout-chat-mode',
                slot: LoopSlots.promptAction,
                Component: ChatModeAction,
              },
            ]
          : []),
      ],
    };
  },
});

export default LoopPageLayoutPlugin;
