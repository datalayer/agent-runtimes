/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-shield-displays` — a coding agent's *diff* and
 * *terminal*, drawn where its tool results carry them (SH-16).
 *
 * The runtime sends each beside the tool's result in
 * `_meta["reactor.ui/display"]`, as every protocol display travels
 * (RU-1): `application/vnd.datalayer.shield.diff+json` and
 * `application/vnd.datalayer.shield.terminal+json`, typed in Python as
 * `agent_runtimes.adapters.harness_displays`. This plugin contributes one
 * renderer per type; it binds no tool, since a harness names its tools as it
 * likes (*Edit hello.py*, *Run pytest*) and the display is what says what
 * it is. The web chat and the embed mount it through the preset; the phone
 * reads the same contract from `portable/displays` (M-037).
 *
 * @module apps/plugins/shield-displays
 */

import { createElement, type JSX } from 'react';
import { contribution, definePlugin } from '@datalayer/reactor';
import type { ReactorPlugin } from '@datalayer/reactor';
import { Renderers } from '@datalayer/reactor/ui';
import {
  defineRenderer,
  type RendererProps,
} from '@datalayer/reactor/ui/react';
import type { ToolCallRenderContext } from '../../../types/chat';
import {
  protocolDisplayOf,
  SHIELD_DIFF_TYPE,
  SHIELD_TERMINAL_TYPE,
} from '../../../portable';
import { DiffCard } from './DiffCard';
import { TerminalCard } from './TerminalCard';

export const SHIELD_DISPLAYS_PLUGIN_NAME =
  '@datalayer/loop-plugin-shield-displays';

function Diff({
  display,
  context,
}: RendererProps<ToolCallRenderContext>): JSX.Element {
  const read = protocolDisplayOf(display);
  if (!read || read.kind !== 'diff') {
    // Does not read as a diff: the chat's own row says what it can.
    return createElement('span', null, context?.defaultUI ?? display.text);
  }
  return createElement(DiffCard, { key: display.id, display: read });
}

function Terminal({
  display,
  context,
}: RendererProps<ToolCallRenderContext>): JSX.Element {
  const read = protocolDisplayOf(display);
  if (!read || read.kind !== 'terminal') {
    return createElement('span', null, context?.defaultUI ?? display.text);
  }
  return createElement(TerminalCard, { key: display.id, display: read });
}

/** The plugin: two renderers, no tool binding. */
export function createShieldDisplaysPlugin(): ReactorPlugin<
  Record<string, never>,
  unknown,
  unknown
> {
  const plugin = definePlugin({
    name: SHIELD_DISPLAYS_PLUGIN_NAME,
    displayName: 'Diffs and terminals',
    description:
      'What a coding agent changed, as a unified diff, and what it ran, with its output.',
    octicon: 'diff',
    emoji: '\u{1F6E1}',
    contributes: [
      contribution(
        Renderers,
        defineRenderer({ type: SHIELD_DIFF_TYPE, component: Diff }),
        { id: 'shield-diff' },
      ),
      contribution(
        Renderers,
        defineRenderer({ type: SHIELD_TERMINAL_TYPE, component: Terminal }),
        { id: 'shield-terminal' },
      ),
    ],
  });
  return plugin as unknown as ReactorPlugin<
    Record<string, never>,
    unknown,
    unknown
  >;
}

/** The instance the preset mounts. */
export const ShieldDisplaysPlugin = createShieldDisplaysPlugin();

export { DiffCard, type DiffCardProps } from './DiffCard';
export { TerminalCard, type TerminalCardProps } from './TerminalCard';
export default ShieldDisplaysPlugin;
