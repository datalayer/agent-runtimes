/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An agent's words, as markdown: what the chat's messages draw them with
 * (`ChatMessageList`), and what the floating assistant's balloon draws its
 * current line with — one renderer, so a code block, a table or a list
 * looks the same wherever the words are read.
 *
 * @module chat/messages/ChatMarkdown
 */

import type { JSX } from 'react';
import { Box } from '@datalayer/primer-addons';
import { Streamdown } from 'streamdown';
import { REHYPE_PLUGINS_WITHOUT_HTML } from './markdownWithoutHtml';
import { streamdownMarkdownStyles } from '../styles/streamdownStyles';
import { normalizeAssistantMarkdown } from './assistantMarkdown';

/** How dense the chat's components draw: the chat's own, or the balloon's. */
export type ChatDensity = 'comfortable' | 'compact';

export function ChatMarkdown({
  text,
  density = 'comfortable',
}: {
  text: string;
  density?: ChatDensity;
}): JSX.Element {
  return (
    <Box
      data-chat-markdown=""
      sx={{
        ...streamdownMarkdownStyles,
        ...(density === 'compact'
          ? {
              lineHeight: 1.4,
              '& p': { marginTop: 0, marginBottom: '0.4em' },
              '& p:last-child': { marginBottom: 0 },
            }
          : {}),
      }}
    >
      <Streamdown rehypePlugins={REHYPE_PLUGINS_WITHOUT_HTML}>
        {normalizeAssistantMarkdown(text)}
      </Streamdown>
    </Box>
  );
}

export default ChatMarkdown;
