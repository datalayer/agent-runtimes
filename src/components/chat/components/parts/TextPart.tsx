/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Text message part display component.
 * Renders text content with markdown support, copy button, and regenerate action.
 *
 * @module components/chat/components/display/TextPart
 */

import type { UIMessage } from 'ai';
import { Text, IconButton } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { CopyIcon, SyncIcon } from '@primer/octicons-react';
import { Streamdown } from 'streamdown';
import { streamdownMarkdownStyles } from '../styles/streamdownStyles';

export interface TextPartProps {
  /** Text content to display */
  text: string;
  /** Parent message object */
  message: UIMessage;
  /** Whether this is the last part in the message */
  isLastPart: boolean;
  /** Callback to regenerate the message */
  onRegenerate: (id: string) => void;
}

/**
 * TextPart component for rendering text content with markdown support.
 *
 * Features:
 * - Markdown rendering via Streamdown
 * - Copy button for assistant messages
 * - Regenerate button for assistant messages
 * - Syntax highlighting for code blocks
 */
export function TextPart({
  text,
  message,
  isLastPart,
  onRegenerate,
}: TextPartProps) {
  const copy = (text: string) => {
    navigator.clipboard.writeText(text).catch((error: unknown) => {
      console.error('Error copying text:', error);
    });
  };

  return (
    <Box
      sx={{
        padding: 3,
        borderRadius: 2,
        backgroundColor:
          message.role === 'user' ? 'accent.subtle' : 'canvas.subtle',
        marginBottom: 2,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 2,
        }}
      >
        <Text
          sx={{
            fontWeight: 'bold',
            fontSize: 1,
            color: 'fg.muted',
            textTransform: 'uppercase',
          }}
        >
          {message.role === 'user' ? 'You' : 'Assistant'}
        </Text>
        {message.role === 'assistant' && isLastPart && (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <IconButton
              icon={SyncIcon}
              aria-label="Regenerate"
              size="small"
              variant="invisible"
              onClick={() => onRegenerate(message.id)}
            />
            <IconButton
              icon={CopyIcon}
              aria-label="Copy"
              size="small"
              variant="invisible"
              onClick={() => copy(text)}
            />
          </Box>
        )}
      </Box>
      <Box sx={streamdownMarkdownStyles}>
        <Streamdown>{text}</Streamdown>
      </Box>
    </Box>
  );
}

export default TextPart;
