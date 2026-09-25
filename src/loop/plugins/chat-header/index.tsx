/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-chat-header` — the chat's title bar, as a plugin.
 *
 * The chat assembles the bar's full props — the agent's name, the kernel
 * indicator, the runtime status, the actions row — and offers them through
 * the {@link LoopChatHeader} point. This plugin is the standard taker: it
 * renders them with the chat's own `ChatBaseHeader`, loaded lazily so the
 * plugin's module stays a manifest.
 *
 * Untick it and the conversation loses its title bar and nothing else; a
 * host that wants a different bar contributes its own component to the same
 * point and receives the same fully assembled facts.
 *
 * @module loop/plugins/chat-header
 */

import type { JSX } from 'react';
import { Suspense, lazy } from 'react';
import { contribution, definePlugin } from '@datalayer/reactor';
import { LoopChatHeader, type LoopChatHeaderProps } from '../../core';

export const CHAT_HEADER_PLUGIN_NAME = '@datalayer/loop-plugin-chat-header';

const LazyHeaderView = lazy(() => import('./HeaderView'));

/** The lazy boundary, so the point's consumers need no Suspense of theirs. */
function HeaderView(props: LoopChatHeaderProps): JSX.Element {
  return (
    <Suspense fallback={null}>
      <LazyHeaderView {...props} />
    </Suspense>
  );
}

export const ChatHeaderPlugin = definePlugin({
  name: CHAT_HEADER_PLUGIN_NAME,
  displayName: 'Chat Header',
  description: 'The conversation’s title bar: agent, kernel, actions.',
  octicon: 'rows',
  emoji: '\u{1F3F7}\u{FE0F}',
  contributes: [
    contribution(
      LoopChatHeader,
      { id: 'chat-header', Component: HeaderView },
      { id: 'chat-header' },
    ),
  ],
});

export default ChatHeaderPlugin;
