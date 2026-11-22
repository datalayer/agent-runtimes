/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/agent-plugin-bluesky-post-preview` — a post on the person's Bluesky, as it
 * will stand there, above the chat's approval row: the text, its length
 * against what Bluesky takes, the images, the post it answers, and the link
 * once out (`toolCards/postPreview`). Draws `post_to_bluesky` and `reply_on_bluesky`.
 *
 * @module apps/plugins/bluesky-post-preview
 */

import type { JSX } from 'react';
import type { ToolCallRenderContext } from '../../../types/chat';
import { defineToolCardPlugin } from '../../toolCards/kit';
import { PostPreviewCard } from '../../toolCards/postPreview';

export const BLUESKY_POST_PREVIEW_PLUGIN_NAME =
  '@datalayer/agent-plugin-bluesky-post-preview';

export function BlueskyPostPreviewCard({
  context,
}: {
  context: ToolCallRenderContext;
}): JSX.Element {
  return <PostPreviewCard network="bluesky" context={context} />;
}

export const BlueskyPostPreviewPlugin = defineToolCardPlugin({
  id: 'bluesky-post-preview',
  displayName: 'Bluesky post preview',
  description:
    'A post, reply or comment on Bluesky as it will stand there, with its length and images, above its approval.',
  octicon: 'megaphone',
  emoji: '\u{1F98B}',
  tools: ['post_to_bluesky', 'reply_on_bluesky', 'create-post'],
  Card: BlueskyPostPreviewCard,
});

export default BlueskyPostPreviewPlugin;
