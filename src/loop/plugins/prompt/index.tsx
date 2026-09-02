/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-prompt` — a floating, draggable input.
 *
 * The chat plugin's prompt is docked: a bar the layout makes room for, under
 * the transcript or under the whole workspace. This plugin is the other
 * answer — a card floating over the work, movable by its handle — for a shell
 * that is mostly canvas.
 *
 * It contributes to `LoopSlots.root`, the slot for plugins that position
 * themselves, and submits through `workspace.submit` like every other
 * composer, so slash commands and the prompt channel both work unchanged. A
 * host that mounts it alongside the chat should configure the chat with
 * `hidePrompt: true`; two composers for one conversation is one too many —
 * `loopPlugins({ floatingPrompt: true })` does both.
 *
 * @module loop/plugins/prompt
 */

import { contribution, definePlugin } from '@datalayer/reactor';
import { LoopCommand, LoopSlots, type LoopWorkspaceContext } from '../../core';
import { FloatingPrompt } from './FloatingPrompt';
import { focusPrompt } from './focusRequests';

export const PROMPT_PLUGIN_NAME = '@datalayer/loop-plugin-prompt';

export type PromptPluginConfig = {
  /** What the empty input says. */
  placeholder: string;
};

export const PromptPlugin = definePlugin<PromptPluginConfig>({
  name: PROMPT_PLUGIN_NAME,
  displayName: 'Floating prompt',
  description: 'A draggable input floating over the workspace.',
  octicon: 'paper-airplane',
  emoji: '\u{1FAB6}',
  config: {
    placeholder: 'Ask anything, type / for commands',
  },
  contributes: [
    contribution(
      LoopCommand,
      {
        name: 'prompt',
        description: 'Focus the floating prompt',
        group: 'Session',
        keybinding: 'Mod+Alt+P',
        run: async () => {
          if (!focusPrompt()) {
            throw new Error('No floating prompt is on screen to focus.');
          }
        },
      },
      { id: 'prompt' },
    ),
  ],
  build: ({ config }) => ({
    components: [
      {
        id: 'floating-prompt',
        slot: LoopSlots.root,
        Component: ({ workspace }: { workspace?: LoopWorkspaceContext }) =>
          workspace ? (
            <FloatingPrompt
              workspace={workspace}
              placeholder={config.placeholder}
            />
          ) : null,
      },
    ],
  }),
});

export { FloatingPrompt } from './FloatingPrompt';
export { focusPrompt, onPromptFocusRequest } from './focusRequests';
export default PromptPlugin;
