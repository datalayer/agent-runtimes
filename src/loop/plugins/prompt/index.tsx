/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-prompt` — the prompt as a first-class subject.
 *
 * The composer itself is the chat's, whatever the placement: docked under the
 * workspace, in the chat column, or floating in a draggable card
 * (`promptPlacement: 'floating'` on the chat, which is the real
 * `InputPrompt` — lexical editor, slash commands, the tools/skills/model
 * footer — wrapped in `FloatingCard`). This plugin deliberately ships no
 * second input box: two composers for one conversation is one too many, and a
 * reimplementation would be a composer that drifts.
 *
 * What it adds is around the composer: `/prompt` (Mod+Alt+P) puts the caret
 * in it from anywhere, through the same ask-and-answer channel the editor
 * commands use; `/new` (Mod+Alt+R) starts the conversation over, and the +
 * this plugin puts in the prompt's footer bar presses exactly that command.
 * `loopPlugins({ floatingPrompt: true })` mounts this plugin and asks the
 * chat for the floating placement together.
 *
 * @module loop/plugins/prompt
 */

import { contribution, definePlugin } from '@datalayer/reactor';
import { LoopCommand, LoopSlots, focusPrompt } from '../../core';
import { NewChatAction } from './NewChatAction';

export const PROMPT_PLUGIN_NAME = '@datalayer/loop-plugin-prompt';

export const PromptPlugin = definePlugin({
  name: PROMPT_PLUGIN_NAME,
  displayName: 'Prompt',
  description: 'Prompt commands: focus the composer, start over, and the +.',
  octicon: 'paper-airplane',
  emoji: '\u{1FAB6}',
  contributes: [
    contribution(
      LoopCommand,
      {
        name: 'prompt',
        description: 'Focus the prompt',
        group: 'Session',
        keybinding: 'Mod+Alt+P',
        run: async () => {
          if (!focusPrompt()) {
            throw new Error('No prompt is on screen to focus.');
          }
        },
      },
      { id: 'prompt' },
    ),
    contribution(
      LoopCommand,
      {
        name: 'new',
        aliases: ['reset'],
        description: 'Start the conversation over',
        group: 'Session',
        keybinding: 'Mod+Alt+R',
        run: async ({ workspace }) => {
          const reset = workspace.viewControls.newChat;
          if (!reset) {
            throw new Error('No conversation is on screen to start over.');
          }
          reset();
        },
      },
      { id: 'new' },
    ),
  ],
  build: () => ({
    components: [
      {
        id: 'new-chat',
        slot: LoopSlots.promptAction,
        Component: NewChatAction,
      },
    ],
  }),
});

export { focusPrompt, onPromptFocusRequest } from '../../core';
export default PromptPlugin;
