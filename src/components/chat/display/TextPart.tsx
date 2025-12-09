/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import type { UIMessage } from 'ai';
import { Text, IconButton } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { CopyIcon, SyncIcon } from '@primer/octicons-react';
import { Streamdown } from 'streamdown';

interface ITextPartProps {
  text: string;
  message: UIMessage;
  isLastPart: boolean;
  onRegenerate: (id: string) => void;
}

export function TextPart({
  text,
  message,
  isLastPart,
  onRegenerate,
}: ITextPartProps) {
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
      <Box
        sx={{
          fontSize: 1,
          lineHeight: 1.6,
          '& > *:first-child': { marginTop: 0 },
          '& > *:last-child': { marginBottom: 0 },
          '& p': { marginTop: 0, marginBottom: '1em' },
          '& h1, & h2, & h3, & h4, & h5, & h6': {
            marginTop: '1em',
            marginBottom: '0.5em',
            fontWeight: 'bold',
          },
          '& ul, & ol': {
            marginTop: '0.5em',
            marginBottom: '0.5em',
            paddingLeft: '1.5em',
          },
          '& code': {
            backgroundColor: 'neutral.muted',
            padding: '2px 4px',
            borderRadius: 1,
            fontSize: '0.9em',
            fontFamily: 'mono',
          },
          '& pre': {
            backgroundColor: 'canvas.inset',
            padding: 3,
            borderRadius: 2,
            overflow: 'auto',
            marginTop: '1em',
            marginBottom: '1em',
            border: '1px solid',
            borderColor: 'border.default',
          },
          '& pre code': {
            backgroundColor: 'transparent',
            padding: 0,
            fontSize: '0.875em',
          },
          '& blockquote': {
            borderLeft: '3px solid',
            borderColor: 'border.default',
            paddingLeft: 3,
            marginLeft: 0,
            color: 'fg.muted',
          },
          '& a': {
            color: 'accent.fg',
            textDecoration: 'underline',
          },
          '& table': {
            width: '100%',
            borderCollapse: 'collapse',
            marginTop: '1em',
            marginBottom: '1em',
          },
          '& th, & td': {
            border: '1px solid',
            borderColor: 'border.default',
            padding: 2,
            textAlign: 'left',
          },
          '& th': {
            backgroundColor: 'canvas.subtle',
            fontWeight: 'bold',
          },
        }}
      >
        <Streamdown>{text}</Streamdown>
      </Box>
    </Box>
  );
}
