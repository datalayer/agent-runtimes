/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-x-post-preview` — a post on the person's X, as it
 * will stand there, above the chat's approval row: the text, its length
 * against what X takes, the images, the post it answers, and the link
 * once out (`toolCards/postPreview`). Draws `post_to_x` and `reply_on_x`.
 *
 * @module apps/plugins/x-post-preview
 */

import type { JSX } from 'react';
import type { ToolCallRenderContext } from '../../../types/chat';
import { defineToolCardPlugin } from '../../toolCards/kit';
import { PostPreviewCard } from '../../toolCards/postPreview';

export const X_POST_PREVIEW_PLUGIN_NAME =
  '@datalayer/loop-plugin-x-post-preview';

export function XPostPreviewCard({
  context,
}: {
  context: ToolCallRenderContext;
}): JSX.Element {
  return <PostPreviewCard network="x" context={context} />;
}

export const XPostPreviewPlugin = defineToolCardPlugin({
  id: 'x-post-preview',
  displayName: 'X post preview',
  description:
    'A post, reply or comment on X as it will stand there, with its length and images, above its approval.',
  octicon: 'megaphone',
  emoji: '\u{1D54F}',
  tools: ['post_to_x', 'reply_on_x'],
  Card: XPostPreviewCard,
});

export default XPostPreviewPlugin;
