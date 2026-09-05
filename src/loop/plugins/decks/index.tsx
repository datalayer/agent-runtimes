/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Decks in a Loop: a deck beside the chat.
 *
 * The plugin pulls `@datalayer/decks`'s own reactor plugin in as a dependency,
 * pointed at the Loop's slots — the list of decks in the sidebar, the "new
 * deck" dialog at the root — and adds what only a Loop can know:
 *
 * - a **Deck** editor surface, one entry in the shell's editor selector, that
 *   shows the open deck in the column beside the conversation;
 * - a **menu in the composer** with the decks to open and the plugin's
 *   commands, and a `deck` slash command with a keystroke;
 * - the deck **following the decks**: whatever asks to see one — a row in the
 *   list, the palette, an agent's tool — brings the surface beside the chat.
 *
 * It declares no tools. The decks plugin does: its `AgentTools` bundle names
 * every command an agent may call — reading and writing decks as much as
 * opening and presenting one — and the chat reads the bundle from the reactor
 * (`useAgentCommandTools`) and runs each as the command it is, on this page,
 * saved to the decks server when the plugin was given one. Nothing here
 * duplicates, and nothing here can drift from, what the plugin declared.
 *
 * `DeckViewPlugin` is the footer icon that switches to the deck, like the
 * notebook's and the document's.
 *
 * @module loop/plugins/decks
 */

import { ProjectIcon } from '@primer/octicons-react';
import {
  configurePlugin,
  contribution,
  definePlugin,
} from '@datalayer/reactor';
import type { ReactorReactOutput } from '@datalayer/reactor/react';
import {
  DecksPlugin,
  getDecksState,
  subscribeDecksState,
} from '@datalayer/decks/plugin';
import {
  LoopCommand,
  LoopEditorView,
  LoopSlots,
  requestSurface,
} from '../../core';
import { InputPromptPlugin } from '../input-prompt';
import { chooseEditor } from '../shell/editorChoice';
import { defineViewPlugin } from '../view-switch';
import DecksMenu from './DecksMenu';
import { DECK_SURFACE_ID } from './surface';

export { DECK_SURFACE_ID } from './surface';

export const DECKS_PLUGIN_NAME = '@datalayer/loop-plugin-decks';

/**
 * A slot nobody renders: the decks plugin's main view is shown through the
 * Deck surface instead, so the plugin's own `slot` output must land nowhere.
 */
export const DECKS_UNUSED_SLOT = 'loop.decks.unused';

export const LoopDecksPlugin = definePlugin<
  Record<string, never>,
  unknown,
  ReactorReactOutput
>({
  name: DECKS_PLUGIN_NAME,
  // `Deck editor`, like `Notebook editor`: the decks plugin it depends on is
  // the one called `Decks`, and the two sit side by side in the plugins panel.
  displayName: 'Deck editor',
  description:
    'A deck beside the chat, and the tools an agent writes a presentation with.',
  octicon: 'project',
  emoji: '\u{1F4CA}',
  dependencies: [
    configurePlugin(DecksPlugin, {
      listSlot: LoopSlots.sidebar,
      // Above the plugins panel, which puts itself last.
      listOrder: 10,
      slot: DECKS_UNUSED_SLOT,
      dialogSlot: LoopSlots.root,
      shellView: false,
    }),
    // The menu sits in the composer's action row; without the composer there
    // is nowhere for it to be.
    InputPromptPlugin,
  ],
  contributes: [
    contribution(
      LoopEditorView,
      {
        surfaceId: DECK_SURFACE_ID,
        title: 'Deck',
        icon: ProjectIcon,
        order: 30,
        load: () => import('./DeckSurface'),
      },
      { id: DECK_SURFACE_ID, order: 30 },
    ),
    contribution(
      LoopCommand,
      {
        name: 'deck',
        description: 'Open the deck beside the chat',
        group: 'Open',
        keybinding: 'Mod+Alt+D',
        run: async ({ workspace }) => {
          workspace.setActiveViewType('chat');
          if (!requestSurface(DECK_SURFACE_ID)) {
            throw new Error('No chat is on screen to open the deck beside.');
          }
        },
      },
      { id: 'deck' },
    ),
  ],
  register: () => {
    /*
     * The deck surface follows the decks. Whatever asks to see a deck or the
     * list — the sidebar row, the palette's "Show the decks", an agent's
     * `decks_open` — bumps the store's `revealed`, and this brings the Deck
     * editor beside the chat so the ask has a visible answer. Without it,
     * "Show the decks" with the notebook on screen changed the store and
     * nothing else.
     */
    let seen = getDecksState().revealed;
    return subscribeDecksState(() => {
      const { revealed } = getDecksState();
      if (revealed === seen) {
        return;
      }
      seen = revealed;
      if (!chooseEditor(DECK_SURFACE_ID)) {
        console.warn('[loop] No chat is on screen to show the deck beside.');
      }
    });
  },
  build: () => ({
    components: [
      {
        id: 'decks-menu',
        slot: LoopSlots.promptAction,
        order: 40,
        Component: DecksMenu,
      },
    ],
  }),
});

/** The footer icon that shows the deck, beside the notebook's and the document's. */
export const DeckViewPlugin = defineViewPlugin({
  key: 'deck',
  viewId: DECK_SURFACE_ID,
  displayName: 'Deck view',
  description: 'The deck beside the chat, from the composer footer.',
  icon: ProjectIcon,
  tooltip: 'Show the deck',
  octicon: 'project',
  emoji: '\u{1F4CA}',
  order: 12,
});

export default LoopDecksPlugin;
