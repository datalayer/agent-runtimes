/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-chat-view` — the bare conversation, one click away.
 *
 * The footer icon that clears the editor column: the view the selector used
 * to call "None", renamed to what it actually is. Requires the input-prompt
 * plugin, whose footer the icon sits in.
 *
 * @module loop/plugins/chat-view
 */

import { CommentDiscussionIcon } from '@primer/octicons-react';
import { NONE_EDITOR } from '../shell/editorChoice';
import { defineViewPlugin } from '../view-switch';

export const CHAT_VIEW_PLUGIN_NAME = '@datalayer/loop-plugin-chat-view';

export const ChatViewPlugin = defineViewPlugin({
  key: 'chat',
  viewId: NONE_EDITOR,
  displayName: 'Chat View',
  description: 'The conversation on its own, from the composer footer.',
  icon: CommentDiscussionIcon,
  tooltip: 'Show the chat',
  octicon: 'comment-discussion',
  emoji: '\u{1F4AC}',
  order: 10,
});

export default ChatViewPlugin;
