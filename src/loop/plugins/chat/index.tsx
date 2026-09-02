/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The chat plugin: the first view, and the proof that chat is not special.
 *
 * @module loop/plugins/chat
 */

import {
  CommentDiscussionIcon,
  FoldIcon,
  SparkleFillIcon,
  SyncIcon,
} from '@primer/octicons-react';
import { contribution, definePlugin } from '@datalayer/reactor';
import type { ToolbarItem } from '@datalayer/primer-addons';
import {
  LoopAgentGate,
  LoopChatSurface,
  LoopCommand,
  LoopDocumentToolbarItem,
  LoopNotebookToolbarItem,
  LoopViewType,
  type EditorToolbarContext,
} from '../../core';

/**
 * An editor toolbar button that asks an agent to do something.
 *
 * These live here, on the chat, rather than on the editors — which is where
 * they were. A button that submits a prompt only works because there is a
 * conversation to submit it to, so the notebook was reaching into the chat to
 * draw it. Contributing them from this side inverts that: the editors offer a
 * toolbar and know nothing about agents, and switching the chat off takes its
 * buttons off both toolbars with it.
 *
 * The specialists are reached the way a person would reach them — by asking.
 * A button that called a private API would be a second way to invoke an agent,
 * free to drift from the one people type.
 */
function agentAction(
  context: EditorToolbarContext,
  item: {
    key: string;
    ariaLabel: string;
    title: string;
    icon: typeof FoldIcon;
    order: number;
    prompt: string;
  },
): ToolbarItem {
  const { prompt, ...rest } = item;
  return {
    ...rest,
    type: 'button',
    group: 'agent',
    onClick: () => context.workspace.prompts.submit(prompt),
  };
}

/** What a host may set on the chat. */
export type ChatPluginConfig = {
  /**
   * What the empty prompt says.
   *
   * Configured on the plugin rather than passed to the workspace: the prompt
   * belongs to the chat, and a shell that has no chat plugin has no prompt to
   * put a placeholder in. A host that wants different words says so where the
   * words are.
   */
  placeholder: string;
  /**
   * Which editor is open beside the chat when the workspace opens.
   *
   * `'none'` leaves the chat full width. Any other value is the `surfaceId` of
   * a contributed chat surface — `'notebook'`, `'document'`, or one a plugin
   * this host mounts brings of its own; the field is a plain string rather
   * than a union so a new surface does not have to change this type to be
   * choosable.
   *
   * A surface that is not contributed, or cannot open yet, is simply not
   * opened: the default is a preference, not a demand, and a host that asks
   * for the notebook in a workspace with no notebook plugin gets a working
   * chat rather than an error.
   */
  defaultSurface: string;
  /**
   * Whether a person may change which editor sits beside the chat.
   *
   * True by default. False leaves `defaultSurface` open and removes the
   * control, for a host that has already decided what the workspace is for —
   * an embed showing one notebook does not want a strip inviting the reader
   * to swap it for a document or for nothing at all.
   */
  showSurfaceSelector: boolean;
  /**
   * Whether the chat draws its own title bar.
   *
   * False by default — the header carries the agent's name and the reason a
   * disabled chat is disabled, and both are worth having.
   *
   * True for a host that has already said what this is. On a landing page the
   * workspace sits under a heading that names it, and a second title bar
   * directly beneath repeats the point in a smaller font.
   */
  hideHeader: boolean;
  /**
   * Where the prompt sits.
   *
   * `bottom` (the default) spans the workspace: the notebook and the
   * conversation share one composer, which is right when what the agent is
   * doing is the document beside it.
   *
   * `bottom-chat` keeps it inside the chat column, under the transcript, where
   * every other example in this package puts it. The prompt then reads as part
   * of the conversation rather than as a bar the whole page rests on — better
   * for a host that embeds the workspace as a chat that happens to have a
   * notebook attached.
   */
  promptPlacement: 'bottom' | 'bottom-chat';
};

export const CHAT_PLUGIN_NAME = '@datalayer/loop-plugin-chat';

export const ChatPlugin = definePlugin<ChatPluginConfig>({
  name: CHAT_PLUGIN_NAME,
  config: {
    placeholder: 'Ask anything, type / for commands or @ for mention',
    // The notebook: it is what most of these agents work on, and a workspace
    // that opens on an empty chat hides the half of itself that does the work.
    defaultSurface: 'notebook',
    showSurfaceSelector: true,
    hideHeader: false,
    promptPlacement: 'bottom',
  },
  displayName: 'Chat',
  description: 'The conversation, the prompt, and the point editors plug into.',
  octicon: 'comment-discussion',
  emoji: '\u{1F4AC}',
  // Declared, not merely used: the registry knows who contributed to a point,
  // it cannot know who opened it, and a point nobody has filled yet is exactly
  // when knowing it exists is most useful.
  contributionPoints: [LoopAgentGate, LoopChatSurface],
  contributes: [
    contribution(
      LoopViewType,
      {
        viewType: 'chat',
        title: 'Chat',
        icon: CommentDiscussionIcon,
        order: 0,
        load: () => import('./ChatView'),
      },
      { id: 'chat', order: 0 },
    ),
    contribution(
      LoopCommand,
      {
        name: 'chat',
        description: 'Show the conversation',
        group: 'Session',
        keybinding: 'Mod+Alt+K',
        run: async ({ workspace }) => {
          workspace.setActiveViewType('chat');
        },
      },
      { id: 'chat' },
    ),
    // What the chat puts on the notebook's toolbar. The bar belongs to the
    // toolbar plugin, which opens this point; the notebook knows about neither.
    // With the toolbar plugin switched off there is no bar, so these have
    // nowhere to sit and are not drawn — which is the honest outcome.
    contribution(
      LoopNotebookToolbarItem,
      {
        items: (context: EditorToolbarContext) => [
          agentAction(context, {
            key: 'loop-compact',
            ariaLabel: 'Compact this notebook',
            title:
              'Ask @NotebookCompactor to shorten it without changing results',
            icon: FoldIcon,
            order: 200,
            prompt:
              '@NotebookCompactor compact this notebook without changing what it computes.',
          }),
          agentAction(context, {
            key: 'loop-reproduce',
            ariaLabel: 'Check reproducibility',
            title: 'Ask @NotebookReproducer to run it on a fresh sandbox',
            icon: SyncIcon,
            order: 201,
            prompt:
              '@NotebookReproducer run this notebook top to bottom on a fresh sandbox and report what does not reproduce.',
          }),
        ],
      },
      { id: 'agent-actions', order: 200 },
    ),
    // And on the document's, which had no agent actions at all before there
    // was a point to put them on.
    contribution(
      LoopDocumentToolbarItem,
      {
        items: (context: EditorToolbarContext) => [
          agentAction(context, {
            key: 'loop-summarise',
            ariaLabel: 'Summarise this document',
            title: 'Ask the agent for a summary of what this document says',
            icon: SparkleFillIcon,
            order: 200,
            prompt: 'Summarise this document in a short paragraph.',
          }),
        ],
      },
      { id: 'agent-actions', order: 200 },
    ),
  ],
});

export default ChatPlugin;
