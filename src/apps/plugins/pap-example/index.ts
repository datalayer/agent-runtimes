/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The mould for Personal Agent Protocol gallery examples.
 *
 * Each example is a Reactor plugin contributing one lazy workspace view. PAP
 * therefore enters the Agent through the same extension boundary as A2A,
 * A2UI, editors and runtime capacities—not through a page-specific switch.
 *
 * @module apps/plugins/pap-example
 */

import type { ComponentType } from 'react';
import {
  contribution,
  definePlugin,
  type ReactorPlugin,
} from '@datalayer/reactor';
import { AgentViewType, type AgentViewProps } from '../../core';

export type PapExamplePluginOptions = {
  key: string;
  title: string;
  description: string;
  load: () => Promise<{ default: ComponentType<AgentViewProps> }>;
};

/** Define one PAP workspace view as a Reactor plugin. */
export function definePapExamplePlugin(
  options: PapExamplePluginOptions,
): ReactorPlugin<Record<string, never>, unknown, unknown> {
  return definePlugin({
    name: `@datalayer/agent-plugin-pap-example-${options.key}`,
    displayName: options.title,
    description: options.description,
    octicon: 'shield-lock',
    emoji: '🔐',
    contributes: [
      contribution(
        AgentViewType,
        {
          viewType: `pap-example-${options.key}`,
          title: options.title,
          order: -10,
          load: options.load,
        },
        { id: `pap-example-${options.key}`, order: -10 },
      ),
    ],
  });
}

export default definePapExamplePlugin;
