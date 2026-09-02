/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-editors` — the editor choice, in the workspace
 * header.
 *
 * The chat can draw its own surface picker above the transcript. This plugin
 * offers the same choice — `'none'`, plus every contributed
 * {@link LoopChatSurface} — from the workspace's header instead, on the
 * trailing edge, for a shell that hides the chat's chrome and wants one small
 * control where window chrome usually is.
 *
 * The chat stays the owner of what is actually beside the conversation:
 * choosing here goes through the same `requestSurface` channel the `/notebook`
 * and `/document` commands use. A host mounting this usually configures the
 * chat with `showSurfaceSelector: false`, or two controls offer one choice —
 * `loopPlugins({ editorSelector: true })` does both.
 *
 * @module loop/plugins/editors
 */

import { contribution, definePlugin } from '@datalayer/reactor';
import { LoopCommand, LoopSlots } from '../../core';
import { EditorSelector } from './EditorSelector';
import {
  NONE_EDITOR,
  chooseEditor,
  getEditorChoice,
  nextEditor,
  seedEditorChoice,
} from './editorChoice';

export const EDITORS_PLUGIN_NAME = '@datalayer/loop-plugin-editors';

export type EditorsPluginConfig = {
  /**
   * The editor the selector starts on.
   *
   * A preference, not a demand, exactly like the chat's `defaultSurface` — a
   * named editor whose plugin is not mounted leaves the selector on `'none'`.
   * The two configs should agree; `loopPlugins` sets both from one option.
   */
  defaultEditor: string;
};

export const EditorsPlugin = definePlugin<EditorsPluginConfig>({
  name: EDITORS_PLUGIN_NAME,
  displayName: 'Editor selector',
  description: 'Choose the editor beside the conversation, from the header.',
  octicon: 'columns',
  emoji: '\u{1F4D1}',
  config: {
    defaultEditor: NONE_EDITOR,
  },
  contributes: [
    contribution(
      LoopCommand,
      {
        name: 'editor',
        aliases: ['editors'],
        description: 'Switch the editor beside the conversation',
        group: 'Open',
        keybinding: 'Mod+Alt+E',
        args: [
          {
            name: 'editor',
            description: 'Which editor: none, or a surface id. Omit to cycle.',
            required: false,
            choices: () => [NONE_EDITOR, ...getEditorChoice().options],
          },
        ],
        run: async ({ argv }) => {
          const asked = argv.trim();
          const wanted = asked === '' ? nextEditor() : asked;
          const known = [NONE_EDITOR, ...getEditorChoice().options];
          if (!known.includes(wanted)) {
            throw new Error(
              `No editor called '${wanted}'. There is: ${known.join(', ')}.`,
            );
          }
          if (!chooseEditor(wanted)) {
            throw new Error('No chat is on screen to host the editor.');
          }
        },
      },
      { id: 'editor' },
    ),
  ],
  build: ({ config }) => {
    // The selector starts where the chat starts. Seeded, not requested: the
    // chat's own `defaultSurface` is what actually opens the editor, and at
    // build time there is no chat listening yet.
    // The chat writes "no editor" as `''` or `'none'`; the selector's word
    // for it is `'none'`.
    seedEditorChoice(config.defaultEditor || NONE_EDITOR);
    return {
      components: [
        {
          id: 'editor-selector',
          slot: LoopSlots.header,
          // The component holds itself to the trailing edge of the header row
          // with `marginLeft: 'auto'`, wherever the slot renders it.
          Component: EditorSelector,
        },
      ],
    };
  },
});

export {
  NONE_EDITOR,
  chooseEditor,
  getEditorChoice,
  nextEditor,
  seedEditorChoice,
  setEditorOptions,
  subscribeEditorChoice,
} from './editorChoice';
export { EditorSelector } from './EditorSelector';
export default EditorsPlugin;
