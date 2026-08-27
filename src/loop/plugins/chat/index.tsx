/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The chat plugin: the first view, and the proof that chat is not special.
 *
 * @module loop/plugins/chat
 */

import { CommentDiscussionIcon } from '@primer/octicons-react';
import { contribution, defineExtension } from '@datalayer/reactor';
import { LoopCommand, LoopViewType } from '../../core';

export const ChatExtension = defineExtension({
  name: '@datalayer/loop-plugin-chat',
  contributes: [
    contribution(
      LoopViewType,
      {
        viewType: 'chat',
        title: 'Chat',
        icon: CommentDiscussionIcon,
        order: 0,
        load: () => import('./ChatView'),
      },
      { id: 'chat', order: 0 },
    ),
    contribution(
      LoopCommand,
      {
        name: 'chat',
        description: 'Show the conversation',
        group: 'Session',
        run: async ({ workspace }) => {
          workspace.setActiveViewType('chat');
        },
      },
      { id: 'chat' },
    ),
  ],
});

export default ChatExtension;
