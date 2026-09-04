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
 * sheet over a quiet canvas, the composer floating at the top of the sheet
 * like a command line, and the conversation in a panel at the side that
 * opens when it is wanted. The work is the page; the agent is a card over it.
 *
 * Three contributions:
 *
 * - the layout itself, through `LoopChatLayout`;
 * - a button in the workspace header that opens and closes the conversation
 *   panel — it shares one signal, `pageLayoutPanelOpen`, with the layout and
 *   with any host that wants to open the panel too;
 * - the **turn panel**, hung on the composer through the input-prompt
 *   plugin's `LoopPromptPanel` point and fed by the chat plugin's
 *   `LoopChatTurn`: with the transcript out of sight, the message just sent,
 *   the reply as it streams and what the agent is doing in the page show in
 *   the prompt's own card, cleared by the next message. `turnPanel` says which
 *   side of the composer; `turnPanelFooter` what goes under the reply.
 *
 * The layout component is imported statically: it is a few boxes, and a
 * layout that arrived late would draw the split first and the page a moment
 * after, which is a flash a reader notices.
 *
 * @module loop/plugins/page-layout
 */

import type { JSX } from 'react';
import { CommentDiscussionIcon } from '@primer/octicons-react';
import { contribution, definePlugin } from '@datalayer/reactor';
import { useSignalValue } from '@datalayer/reactor/react';
import { IconButton } from '@primer/react';
import { LoopChatLayout, LoopPromptPanel, LoopSlots } from '../../core';
import { PageLayout } from './PageLayout';
import { TurnPanel, type TurnPanelFooter } from './TurnPanel';
import {
  openConversationPanel,
  pageLayoutPanelOpen,
  pageLayoutSheet,
} from './panelState';

export {
  openConversationPanel,
  pageLayoutPanelOpen,
  pageLayoutSheet,
} from './panelState';
export type { TurnPanelFooter } from './TurnPanel';

export const PAGE_LAYOUT_PLUGIN_NAME = '@datalayer/loop-plugin-page-layout';

/** What a host may set on the page layout. */
export type PageLayoutConfig = {
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
   * What the turn panel draws under the reply.
   *
   * `full` (the default): the transcript's turn footer — the window's fill,
   * this turn's tokens, copy, dismiss. `actions`: copy and dismiss only, for
   * a host whose readers are not asking about tokens. `none`: nothing.
   */
  turnPanelFooter: TurnPanelFooter;
};

/** The header button that opens and closes the conversation panel. */
function ConversationToggle(): JSX.Element | null {
  const open = useSignalValue(pageLayoutPanelOpen);
  const sheet = useSignalValue(pageLayoutSheet);
  // In the chat view the transcript is the page; there is nothing to open.
  if (sheet === 'transcript') {
    return null;
  }
  return (
    <IconButton
      icon={CommentDiscussionIcon}
      size="small"
      variant={open ? 'default' : 'invisible'}
      aria-label={open ? 'Hide the conversation' : 'Show the conversation'}
      aria-pressed={open}
      onClick={() => {
        if (open) {
          pageLayoutPanelOpen.value = false;
        } else {
          openConversationPanel();
        }
      }}
      sx={{ order: 2, color: open ? 'accent.fg' : 'fg.muted' }}
    />
  );
}

export const PageLayoutPlugin = definePlugin<PageLayoutConfig>({
  name: PAGE_LAYOUT_PLUGIN_NAME,
  config: { turnPanel: 'below', turnPanelFooter: 'full' },
  displayName: 'Page layout',
  description:
    'The editor — or, in the chat view, the conversation — on a centred sheet, the prompt floating over it with the current turn, the conversation in a side panel.',
  octicon: 'file',
  emoji: '\u{1F4C4}',
  contributes: [
    contribution(
      LoopChatLayout,
      // The composer as a floating card anchored to the top of the page.
      { id: 'page-layout', prompt: 'floating-top', Component: PageLayout },
      { id: 'page-layout' },
    ),
  ],
  build: ({ config, ...ctx }) => {
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

export default PageLayoutPlugin;
