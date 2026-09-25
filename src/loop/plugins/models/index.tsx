/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-models` — which model is answering.
 *
 * @module loop/plugins/models
 */

import { contribution, definePlugin } from '@datalayer/reactor';
import { LoopCommand } from '../../core';

export const MODELS_PLUGIN_NAME = '@datalayer/loop-plugin-models';

/*
 * No header chip any more.
 *
 * The plugin used to put a model dropdown in the workspace header, and the
 * prompt's footer grew one of its own — two controls choosing one model,
 * which would eventually disagree. The footer's is the one that survives: it
 * sits with the tools and skills that decide what the next message does, and
 * it is on screen in every placement of the prompt, floating included.
 */
export const ModelsPlugin = definePlugin({
  name: MODELS_PLUGIN_NAME,
  displayName: 'Models',
  description: 'Which model answers, from the agentspecs catalog.',
  octicon: 'cpu',
  emoji: '\u{1F9E0}',
  contributes: [
    contribution(
      LoopCommand,
      {
        name: 'models',
        aliases: ['model'],
        description: 'Show the models available to this session',
        group: 'Agents',
        keybinding: 'Mod+Alt+M',
        run: async ({ workspace }) => {
          const response = await fetch(
            `${workspace.serverUrl}/api/v1/configure/models`,
          );
          if (!response.ok) {
            return { content: 'The model catalogue is unavailable.' };
          }
          const payload = await response.json();
          const reachable = (payload.models ?? []).filter(
            (model: { available?: boolean }) => model.available !== false,
          ).length;
          return {
            content: `${reachable} of ${(payload.models ?? []).length} models are ready. Pick one under the prompt.`,
          };
        },
      },
      { id: 'models' },
    ),
  ],
});

export default ModelsPlugin;
