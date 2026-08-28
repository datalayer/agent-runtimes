/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-models` — which model is answering.
 *
 * @module loop/plugins/models
 */

import { contribution, defineExtension } from '@datalayer/reactor';
import type { ReactorSlotComponent } from '@datalayer/reactor/react';
import { LoopCommand, LoopSlots } from '../../core';
import { ModelChip } from './ModelChip';

export const MODELS_EXTENSION_NAME = '@datalayer/loop-plugin-models';

export const ModelsExtension = defineExtension<
  Record<string, never>,
  unknown,
  { components: ReactorSlotComponent[] }
>({
  name: MODELS_EXTENSION_NAME,
  build() {
    return {
      components: [
        { slot: LoopSlots.header, id: 'model-chip', Component: ModelChip as never },
      ],
    };
  },
  contributes: [
    contribution(
      LoopCommand,
      {
        name: 'models',
        aliases: ['model'],
        description: 'Show the models available to this session',
        group: 'Agents',
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
            content: `${reachable} of ${(payload.models ?? []).length} models are ready. Pick one from the header.`,
          };
        },
      },
      { id: 'models' },
    ),
  ],
});

export default ModelsExtension;
