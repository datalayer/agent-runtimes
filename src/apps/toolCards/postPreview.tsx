/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A post as it will stand on its network, above the chat's approval row:
 * the text whole, its length against the network's limit, the images it
 * carries, the post it answers, and — once out — the link to it. Shared by
 * `x-post-preview`, `bluesky-post-preview` and `linkedin-post-preview`,
 * one plugin per network so that an agent declares only where it posts.
 *
 * The Approve and Reject stay the chat's (`defaultUI`): this card shows what
 * is approved, it never decides.
 *
 * @module apps/toolCards/postPreview
 */

import type { JSX } from 'react';
import { Label, Link, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import type { ToolCallRenderContext } from '../../types/chat';
import { record, safeImage, safeUrl, words, wordsList } from './kit';

export type PostNetwork = 'x' | 'bluesky' | 'linkedin';

/** What each network takes, as the runtime's tools refuse past it. */
export const POST_LIMITS: Record<
  PostNetwork,
  { name: string; chars: number; images: number }
> = {
  x: { name: 'X', chars: 280, images: 4 },
  bluesky: { name: 'Bluesky', chars: 300, images: 4 },
  linkedin: { name: 'LinkedIn', chars: 3000, images: 1 },
};

export const POST_PREVIEW_WORDS = {
  post: (network: string) => `Post on ${network}`,
  reply: (network: string) => `Reply on ${network}`,
  comment: (network: string) => `Comment on ${network}`,
  answering: 'Answering',
  length: (count: number, limit: number) => `${count} / ${limit}`,
  tooLong: (limit: number) => `Longer than the ${limit} characters it takes.`,
  images: (count: number) => (count === 1 ? '1 image' : `${count} images`),
  posted: 'See it posted',
} as const;

/** Characters as a person counts them (code points, not UTF-16 units). */
export function charactersOf(text: string): number {
  return Array.from(text).length;
}

export type PostPreview = {
  network: PostNetwork;
  kind: 'post' | 'reply' | 'comment';
  text: string;
  length: number;
  tooLong: boolean;
  images: string[];
  answering: string;
  postedUrl: string;
};

/** The post a call carries, and where it went once out. */
export function readPostPreview(
  network: PostNetwork,
  toolName: string,
  args: unknown,
  result: unknown,
): PostPreview {
  const given = record(args) ?? {};
  const text = typeof given.text === 'string' ? given.text : '';
  const images = [
    ...wordsList(given.images),
    ...(words(given.image) ? [words(given.image)] : []),
  ].filter(image => safeImage(image));
  const kind = /comment/.test(toolName)
    ? 'comment'
    : /reply/.test(toolName)
      ? 'reply'
      : 'post';
  const length = charactersOf(text);
  const answered = record(result);
  return {
    network,
    kind,
    text,
    length,
    tooLong: length > POST_LIMITS[network].chars,
    images,
    answering: kind === 'post' ? '' : words(given.post),
    postedUrl: answered
      ? safeUrl(answered.post_url) || safeUrl(answered.url)
      : '',
  };
}

export function PostPreviewCard({
  network,
  context,
}: {
  network: PostNetwork;
  context: ToolCallRenderContext;
}): JSX.Element {
  const preview = readPostPreview(
    network,
    context.toolName,
    context.args,
    context.result,
  );
  if (!preview.text) {
    return <>{context.defaultUI}</>;
  }
  const limit = POST_LIMITS[network];
  const title = POST_PREVIEW_WORDS[preview.kind](limit.name);
  return (
    <Box width="100%">
      <Box
        as="section"
        aria-label={title}
        my={2}
        p={3}
        border="1px solid"
        borderColor="border.default"
        borderRadius={2}
        bg="canvas.default"
        maxWidth={560}
        data-post-preview={network}
      >
        <Box
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          mb={2}
          gap={2}
        >
          <Label>{title}</Label>
          <Text
            sx={{
              fontSize: 0,
              fontFamily: 'mono',
              color: preview.tooLong ? 'danger.fg' : 'fg.muted',
            }}
          >
            {POST_PREVIEW_WORDS.length(preview.length, limit.chars)}
          </Text>
        </Box>
        {preview.answering ? (
          <Text
            as="div"
            sx={{
              fontSize: 0,
              color: 'fg.muted',
              mb: 1,
              wordBreak: 'break-all',
            }}
          >
            {POST_PREVIEW_WORDS.answering}: {preview.answering}
          </Text>
        ) : null}
        <Text
          as="p"
          sx={{
            m: 0,
            fontSize: 1,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {preview.text}
        </Text>
        {preview.images.length > 0 ? (
          <Box display="flex" gap={1} mt={2} flexWrap="wrap">
            {preview.images.slice(0, limit.images).map((image, index) => (
              <Box
                as="img"
                key={index}
                src={safeImage(image)}
                alt=""
                width={96}
                height={96}
                borderRadius={2}
                sx={{ objectFit: 'cover' }}
              />
            ))}
            <Text
              sx={{ fontSize: 0, color: 'fg.muted', alignSelf: 'flex-end' }}
            >
              {POST_PREVIEW_WORDS.images(preview.images.length)}
            </Text>
          </Box>
        ) : null}
        {preview.tooLong ? (
          <Text as="div" sx={{ mt: 2, fontSize: 0, color: 'danger.fg' }}>
            {POST_PREVIEW_WORDS.tooLong(limit.chars)}
          </Text>
        ) : null}
        {preview.postedUrl ? (
          <Link
            href={preview.postedUrl}
            target="_blank"
            rel="noreferrer"
            sx={{ display: 'inline-block', mt: 2, fontSize: 1 }}
          >
            {POST_PREVIEW_WORDS.posted}
          </Link>
        ) : null}
      </Box>
      {context.defaultUI}
    </Box>
  );
}
