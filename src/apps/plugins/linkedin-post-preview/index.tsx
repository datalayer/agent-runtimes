/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-linkedin-post-preview` — a post on the person's LinkedIn, as it
 * will stand there, above the chat's approval row: the text, its length
 * against what LinkedIn takes, the images, the post it answers, and the link
 * once out (`toolCards/postPreview`). Draws `post_to_linkedin` and `comment_on_linkedin`.
 *
 * @module apps/plugins/linkedin-post-preview
 */

import type { JSX } from 'react';
import type { ToolCallRenderContext } from '../../../types/chat';
import { defineToolCardPlugin } from '../../toolCards/kit';
import { PostPreviewCard } from '../../toolCards/postPreview';

export const LINKEDIN_POST_PREVIEW_PLUGIN_NAME =
  '@datalayer/loop-plugin-linkedin-post-preview';

export function LinkedInPostPreviewCard({
  context,
}: {
  context: ToolCallRenderContext;
}): JSX.Element {
  return <PostPreviewCard network="linkedin" context={context} />;
}

export const LinkedInPostPreviewPlugin = defineToolCardPlugin({
  id: 'linkedin-post-preview',
  displayName: 'LinkedIn post preview',
  description:
    'A post, reply or comment on LinkedIn as it will stand there, with its length and images, above its approval.',
  octicon: 'megaphone',
  emoji: '\u{1F4BC}',
  tools: ['post_to_linkedin', 'comment_on_linkedin'],
  Card: LinkedInPostPreviewCard,
});

export default LinkedInPostPreviewPlugin;
