/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-chat-extras` — a live channel from a host example
 * into the loop's conversation.
 *
 * An example that wraps a `LoopEmbed` in its own panels still has things to
 * say to the chat column that change over the life of the page: an error
 * banner it derives from its own state, the codemode toggle, the MCP and
 * codemode status the footer shows. {@link createChatExtrasPlugin} returns a
 * plugin to hand `LoopEmbed` and a `setExtras` the example calls whenever
 * those change — backed by a signal, so the chat view re-renders without the
 * plugin being rebuilt.
 *
 * ```tsx
 * const { plugin, setExtras } = useMemo(() => createChatExtrasPlugin(), []);
 * useEffect(() => setExtras({ errorBanner, codemodeEnabled }), […]);
 * <LoopEmbed plugins={[capacityPlugin, plugin]} … />
 * ```
 *
 * @module loop/plugins/chat-extras
 */

import { contribution, definePlugin, signal } from '@datalayer/reactor';
import type { ReactorPlugin } from '@datalayer/reactor';
import { LoopChatExtras, type LoopChatExtrasValue } from '../../core';

export const CHAT_EXTRAS_PLUGIN_NAME = '@datalayer/loop-plugin-chat-extras';

export type ChatExtrasHandle = {
  plugin: ReactorPlugin<Record<string, never>, unknown, unknown>;
  /** Replace the live extras the chat view reads. */
  setExtras: (value: LoopChatExtrasValue) => void;
};

let counter = 0;

/**
 * A chat-extras plugin plus its setter. Call once per workspace (memoise it),
 * then push updates through `setExtras`.
 */
export function createChatExtrasPlugin(): ChatExtrasHandle {
  const id = `chat-extras-${(counter += 1)}`;
  const extras = signal<LoopChatExtrasValue>({});
  const plugin = definePlugin({
    name: CHAT_EXTRAS_PLUGIN_NAME,
    displayName: 'Chat Extras',
    description: 'A host example’s live banner and footer status.',
    octicon: 'megaphone',
    emoji: '\u{1F4E3}',
    contributes: [contribution(LoopChatExtras, { id, extras }, { id })],
  });
  return {
    plugin,
    setExtras: value => {
      extras.value = value;
    },
  };
}

export default createChatExtrasPlugin;
