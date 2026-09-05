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
} from '@datalayer/primer-addons/lib/reactor';
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
 * The chat view's parts on the page layout.
 *
 * The editors are the page, the transcript the panel, the composer the band;
 * what the agent is doing — the turn's `activity` — is the line at the top
 * of the sheet, so the change is seen where it happens.
 */
function LoopPageLayout({
  parts,
  promptMode,
}: {
  parts: ChatLayoutParts;
  promptMode: 'docked' | 'floating';
}): JSX.Element {
  const turnEntries = useContributions(LoopChatTurn);
  const turn = useSignalValue(turnEntries[0]?.value.turn ?? NO_TURN);
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
      bandMode={promptMode}
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
  config: { turnPanel: 'below', turnPanelFooter: 'full', prompt: 'docked' },
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
      prompt and the page read as one column; `floating-top` is the draggable
      card, sized by itself, over a strip of canvas kept clear for it. The
      component closes over the choice once, per build.
    */
    const promptMode = config.prompt;
    const ConfiguredLayout = (parts: ChatLayoutParts): JSX.Element => (
      <LoopPageLayout parts={parts} promptMode={promptMode} />
    );
    ctx.contribute(
      LoopChatLayout,
      {
        id: 'page-layout',
        prompt: promptMode === 'floating' ? 'floating-top' : 'docked-top',
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
      ],
    };
  },
});

export default LoopPageLayoutPlugin;
