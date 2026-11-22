/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/agent-plugin-chat-extras` — a live channel from a host example
 * into the Agent's conversation.
 *
 * An example that wraps a `AgentEmbed` in its own panels still has things to
 * say to the chat column that change over the life of the page: an error
 * banner it derives from its own state, the codemode toggle, the MCP and
 * codemode status the footer shows. {@link createChatExtrasPlugin} returns a
 * plugin to hand `AgentEmbed` and a `setExtras` the example calls whenever
 * those change — backed by a signal, so the chat view re-renders without the
 * plugin being rebuilt.
 *
 * ```tsx
 * const { plugin, setExtras } = useMemo(() => createChatExtrasPlugin(), []);
 * useEffect(() => setExtras({ errorBanner, codemodeEnabled }), […]);
 * <AgentEmbed plugins={[capacityPlugin, plugin]} … />
 * ```
 *
 * @module apps/plugins/chat-extras
 */

import { contribution, definePlugin, signal } from '@datalayer/reactor';
import type { ReactorPlugin } from '@datalayer/reactor';
import { AgentChatExtras, type AgentChatExtrasValue } from '../../core';
import { uiManifestOf } from '../../uiManifest';

export const CHAT_EXTRAS_PLUGIN_NAME = '@datalayer/agent-plugin-chat-extras';

export type ChatExtrasHandle = {
  plugin: ReactorPlugin<Record<string, never>, unknown, unknown>;
  /** Replace the live extras the chat view reads. */
  setExtras: (value: AgentChatExtrasValue) => void;
};

let counter = 0;

/**
 * A chat-extras plugin plus its setter. Call once per workspace (memoise it),
 * then push updates through `setExtras`.
 */
export function createChatExtrasPlugin(): ChatExtrasHandle {
  const id = `chat-extras-${(counter += 1)}`;
  const extras = signal<AgentChatExtrasValue>({});
  const plugin = definePlugin({
    name: CHAT_EXTRAS_PLUGIN_NAME,
    ...uiManifestOf('chat-extras'),
    contributes: [contribution(AgentChatExtras, { id, extras }, { id })],
  });
  return {
    plugin,
    setExtras: value => {
      extras.value = value;
    },
  };
}

export default createChatExtrasPlugin;
