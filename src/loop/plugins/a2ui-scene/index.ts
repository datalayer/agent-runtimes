/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The mould the A2UI scene plugins are cast from.
 *
 * A scene — the contact card, the restaurant menu, the components gallery —
 * is a canned set of A2UI protocol messages rendered as a surface, no agent
 * behind it. The capacity, factored once here, is *showing such a scene as
 * a workspace view*: the plugin contributes one `LoopViewType` entry whose
 * component loads lazily, ordered ahead of the chat so the workspace opens
 * on the scene with the conversation one tab away.
 *
 * The scene component itself stays with whoever owns the scene (the
 * examples own theirs); this module owns only the casting.
 *
 * @module loop/plugins/a2ui-scene
 */

import type { ComponentType } from 'react';
import {
  contribution,
  definePlugin,
  type ReactorPlugin,
} from '@datalayer/reactor';
import { LoopViewType, type LoopViewProps } from '../../core';

export type A2uiSceneOptions = {
  /** Short slug: `contact-card`, … names the plugin `…-a2ui-scene-<key>`. */
  key: string;
  title: string;
  description: string;
  /** Registry icon name. */
  octicon?: string;
  emoji?: string;
  icon?: ComponentType<{ size?: number }>;
  /** The scene view, loaded when first shown. */
  load: () => Promise<{ default: ComponentType<LoopViewProps> }>;
};

export function defineA2uiScenePlugin(
  options: A2uiSceneOptions,
): ReactorPlugin<Record<string, never>, unknown, unknown> {
  const { key, title, description, icon, load } = options;
  return definePlugin({
    name: `@datalayer/loop-plugin-a2ui-scene-${key}`,
    displayName: title,
    description,
    octicon: options.octicon ?? 'browser',
    emoji: options.emoji,
    contributes: [
      contribution(
        LoopViewType,
        {
          viewType: `a2ui-scene-${key}`,
          title,
          icon,
          // Ahead of the chat (order 0): the scene is what this workspace
          // exists to show, and the conversation stands one tab away.
          order: -10,
          load,
        },
        { id: `a2ui-scene-${key}`, order: -10 },
      ),
    ],
  });
}

export default defineA2uiScenePlugin;
